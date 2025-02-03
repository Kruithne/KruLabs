import package_json from './package.json';
import node_http from 'node:http';
import node_path from 'node:path';
import node_os from 'node:os';
import node_fs from 'node:fs/promises';
import { createHash } from 'crypto';
import default_config from './src/web/scripts/default_config.js';
import { PACKET, get_packet_name, build_packet, parse_packet, PACKET_TYPE, PACKET_UNK } from './src/web/scripts/packet.js';

import type { WebSocketHandler, ServerWebSocket, Subprocess } from 'bun';

// MARK: :constants
const PREFIX_WEBSOCKET = 'WEBSOCKET';
const PREFIX_OBS = 'OBS';
const PREFIX_HTTP = 'HTTP';

const OBS_RECONNECT_DELAY = 2500;

const HTTP_SERVE_DIRECTORY = './src/web';

const PARTIAL_DEFAULT_CHUNK = 2 * 1024 * 1024;

const PROJECT_STATE_DIRECTORY = './state';
const PROJECT_STATE_EXT = '.json';
const PROJECT_STATE_INDEX = node_path.join(PROJECT_STATE_DIRECTORY, 'index.json');
const SYSTEM_CONFIG_FILE = node_path.join(PROJECT_STATE_DIRECTORY, 'sys_config.json');

const VOLMGR_WIN_EXE = './volmgr/bin/Release/net8.0/win-x64/publish/volmgr.exe';

const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';

const CHAR_TAB = '\t';

const ARRAY_EMPTY = Object.freeze([]);

const OBS_EVENT_SUB = {
	NONE: 0,
	GENERAL: 1 << 0,
	CONFIG: 1 << 1,
	SCENES: 1 << 2,
	INPUTS: 1 << 3,
	TRANSITIONS: 1 << 4,
	FILTERS: 1 << 5,
	OUTPUTS: 1 << 6,
	SCENE_ITEMS: 1 << 7,
	MEDIA_INPUTS: 1 << 8,
	VENDORS: 1 << 9,
	USER_INTERFACE: 1 << 10,
	ALL: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10),
	INPUT_VOLUME_METERS: 1 << 16,
	INPUT_ACTIVE_STATE_CHANGED: 1 << 17,
	INPUT_SHOW_STATE_CHANGED: 1 << 18,
	SCENE_ITEM_TRANSFORM_CHANGED: 1 << 19
};

const OBS_OP_CODE = {
	HELLO: 0,
	IDENTIFY: 1,
	IDENTIFIED: 2,
	REIDENTIFY: 3,
	EVENT: 5,
	REQUEST: 6,
	REQUEST_RESPONSE: 7,
	REQUEST_BATCH: 8,
	REQUEST_BATCH_RESPONSE: 9
};

const OBS_OP_CODE_TO_STR = Object.fromEntries(
	Object.entries(OBS_OP_CODE).map(([key, value]) => [value, key])
) as Record<OBSOpCode, string>;

// MARK: :errors
class AssertionError extends Error {
	constructor(message: string, key: string) {
		super('"' + key + '" ' + message);
		this.name = 'AssertionError';
	}
}

// MARK: :types
type CLIValue = string | boolean | number;
type Unbox<T> = T extends Array<infer U> ? U : T;

type ClientSocketData = { sck_id: string };
type ClientSocket = ServerWebSocket<ClientSocketData>;

type PacketTarget = ClientSocket | Iterable<ClientSocket>;
type PacketDataType = null | object | string | number;
type Packet = { id: number, data: null|object|string };

type SystemConfig = typeof default_config;

type OBSOpCode = typeof OBS_OP_CODE[keyof typeof OBS_OP_CODE];

type OBSMessageData = Record<string, any>;

interface OBSMessage {
	op: number;
	d: OBSMessageData;
}

// MARK: :state
const CLI_ARGS = {
	port: 19531,
	verbose: false
} as Record<string, CLIValue>;

const socket_packet_listeners = new Map<number, ClientSocket[]>();
const socket_clients = new Set<ClientSocket>();

let next_client_id = 1;

let system_config = Object.assign({}, default_config);

let obs_identified = false;
let obs_socket: WebSocket|null = null;
let obs_reconnect_timer: Timer|null = null;
let obs_last_disconnect_code = -1;

// MARK: :prototype
declare global {
	interface Map<K,V> {
		get_set_arr(key: K, value: Unbox<V>): V[];
	}
}

Map.prototype.get_set_arr = function(key: any, value: any) {
	let arr = this.get(key);
	if (arr)
		arr.push(value);
	else
		this.set(key, [value]);
	return arr;
}

// MARK: :log

/** Prints a message to stdout. Sections can be coloured using {curly brace} syntax. */
function log_info(message: string, prefix = 'INFO') {
	const formatted_message = (`[{${prefix}}] ` + message).replace(/\{([^}]+)\}/g, `\x1b[36m$1\x1b[0m`);
	process.stdout.write(formatted_message + '\n');
}

/** Prints a message to stdout if --verbose is enabled. Sections can be coloured using {curly brace} syntax */
function log_verbose(message: string, prefix = 'DEBUG') {
	if (!CLI_ARGS.verbose)
		return;

	log_info(message, prefix);
}

/** Prints a warning message (no formatting) to stdout. */
function log_warn(message: string) {
	process.stdout.write('\x1b[93mWARNING: \x1b[31m' + message + '\x1b[0m\n');
}

// MARK: :volmgr
let volmgr_proc: Subprocess<"pipe", "pipe", "inherit"> | null = null;

function volmgr_init() {
	if (process.platform !== 'win32')
		return log_warn(`Volume control not supported on {${process.platform}}`);

	const exe = Bun.file(VOLMGR_WIN_EXE);
	if (exe.size === 0) {
		log_warn('{volmgr} not compiled, volume control disabled');
		return;
	}

	volmgr_proc = Bun.spawn([VOLMGR_WIN_EXE], {
		stdin: "pipe",
		stdout: "pipe"
	});

	log_verbose(`{volmgr} sub-process started with PID {${volmgr_proc.pid}}`);
}

function volmgr_send(msg: object) {
	if (volmgr_proc === null)
		return;

	volmgr_proc.stdin.write(JSON.stringify(msg) + "\n");
	volmgr_proc.stdin.flush();
}

async function get_system_volume() {
	if (volmgr_proc === null)
		return 1.0;

	try {
		volmgr_send({ cmd: 'get' });

		const decoder = new TextDecoder();
		for await (const chunk of volmgr_proc.stdout)
			return JSON.parse(decoder.decode(chunk)).value;

		throw new Error('no data received from sub-process');
	} catch (e) {
		const error = e as Error;
		log_warn(`volmgr failed to get system volume due to {${error.name}}: ${error.message}`);
	}
	
	return 1.0;
}

function set_system_volume(value: number) {
	if (volmgr_proc === null)
		return;

	volmgr_send({ cmd: 'set', value });
}
// MARK: :obs
function obs_connect() {
	obs_disconnect();

	obs_socket = new WebSocket(system_config.obs_host);
	obs_socket.addEventListener('message', event => {
		try {
			const event_data = event.data as string;
			validate_string(event_data, 'event.data');

			const message: OBSMessage = JSON.parse(event_data);
			const message_size = Buffer.byteLength(event_data);

			log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} size {${format_file_size(message_size)}}`, PREFIX_OBS);

			if (message.op === OBS_OP_CODE.HELLO) {
				const auth = message.d.authentication;
				const payload: OBSMessageData = {
					rpcVersion: message.d.rpcVersion,
					eventSubscriptions: OBS_EVENT_SUB.ALL
				};

				if (auth) {
					payload.authentication = obs_create_auth_string(
						system_config.obs_password,
						auth.salt,
						auth.challenge
					);
				}

				obs_send(OBS_OP_CODE.IDENTIFY, payload);
			} else if (message.op === OBS_OP_CODE.IDENTIFIED) {
				obs_identified = true;
				log_verbose(`Successfully identified with OBS host`, PREFIX_OBS);
			}
		} catch (e) {
			const error = e as Error;
			log_warn(`Failed to parse OBS message due to ${error.name}: ${error.message}`);
		}
	});

	obs_socket.addEventListener('open', () => {
		obs_last_disconnect_code = 0;
		obs_send_status();
	});

	obs_socket.addEventListener('close', event => {
		obs_identified = false;
		obs_socket = null;

		log_info(`Disconnected from host: {${event.code}} ${event.reason}`, PREFIX_OBS);
		obs_last_disconnect_code = event.code;

		obs_send_status();

		if (system_config.obs_enable) {
			log_info(`Reconnecting to OBS host in {${OBS_RECONNECT_DELAY}ms}`, PREFIX_OBS);
			obs_reconnect_timer = setTimeout(() => obs_connect(), OBS_RECONNECT_DELAY);
		}
	});

	obs_socket.addEventListener('error', error => {
		log_warn(`${error.type} raised in OBS socket: ${error.message}`);
	});
}

function obs_disconnect() {
	if (obs_reconnect_timer !== null)
		clearTimeout(obs_reconnect_timer);

	obs_socket?.close();

	obs_socket = null;
	obs_identified = false;
}

function obs_send(op: number, message: OBSMessageData) {
	const payload = { op, d: message } as OBSMessage;
	const payload_json = JSON.stringify(payload);
	const payload_size = Buffer.byteLength(payload_json);

	obs_socket?.send(payload_json);

	log_verbose(`SEND {${OBS_OP_CODE_TO_STR[op]}} size {${format_file_size(payload_size)}}`, PREFIX_OBS);
}

function obs_send_status() {
	send_object(PACKET.OBS_STATUS, obs_last_disconnect_code);
}

function obs_create_auth_string(password: string, salt: string, challenge: string): string {
	const secret = createHash('sha256').update(password + salt).digest('base64');
	return createHash('sha256').update(secret + challenge).digest('base64');
}

// MARK: :config
function update_system_config(config: SystemConfig) {
	system_config = config;
	config.obs_enable ? obs_connect() : obs_disconnect();
}

async function load_system_config() {
	try {
		const config_file = Bun.file(SYSTEM_CONFIG_FILE);
		const saved_config = await config_file.json();

		update_system_config(Object.assign({}, default_config, saved_config));

		log_info('successfully loaded system configuration');
		for (const [key, value] of Object.entries(system_config))
			log_info(`\t{${key}} -> {${value}}`);
	} catch (e) {
		log_warn('Failed to load system configuration, using defaults');
	}
}

async function save_system_config() {
	try {
		const bytes_written = await Bun.write(SYSTEM_CONFIG_FILE, JSON.stringify(system_config));
		log_verbose(`Saved system configuration [{${format_file_size(bytes_written)}}]`);
	} catch (e) {
		const error = e as Error;
		log_warn(`Failed to save system configuration: ${error.message}`);
	}
}

// MARK: :projects
async function load_project_index() {
	const index_file = Bun.file(PROJECT_STATE_INDEX);

	if (await index_file.exists())
		return await index_file.json();

	return {};
}

async function save_project_index(index: any) {
	await Bun.write(PROJECT_STATE_INDEX, JSON.stringify(index, null, CHAR_TAB));
}

async function update_project_index(project_id: string, project_name: string) {
	const index = await load_project_index();
	index[project_id] = { name: project_name, last_saved: Date.now() };
	await save_project_index(index);

	log_verbose(`{${project_id}} updated in project index`);
}

async function delete_project_index_entry(project_id: string) {
	const index = await load_project_index();
	if (project_id in index) {
		delete index[project_id];
		await save_project_index(index);

		log_verbose(`{${project_id}} deleted from project index`);
	}
}

// MARK: :packets
function register_packet_listener(ws: ClientSocket, packets: number[]) {
	for (const packet_id of packets)
		socket_packet_listeners.get_set_arr(packet_id, ws);

	if (CLI_ARGS.verbose) {
		const packet_names = packets.map(e => '{' + get_packet_name(e) + '}').join(',');
		log_verbose(`{${ws.data.sck_id}} registered for packets [${packet_names}]`);
	}
}

function unregister_packet_listener(ws: ClientSocket, packet_id: number) {
	const listeners = socket_packet_listeners.get(packet_id);
	if (listeners !== undefined) {
		const listener_index = listeners.indexOf(ws);
		if (listener_index > -1) {
			listeners.splice(listener_index, 1);
			log_verbose(`{${ws.data.sck_id}} unregistered from {${get_packet_name(packet_id)}}`);
		}
	}
}

function remove_listeners(ws: ClientSocket) {
	let removed = 0;
	for (const listener_array of socket_packet_listeners.values()) {
		const index = listener_array.indexOf(ws);
		if (index !== -1) {
			listener_array.splice(index, 1);
			removed++;
		}
	}
	
	log_verbose(`Removed {${removed}} listeners from client {${ws.data.sck_id}}`);
}

function send_packet(ws: PacketTarget|null, packet_id: number, packet_type: number, data: PacketDataType, originator: ClientSocket|null) {
	const packet = build_packet(packet_id, packet_type, data);
	const targets = ws === null ? get_listening_clients(packet_id) : Array.isArray(ws) ? ws : [ws];
	
	for (const socket of targets) {
		if (socket === originator)
			continue;

		socket.sendBinary(packet);
		log_verbose(`SEND {${get_packet_name(packet_id)}} [{${packet_id}}] to {${socket.data.sck_id}} size {${format_file_size(packet.byteLength)}}`, PREFIX_WEBSOCKET);
	}
}

function send_string(packet_id: number, str: string, ws: PacketTarget|null = null, originator: ClientSocket|null = null) {
	send_packet(ws, packet_id, PACKET_TYPE.STRING, str, originator);
}

function send_object(packet_id: number, obj: object | number, ws: PacketTarget|null = null, originator: ClientSocket|null = null) {
	send_packet(ws, packet_id, PACKET_TYPE.OBJECT, obj, originator);
}

function send_binary( packet_id: number, data: ArrayBuffer, ws: PacketTarget|null = null, originator: ClientSocket|null = null) {
	send_packet(ws, packet_id, PACKET_TYPE.BINARY, data, originator);
}

function send_empty(packet_id: number, ws: PacketTarget|null = null, originator: ClientSocket|null = null) {
	send_packet(ws, packet_id, PACKET_TYPE.NONE, null, originator);
}

function get_listening_clients(packet_id: number) {
	const listeners = socket_packet_listeners.get(packet_id);
	if (listeners && listeners.length > 0)
		return listeners;

	return ARRAY_EMPTY;
}

function get_all_clients() {
	return socket_clients;
}

function generate_socket_id() {
	if (next_client_id === Number.MAX_SAFE_INTEGER)
		next_client_id = 1;

	return 'SCK-' + (next_client_id++);
}

async function handle_packet(ws: ClientSocket, packet_id: number, packet_data: any, packet_type: number) {
	if (packet_id === PACKET.REQ_REGISTER) {
		const packets = validate_typed_array<number>(packet_data?.packets, TYPE_NUMBER, 'packets');
		register_packet_listener(ws, packets);
	} else if (packet_id === PACKET.REQ_UNREGISTER) {
		const packet_id = validate_number(packet_data?.packet_id, 'packet_id');
		unregister_packet_listener(ws, packet_id);
	} else if (packet_id === PACKET.REQ_SAVE_PROJECT) {
		try {
			const project_state = validate_object(packet_data?.state, 'state');
			let project_id = packet_data?.id ?? null;

			if (typeof project_id !== TYPE_STRING)
				project_id = Bun.randomUUIDv7();

			const file_path = get_project_state_file(project_id);
			const bytes = await Bun.write(file_path, JSON.stringify(project_state, null, CHAR_TAB));

			const project_name = project_state.name ?? 'Unknown Project';
			await update_project_index(project_id, project_name);

			log_info(`Saved project {${project_id}} ({${project_name}}) with {${format_file_size(bytes)}}`);

			send_object(PACKET.ACK_SAVE_PROJECT, {
				id: project_id,
				success: true
			}, ws);
		} catch (e) {
			// this error is caught and re-thrown so we can inform the client here to prevent potential data-loss
			// other operations can simply fail to respond, but saving needs extra safety guarantees
			send_object(PACKET.ACK_SAVE_PROJECT, { success: false }, ws);
			throw e;
		}
	} else if (packet_id === PACKET.REQ_LOAD_PROJECT) {
		const project_id = validate_string(packet_data?.id, 'id');
		const project_file = Bun.file(get_project_state_file(project_id));
		
		try {
			const project_state = await project_file.json();
			send_object(PACKET.ACK_LOAD_PROJECT, { success: true, state: project_state }, ws);
		} catch (e) {
			send_object(PACKET.ACK_LOAD_PROJECT, { success: false }, ws);
			throw e;
		}
	} else if (packet_id === PACKET.REQ_DELETE_PROJECT) {
		const project_id = validate_string(packet_data?.id, 'id');
		const project_file_path = get_project_state_file(project_id);

		await node_fs.unlink(project_file_path);
		await delete_project_index_entry(project_id);

		send_empty(PACKET.ACK_DELETE_PROJECT, ws);
	} else if (packet_id === PACKET.REQ_PROJECT_LIST) {
		const index = await load_project_index();
		const project_list = [];

		for (const [id, value] of Object.entries(index)) {
			const entry = value as Record<string, any>;
			project_list.push({ id, name: entry.name, last_saved: entry.last_saved });
		}

		send_object(PACKET.ACK_PROJECT_LIST, { projects: project_list });
	} else if (packet_id === PACKET.REQ_SERVER_ADDR) {
		send_string(PACKET.ACK_SERVER_ADDR, get_local_ipv4(), ws);
	} else if (packet_id === PACKET.SET_SYSTEM_VOLUME) {
		validate_number(packet_data, 'packet_data');
		set_system_volume(packet_data);
	} else if (packet_id === PACKET.REQ_CLIENT_COUNT) {
		send_object(PACKET.INFO_CLIENT_COUNT, socket_clients.size);
	} else if (packet_id === PACKET.REQ_SYSTEM_CONFIG) {
		send_object(PACKET.ACK_SYSTEM_CONFIG, system_config, ws);
	} else if (packet_id === PACKET.UPDATE_SYSTEM_CONFIG) {
		validate_object(packet_data, 'data');
		update_system_config(packet_data);

		save_system_config();
	} else {
		// dispatch all other packets to listeners
		const listeners = get_listening_clients(packet_id);
		if (packet_type === PACKET_TYPE.NONE)
			send_empty(packet_id, listeners, ws);
		else if (packet_type === PACKET_TYPE.BINARY)
			send_binary(packet_id, packet_data, listeners, ws);
		else if (packet_type === PACKET_TYPE.STRING)
			send_string(packet_id, packet_data, listeners, ws);
		else if (packet_type === PACKET_TYPE.OBJECT)
			send_object(packet_id, packet_data, listeners, ws);
	}
}

// MARK: :websocket
const websocket_handlers: WebSocketHandler<ClientSocketData> = {
	async message(ws: ClientSocket, message: string|Buffer) {
		let packet_name = PACKET_UNK;
		let packet_id = 0;

		try {
			if (!(message instanceof ArrayBuffer))
				throw new Error('Socket sent non-binary payload');

			const [packet, packet_type] = parse_packet(message) as [Packet, number];
			packet_id = packet.id;
			packet_name = get_packet_name(packet_id);

			if (packet_name === PACKET_UNK)
				throw new Error('Unknown packet ID ' + packet_id);

			log_verbose(`RECV {${packet_name}} [{${packet_id}}] from {${ws.data.sck_id}} size {${format_file_size(message.byteLength)}}`, PREFIX_WEBSOCKET);
			await handle_packet(ws, packet_id, packet.data, packet_type);
		} catch (e) {
			const err = e as Error;
			log_warn(`${err.name} processing ${packet_name} [${packet_id}] from ${ws.data.sck_id}: ${err.message}`);
		}
	},
	
	open(ws: ClientSocket) {
		ws.data = { sck_id: generate_socket_id() };
		ws.binaryType = 'arraybuffer';
		log_info(`socket {${ws.data.sck_id}} connected from {${ws.remoteAddress}}`, PREFIX_WEBSOCKET);
		socket_clients.add(ws);
		send_object(PACKET.INFO_CLIENT_COUNT, socket_clients.size);
	},

	close(ws: ClientSocket, code: number, reason: string) {
		log_info(`socket {${ws.data.sck_id}} disconnected {${code}} {${reason}}`, PREFIX_WEBSOCKET);
		socket_clients.delete(ws);
		remove_listeners(ws);
		send_object(PACKET.INFO_CLIENT_COUNT, socket_clients.size);
	}
}

// MARK: :http

/** Returns a plain-text Response object for the given HTTP code. */
function http_response(status: number): Response {
	return new Response(node_http.STATUS_CODES[status], { status });
}

/** Handles an error within the HTTP sserver. */
function http_error_handler(error: Error): Response {
	log_warn(`Unhandled ${error.name} in http_request_handler (${error.message})`);
	return http_response(500);
}

/** Handles an incoming Request and returns a Response. */
async function http_request_handler(req: Request): Promise<Response|undefined> {
	const url = new URL(req.url);
	let pathname = url.pathname;

	if (pathname === '/api/pipe') {
		server.upgrade(req);
		return;
	}

	if (node_path.extname(pathname) === '')
		pathname += '.html';

	const file_path = node_path.join(HTTP_SERVE_DIRECTORY, pathname);

	const file = Bun.file(file_path);
	if (!await file.exists()) {
		log_warn('Requested HTTP resource not found: ' + pathname);
		return http_response(404); // Not Found
	}

	// range requests for streamed content
	const range_header = req.headers.get('range');
	if (range_header !== null) {
		const match = range_header.match(/bytes=(\d*)-(\d*)/);

		if (match !== null) {
			const start = parseInt(match[1], 10);
			const end = match[2] ? parseInt(match[2], 10) : Math.min(start + PARTIAL_DEFAULT_CHUNK, file.size - 1);
			const chunk_size = (end - start) + 1;

			log_verbose(`{206} Partial Content {${pathname}} ({${start}}-{${end}}/{${file.size}}) {${format_file_size(chunk_size)}}`, PREFIX_HTTP);

			return new Response(file.slice(start, end + 1), { status: 206, headers: {
				'Content-Range': `bytes ${start}-${end}/${file.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': chunk_size.toString(),
				'Content-Type': file.type
			}});
		}
	}

	log_verbose(`{200} OK {${pathname}}`, PREFIX_HTTP);
	return new Response(file, { status: 200 });
}

// MARK: :assert
function validate_typed_array<T>(arr: any, elem_type: string, key: string): Array<T> {
	if (!Array.isArray(arr))
		throw new AssertionError(`expected array`, key);

	for (let i = 0, n = arr.length; i < n; i++) {
		if (typeof arr[i] !== elem_type)
			throw new AssertionError(`index [${i}] expected ${elem_type}`, key);
	}

	return arr as Array<T>;
}

function validate_object(obj: any, key: string): Record<string, any> {
	if (obj === null || typeof obj !== TYPE_OBJECT)
		throw new AssertionError('expected object', key);

	return obj;
}

function validate_string(str: any, key: string): string {
	if (typeof str !== TYPE_STRING)
		throw new AssertionError('expected string', key);

	return str;
}

function validate_number(num: any, key: string): number {
	if (typeof num !== TYPE_NUMBER)
		throw new AssertionError('expected number', key);

	return num;
}

// MARK: :general
function print_service_links(...paths: string[]) {
	let longest_length = 0;
	for (const path of paths)
		longest_length = Math.max(longest_length, path.length);

	log_info('Service links:');
	for (const path of paths)
		log_info(`    {${path.padStart(longest_length, ' ')}} :: {http://localhost:${server.port}/${path}}`);
}

/** Returns file size as a human-readable string. Supports up to megabytes. */
function format_file_size(size: number): string {
	if (size < 1024)
		return `${size}b`;

	if (size < 1048576)
		return `${(size / 1024).toFixed(1)}kb`;

	return `${(size / 1048576).toFixed(1)}mb`;
 }

 function get_project_state_file(project_id: string): string {
	return node_path.join(PROJECT_STATE_DIRECTORY, project_id + PROJECT_STATE_EXT);
 }

 function get_local_ipv4(): string {
	const interfaces = node_os.networkInterfaces();
	for (const interface_name in interfaces) {
		const interface_info = interfaces[interface_name];
		const ipv4 = interface_info?.find(info => info.family === 'IPv4' && !info.internal && !info.address.startsWith('127.'));

		if (ipv4)
			return ipv4.address;
	}
	return 'IPv4 Unknown';
 }

// MARK: :init
// command line arguments
const args = process.argv.slice(2);

for (const arg of args) {
	let [key, value] = arg.split('=', 2) as [string, string];
	key = key.replace(/^-+/, '').toLowerCase();

	const default_value = CLI_ARGS[key];

	if (default_value === undefined) {
		log_warn(`Uknown command line argument ${key}`);
		continue;
	}

	if (value === undefined)
		value = 'true';

	const expected_value_type = typeof default_value;
	if (expected_value_type === 'number') {
		const float_value = parseFloat(value);

		if (!isNaN(float_value))
			CLI_ARGS[key] = float_value;
		else
			log_warn(`Invalid number value for command line argument ${key}`);
	} else if (expected_value_type === 'boolean') {
		CLI_ARGS[key] = !!value;
	} else {
		CLI_ARGS[key] = value;
	}
}

// server init
await load_system_config();

const server = Bun.serve({
	port: CLI_ARGS.port as number,
	development: false,
	fetch: http_request_handler,
	error: http_error_handler,
	websocket: websocket_handlers
});

log_info(`KruLabs {v${package_json.version}} server initiated`);
log_info(`Web server running on port {${server.port}}`);

if (CLI_ARGS.verbose)
	log_warn('Verbose logging enabled (--verbose)');

print_service_links('controller', 'remote');

volmgr_init();