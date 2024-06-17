import package_json from './package.json';
import node_os from 'node:os';
import node_http from 'node:http';
import node_path from 'node:path';
import node_fs from 'node:fs';

const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_ORANGE = '\x1b[33m';

const STATE_MEMORY_FILE = './internal_state.json';
const VALID_CLI_ARGS = ['port'];

const SOURCES_DIRECTORY = './src/web/sources';

const CLIENT_BLENDER = 1 << 1;
const CLIENT_CONTROLLER = 1 << 2;
const CLIENT_PROJECTOR = 1 << 3;

const CLIENT_LABELS = {
	[CLIENT_BLENDER]: 'blender',
	[CLIENT_CONTROLLER]: 'controller',
	[CLIENT_PROJECTOR]: 'projector'
};

const cli_args = new Map();
let state_memory = {};

const client_sockets = new Map();

// scene state
let active_scene = 'SCENE_NONE';
let is_live_go = false;
let live_position = 0;
let last_sync_time = null;

let active_cue_stack = [];
let cue_stack_index = 0;

/**
 * @param {string} message
 * @param {string} color
 * @param {string} prefix
 */
function log(message, color, prefix) {
	const formatted_message = (`[{${prefix}}] ` + message).replace(/\{([^}]+)\}/g, `${color}$1\x1b[0m`);
	process.stdout.write(formatted_message + '\n');
}

/**
 * @param {string} message
 */
function log_error(message) {
	log(message, ANSI_RED, 'ERROR');
}

/**
 * @param {string} message
 */
function log_info(message) {
	log(message, ANSI_CYAN, 'INFO');
}

/**
 * @param {string} message
 */
function log_ok(message) {
	log(message, ANSI_GREEN, 'OK');
}

/**
 * @param {string} message
 */
function log_warn(message) {
	log(message, ANSI_ORANGE, 'WARN');
}

function print_ipv4_addresses() {
	const interfaces = node_os.networkInterfaces();
	const entries = Object.entries(interfaces);

	log_ok(`found {${entries.length}} network interfaces`);

	for (const [interface_name, addresses] of entries) {
		if (addresses === undefined)
			continue;

		for (const address of addresses) {
			if (!address.internal && address.family === 'IPv4')
				log_info(`{${interface_name}} has IPv4 address {${address.address}}`);
		}
	}
}

/**
 * @param {number} status
 * @returns {Response}
 */
function http_response(status) {
	return new Response(node_http.STATUS_CODES[status], { status });
}

/**
 * @param {WebSocket} socket
 * @param {string} reason
 */
function close_socket(socket, reason) {
	socket.close();
	log_warn(`web socket forcibly closed: {${reason}}`);
}

/**
 * @param {WebSocket} socket
 * @param {string} message
 */
function warn_socket(socket, message) {
	log_warn(`{${socket.remoteAddress}}: ${message}`);
	send_socket_message(socket, 'SMSG_WARN', { message });
}

/**
 * @param {WebSocket} ws 
 * @returns {string}
 */
function get_socket_labels(ws) {
	const identity = client_sockets.get(ws);

	const labels = [];

	for (const [flag, label] of Object.entries(CLIENT_LABELS)) {
		if (identity & flag)
			labels.push('{' + label + '}');
	}

	return labels.join(' | ');
}

/**
 * @param {WebSocket} socket
 * @param {number} op
 * @param {Record<string, any>} data
 */
function send_socket_message(socket, op, data = {}) {
	socket.send(JSON.stringify({ op, ...data }));
}

/**
 * @param {number} filter 
 * @param {number} op
 * @param {Record<string, any>} data 
 */
function send_socket_message_filtered(filter, op, data = {}) {
	const payload = JSON.stringify({ op, ...data });

	for (const [socket, identity] of client_sockets) {
		if (identity > 0 && identity & filter)
			socket.send(payload);
	}
}

/**
 * @param {number} op
 * @param {Record<string, any>} data 
 */
function send_socket_message_all(op, data = {}) {
	const payload = JSON.stringify({ op, ...data });

	for (const [socket, identity] of client_sockets)
		if (identity > 0)
			socket.send(payload);
}

/**
 * @returns {Record<string, any> | undefined}
 */
function get_active_scene() {
	if (active_scene === 'SCENE_NONE')
		return undefined;

	return state_memory.scenes.find(scene => scene.name === active_scene);
}

async function save_memory() {
	try {
		await Bun.write(STATE_MEMORY_FILE, JSON.stringify(state_memory, null, 4));
	} catch (e) {
		log_error(`failed to save internal state memory to {${STATE_MEMORY_FILE}}; data loss may occur`);
	}
}

/**
 * @returns {number}
 */
function get_live_position() {
	if (last_sync_time !== null)
		return live_position + (Date.now() - last_sync_time);

	return live_position;
}

function is_current_cue_passed() {
	return active_cue_stack[cue_stack_index]?.position <= get_live_position();
}

function update_cue_stack() {
	let index_changed = false;
	while (cue_stack_index < active_cue_stack.length && is_current_cue_passed()) {
		cue_stack_index++;
		index_changed = true;
	}

	if (index_changed) {
		send_socket_message_all('SMSG_CUE_INDEX_CHANGED', { cue_stack_index });

		const triggered_cue = active_cue_stack[cue_stack_index - 1];
		const trigger_type = triggered_cue?.type;
		if (trigger_type === 'HOLD') {
			live_hold();
		}
	}
}

function live_hold() {
	if (is_live_go) {
		is_live_go = false;

		live_position = get_live_position();
		last_sync_time = null;

		send_socket_message_all('SMSG_LIVE_HOLD', { position: live_position });
	}
}

(async function main() {
	log_info(`KruLabs {v${package_json.version}}`);
	
	// command line arguments
	const args = process.argv.slice(2);

	for (const arg of args) {
		let [key, value] = arg.split('=');
		if (key === undefined || value === undefined) {
			log_error(`invalid command line argument {${arg}}`);
			continue;
		}

		key = key.replace(/^-+/, '');

		if (!VALID_CLI_ARGS.includes(key)) {
			log_error(`unknown command line argument {${key}}`);
			continue;
		}

		cli_args.set(key, value);
	}

	// internal state memory
	const state_file = Bun.file(STATE_MEMORY_FILE);
	if (await state_file.exists()) {
		try {
			state_memory = await state_file.json();
			log_ok(`loaded internal state memory [{${Math.ceil(state_file.size / 1024)}kb}]`);
		} catch (e) {
			log_error(`failed to load internal state memory from {${STATE_MEMORY_FILE}}; data loss may occur`);
		}
	} else {
		log_warn(`internal state memory not found; creating new memory file`);
	}

	// local server
	const server_port = cli_args.has('port') ? parseInt(cli_args.get('port')) : 19531;

	const server = Bun.serve({
		development: false,
		port: server_port,

		async fetch(req) {
			const url = new URL(req.url);
			let pathname = url.pathname;

			if (pathname === '/pipe') {
				server.upgrade(req);
				return;
			}

			if (pathname === '/')
				pathname = '/index.html';
			else if (node_path.extname(pathname) === '')
				pathname = pathname + '.html';

			const file_path = node_path.join('./src/web', pathname);

			const file = Bun.file(file_path);
			if (!await file.exists())
				return http_response(404); // not found

			if (req.headers.has('range')) {
				const range_header = req.headers.get('range');
				const match = range_header.match(/bytes=(\d*)-(\d*)/);

				if (match !== null) {
					const start = parseInt(match[1], 10);
					const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
					const chunk_size = (end - start) + 1;

					log_info(`streaming chunk {${pathname}} requested: {${start}}-{${end}}/{${file.size}}`)

					return new Response(file.slice(start, end + 1), { status: 206, headers: {
						'Content-Range': `bytes ${start}-${end}/${file.size}`,
						'Accept-Ranges': 'bytes',
						'Content-Length': chunk_size.toString(),
						'Content-Type': file.type
					}});
				}
			}

			return new Response(file, { status: 200 });
		},

		error(error) {
			log_error('internal error occurred while processing an incoming web request');
			log_error(`{${error.name}} ${error.message}`);

			return new Response('An error occurred while processing the request.', { status: 500 });
		},

		websocket: {
			/**
			 * @param {WebSocket} ws
			 * @param {string | ArrayBuffer | Buffer | Buffer[]} message
			 */
			async message(ws, message) {
				if (typeof message !== 'string')
					return close_socket(ws, 'invalid message type');

				try {
					const data = JSON.parse(message);
					const op = data.op;

					if (typeof op !== 'string')
						return close_socket(ws, 'missing operation type');

					if (op === 'CMSG_IDENTITY') {
						client_sockets.set(ws, data.identity);
						send_socket_message(ws, 'SMSG_IDENTITY');

						log_info(`client identified {${ws.remoteAddress}} [${get_socket_labels(ws)}]`);

						return;
					}

					const socket_identity = client_sockets.get(ws);

					// do not respond to other packets until identity has been sent
					if (socket_identity === 0)
						return;

					if (op === 'CMSG_FADE_TO_HOLD') {
						send_socket_message_all('SMSG_FADE_BEGIN');
						return;
					}

					if (op === 'CMSG_LIVE_GO') {
						if (!is_live_go) {
							is_live_go = true;
							last_sync_time = Date.now();
							send_socket_message_all('SMSG_LIVE_GO', { position: get_live_position() });
						}
						return;
					}

					if (op === 'CMSG_LIVE_HOLD') {
						live_hold();
						return;
					}

					if (op === 'CMSG_LIVE_SEEK') {
						live_position = data.position;
						last_sync_time = Date.now();
						send_socket_message_all('SMSG_LIVE_SEEK', { position: get_live_position() });

						cue_stack_index = 0;
						update_cue_stack();
						return;
					}

					if (op === 'CMSG_LIVE_SYNC') {
						live_position = data.position;
						last_sync_time = Date.now();
						send_socket_message_all('SMSG_LIVE_SYNC', { position: get_live_position() });
						return;
					}

					if (op === 'CMSG_GET_PROJECT_STATE') {
						send_socket_message(ws, 'SMSG_PROJECT_STATE', {
							name: state_memory.project_name ?? 'Live Production',
							scenes: (state_memory.scenes ?? []).map(scene => scene.name),
							active_scene,
							is_live_go,
							live_position: get_live_position()
						});
						return;
					}

					if (op === 'CMSG_GET_ACTIVE_SCENE') {
						send_socket_message(ws, 'SMSG_ACTIVE_SCENE', { scene: active_scene });
						return;
					}
					
					if (op === 'CMSG_GET_ACTIVE_CUE_STACK') {
						const scene = get_active_scene();
						send_socket_message(ws, 'SMSG_ACTIVE_CUE_STACK', {
							cue_stack: (scene && scene.markers) || []
						});
						return;
					}

					if (op === 'CMSG_GET_ACTIVE_ZONES') {
						const scene = get_active_scene();
						send_socket_message(ws, 'SMSG_ACTIVE_ZONES', {
							zones: (scene && scene.zones) || []
						});
						return;
					}

					if (op === 'CMSG_SET_ACTIVE_SCENE') {
						const scene_name = data.scene;
						const scenes = state_memory.scenes ?? [];

						log_info(`scene switch requested to {${scene_name}}`);

						if (scene_name !== 'SCENE_NONE' && !scenes.some(scene => scene.name === scene_name))
							return warn_socket(ws, 'scene not found');

						is_live_go = false;
						live_position = 0;
						last_sync_time = null;
						cue_stack_index = 0;

						active_scene = scene_name;
						active_cue_stack = get_active_scene().markers ?? [];

						send_socket_message_all('SMSG_SCENE_CHANGED', { scene: active_scene });
						return;
					}

					if (op === 'CMSG_UPLOAD_PROJECT') {
						state_memory = data.project;

						for (const scene of state_memory.scenes)
							scene.markers.sort((a, b) => a.position - b.position);

						active_cue_stack = get_active_scene().markers ?? [];

						send_socket_message_all('SMSG_DATA_UPDATED');
						save_memory();
						return;
					}

					if (op === 'CMSG_DOWNLOAD_PROJECT') {
						send_socket_message(ws, 'SMSG_DOWNLOAD_PROJECT', state_memory);
						return;
					}

					if (op === 'CMSG_LIST_SOURCES') {
						let sources = await node_fs.promises.readdir(SOURCES_DIRECTORY);
						sources = sources.filter(source => !source.startsWith('.'));

						send_socket_message(ws, 'SMSG_LIST_SOURCES', { sources });
						return;
					}
				} catch (e) {
					return close_socket(ws, e.message);
				}
			},

			/**
			 * @param {WebSocket} ws
			 */
			open(ws) {
				log_ok(`websocket connection established with {${ws.remoteAddress}}`);
				client_sockets.set(ws, 0x0);
			},

			/**
			 * 
			 * @param {WebSocket} ws 
			 * @param {number} code 
			 * @param {string} reason 
			 */
			close(ws, code, reason) {
				log_info(`client websocket disconnected {${code}} {${reason}}`);
				client_sockets.delete(ws);
			}
		}
	});

	log_ok('local server initiated');
	log_info(`{production controller} available at {http://localhost:${server.port}/controller}`);
	log_info(`{projector} available at {http://localhost:${server.port}/projector}`);

	print_ipv4_addresses();

	setInterval(() => {
		if (is_live_go)
			update_cue_stack();
	}, 50);
})();
