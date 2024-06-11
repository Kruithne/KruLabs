import package_json from './package.json';
import node_os from 'node:os';
import node_http from 'node:http';
import node_path from 'node:path';

const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_ORANGE = '\x1b[33m';

const STATE_MEMORY_FILE = './internal_state.json';
const VALID_CLI_ARGS = ['port'];

const cli_args = new Map();
let state_memory = {};

const client_sockets = new Set();

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
 * @param {Record<string, any>} data
 */
function send_socket_message(socket, data) {
	socket.send(JSON.stringify(data));
}

/**
 * @param {Record<string, any>} data 
 */
function send_socket_message_all(data) {
	const payload = JSON.stringify(data);

	for (const socket of client_sockets) 
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

	const authenticated_sockets = new WeakSet();

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
			message(ws, message) {
				if (typeof message !== 'string')
					return close_socket(ws, 'invalid message type');

				try {
					const data = JSON.parse(message);
					if (typeof data.op !== 'string')
						return close_socket(ws, 'missing operation type');

					switch (data.op) {
						case 'CMSG_UPLOAD_SCENES': {
							state_memory.scenes = data.scenes;
							save_memory();
							break;
						}

						case 'CMSG_DOWNLOAD_SCENES': {
							const scenes = state_memory.scenes ?? [];
							send_socket_message(ws, { op: 'SMSG_DOWNLOAD_SCENES', scenes });
							break;
						}

						case 'CMSG_AUTHENTICATE': {
							const success = data.key === controller_pin;

							if (success)
								authenticated_sockets.add(ws);

							send_socket_message(ws, { op: 'SMSG_AUTHENTICATE', success });
							break;
						}

						case 'CMSG_SEEK': {
							if (!authenticated_sockets.has(ws))
								return close_socket(ws, 'unauthenticated');

							// todo: reimplement
							
							break;
						}

						case 'CMSG_SWITCH_SCENE': {
							if (!authenticated_sockets.has(ws))
								return close_socket(ws, 'unauthenticated');

							// todo: reimplement

							break;
						}
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
				client_sockets.add(ws);
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

	print_ipv4_addresses();
})();
