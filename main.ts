import package_json from './package.json';
import node_os from 'node:os';
import node_http from 'node:http';
import node_path from 'node:path';
import node_fs from 'node:fs';
import { packet, get_packet_name } from './src/web/scripts/packet.js';

import type { WebSocketHandler, ServerWebSocket } from 'bun';

// MARK: :constants
const PREFIX_WEBSOCKET = 'WEBSOCKET';
const PREFIX_HTTP = 'HTTP';

const HTTP_SERVE_DIRECTORY = './src/web';

const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';

// MARK: :types
type CLIValue = string | boolean | number;

type Unbox<T> = T extends Array<infer U> ? U : T;

// MARK: :state
const CLI_ARGS = {
	port: 19531,
	verbose: false
} as Record<string, CLIValue>;

const socket_packet_listeners = new Map<number, ServerWebSocket[]>();
const socket_clients = new Set<ServerWebSocket>();

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

// MARK: :packets
function register_packet_listener(ws: ServerWebSocket, packets: number[]) {
	for (const packet_id of packets)
		socket_packet_listeners.get_set_arr(packet_id, ws);

	if (CLI_ARGS.verbose) {
		const packet_names = packets.map(e => '{' + get_packet_name(e) + '}').join(',');
		log_verbose(`{${ws.remoteAddress}} registered for packets [${packet_names}]`);
	}
}

function remove_listeners(ws: ServerWebSocket) {
	let removed = 0;
	for (const listener_array of socket_packet_listeners.values()) {
		const index = listener_array.indexOf(ws);
		if (index !== -1) {
			listener_array.splice(index, 1);
			removed++;
		}
	}
	
	log_verbose(`Removed {${removed}} listeners from client {${ws.remoteAddress}}`);
}

// MARK: :websocket
const websocket_handlers: WebSocketHandler = {
	message(ws: ServerWebSocket, message: string | Buffer) {
		// todo: support different payload types
		const payload = JSON.parse(message as string); // todo: gracefully handle error

		// todo: handle unknown packet ID?
		const packet_id = payload.id;
		const packet_name = get_packet_name(packet_id);

		log_verbose(`RECV {${packet_name}} [{${packet_id}}] from {${ws.remoteAddress}}`, PREFIX_WEBSOCKET);

		const data = payload.data;
		try {
			if (packet_id === packet.REQ_REGISTER) {
				assert_typed_array(data.packets, TYPE_NUMBER, 'packets');
				register_packet_listener(ws, data.packets);
			}
		} catch (e) {
			const err = e as Error;
			log_warn(`${err.name} processing ${packet_name} [${packet_id}] from ${ws.remoteAddress}: ${err.message}`);
		}
	},
	
	open(ws: ServerWebSocket) {
		log_info(`client {${ws.remoteAddress}} connected`, PREFIX_WEBSOCKET);
		socket_clients.add(ws);
	},

	close(ws: ServerWebSocket, code: number, reason: string) {
		log_info(`client disconnected {${code}} {${reason}}`, PREFIX_WEBSOCKET);
		socket_clients.delete(ws);
		remove_listeners(ws);
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
		web_server.upgrade(req);
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
			const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
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
function assert_typed_array(arr: any, elem_type: string, key: string) {
	if (!Array.isArray(arr))
		throw new Error(`"${key}" expected array`);

	for (let i = 0, n = arr.length; i < n; i++) {
		if (typeof arr[i] !== elem_type)
			throw new Error(`"${key}" index [${i}] expected ${elem_type}`);
	}
}

// MARK: :general
function print_service_links(...paths: string[]) {
	let longest_length = 0;
	for (const path of paths)
		longest_length = Math.max(longest_length, path.length);

	log_info('Service links:');
	for (const path of paths)
		log_info(`    {${path.padStart(longest_length, ' ')}} :: {http://localhost:${web_server.port}/${path}}`);
}

/** Returns file size as a human-readable string. Supports up to megabytes. */
function format_file_size(size: number): string {
	if (size < 1024)
		return `${size}b`;

	if (size < 1048576)
		return `${(size / 1024).toFixed(1)}kb`;

	return `${(size / 1048576).toFixed(1)}mb`;
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
const web_server = Bun.serve({
	port: CLI_ARGS.port as number,
	development: false,
	fetch: http_request_handler,
	error: http_error_handler,
	websocket: websocket_handlers
});

log_info(`KruLabs {v${package_json.version}} server initiated on port {${web_server.port}}`);

if (CLI_ARGS.verbose)
	log_warn('Verbose logging enabled (--verbose)');

print_service_links('controller', 'remote', 'projector');