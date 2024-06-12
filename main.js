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

const CLIENT_AUTHENTICATED = 1 << 0;
const CLIENT_BLENDER = 1 << 1;
const CLIENT_CONTROLLER = 1 << 2;
const CLIENT_PROJECTOR = 1 << 3;

const CLIENT_LABELS = {
	[CLIENT_AUTHENTICATED]: 'authenticated',
	[CLIENT_BLENDER]: 'blender',
	[CLIENT_CONTROLLER]: 'controller',
	[CLIENT_PROJECTOR]: 'projector'
};

const cli_args = new Map();
let state_memory = {};

const client_sockets = new Map();

// scene state
let active_scene = 'SCENE_NONE';

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
 * @returns {string}
 */
function generate_controller_pin() {
	return (Math.floor(Math.random() * 9000) + 1000).toString();
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

async function save_memory() {
	try {
		await Bun.write(STATE_MEMORY_FILE, JSON.stringify(state_memory, null, 4));
	} catch (e) {
		log_error(`failed to save internal state memory to {${STATE_MEMORY_FILE}}; data loss may occur`);
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
	const controller_pin = generate_controller_pin();
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
						let identity = data.identity;

						if (identity & CLIENT_AUTHENTICATED && data.key !== controller_pin)
							identity &= ~CLIENT_AUTHENTICATED;

						const authenticated = identity & CLIENT_AUTHENTICATED;

						client_sockets.set(ws, identity);
						send_socket_message(ws, 'SMSG_IDENTITY', { authenticated });

						log_info(`client identified {${ws.remoteAddress}} [${get_socket_labels(ws)}]`);

						return;
					}

					const socket_identity = client_sockets.get(ws);
					const is_socket_authenticated = socket_identity & CLIENT_AUTHENTICATED;

					// do not respond to other packets until identity has been sent
					if (socket_identity === 0)
						return;

					if (op === 'CMSG_LIST_SCENES') {
						const scenes = state_memory.scenes ?? [];
						send_socket_message(ws, 'SMSG_LIST_SCENES', { scenes: scenes.map(scene => scene.name) });
						return;
					}

					if (op === 'CMSG_GET_ACTIVE_SCENE') {
						log_info(`active scene requested by {${ws.remoteAddress}}`)
						send_socket_message(ws, 'SMSG_ACTIVE_SCENE', { scene: active_scene });
						return;
					}

					if (op === 'CMSG_SET_ACTIVE_SCENE') {
						const scene_name = data.scene;
						const scenes = state_memory.scenes ?? [];

						log_info(`scene switch requested to {${scene_name}}`);

						if (scene_name !== 'SCENE_NONE' && !scenes.some(scene => scene.name === scene_name))
							return warn_socket(ws, 'scene not found');


						active_scene = scene_name;
						send_socket_message_all('SMSG_ACTIVE_SCENE', { scene: active_scene });
						return;
					}

					if (op === 'CMSG_UPLOAD_SCENES') {
						state_memory.scenes = data.scenes;
						send_socket_message_all('SMSG_DATA_UPDATED');
						save_memory();
						return;
					}

					if (op === 'CMSG_DOWNLOAD_SCENES') {
						const scenes = state_memory.scenes ?? [];
						send_socket_message(ws, 'SMSG_DOWNLOAD_SCENES', { scenes });
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
	log_info(`{production controller} available at {http://localhost:${server.port}/controller?key=${controller_pin}}`);
	log_info(`{production observer} available at {http://localhost:${server.port}/controller}`);
	log_info(`{projector} available at {http://localhost:${server.port}/projector}`);

	print_ipv4_addresses();
})();
