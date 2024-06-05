/*
	TODO
	- Implement projection screen interface.
	- Implement projection screen debug mode.
	- Implement video, audio and image streaming.
	- Create dynamic scene system.
	- Implement autoplay support for sources.
	- Implement loop support for sources.
*/

import package_json from './package.json';
import node_os from 'node:os';
import node_http from 'node:http';
import node_path from 'node:path';

const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_ORANGE = '\x1b[33m';

const CONFIG_FILE_PATH = './config.json';

const client_sockets = new Set();

const configuration = {
	web_server: {
		port: 0,
		controller_pin: ''
	}
};

// TODO: This should not be hard-coded like this.
const MARKER_CONFIG = {
	'ACT_1': './markers/ACT_1_MARKERS.json',
	'ACT_2': './markers/ACT_2_MARKERS.json'
};

const scene_markers = {};

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

	for (const socket of client_sockets) {
		// TODO: do we need to validate here that the socket is still active? edge case?
		socket.send(payload);
	}
}

// TODO: Automatically send sources to the client rather than hard-coding in HTML.
// TODO: Load sources dynamically as opposed to hard-coding them here.
const sources = {
	'ACT_1': [
		'ICONIC_ACT_1_RENDER.mp4'
	],

	'ACT_2': [
		'ICONIC_ACT_2_RENDER.mp4'
	],

	'DIAMOND': [
		'ICONIC_DIAMONDS.mp4'
	]
}

function init_local_server() {
	let controller_pin = configuration.web_server.controller_pin;
	if (controller_pin.length === 0)
		controller_pin = generate_controller_pin();

	const authenticated_sockets = new WeakSet();
	let current_scene = null;

	const server = Bun.serve({
		development: false,
		port: configuration.web_server.port,

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
						// TODO: switch to numeric opcodes for performance.
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

							if (current_scene === null)
								return;

							const scene_sources = sources[current_scene];
							for (const scene of scene_sources) {
								//obs_send_request('SetMediaInputCursor', { inputName: scene, mediaCursor: data.position });
							}
							
							break;
						}

						case 'CMSG_SWITCH_SCENE': {
							if (!authenticated_sockets.has(ws))
								return close_socket(ws, 'unauthenticated');

							current_scene = data.scene;
							//obs_change_scene(data.scene);

							// send RESTART and PAUSE to all sources in the new scene
							const scene_sources = sources[data.scene];

							const markers = scene_markers[data.scene];
							send_socket_message_all({ op: 'SMSG_LOAD_MARKERS', markers: markers ?? [] });

							break;
						}

						case 'CMSG_PLAY': {
							if (!authenticated_sockets.has(ws))
								return close_socket(ws, 'unauthenticated');

							if (current_scene === null)
								return;

							const scene_sources = sources[current_scene];
							for (const scene of scene_sources)
								//obs_send_request('TriggerMediaInputAction', { inputName: scene, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' });

							break;
						}

						case 'CMSG_PAUSE': {
							if (!authenticated_sockets.has(ws))
								return close_socket(ws, 'unauthenticated');

							if (current_scene === null)
								return;

							const scene_sources = sources[current_scene];
							for (const scene of scene_sources)
								//obs_send_request('TriggerMediaInputAction', { inputName: scene, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' });

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
}

/**
 * @param {Record<string, any>} object
 * @param {string} key
 * @returns {any}
 */
function resolve_object_entry(object, key) {
	const keys = key.split('.');

	for (const key of keys) {
		if (object === undefined)
			return undefined;

		object = object[key];
	}

	return object;
}

/**
 * @param {Record<string, any>} object
 * @param {string} key
 * @param {any} value
 */
function set_object_entry(object, key, value) {
	const keys = key.split('.');

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];

		if (object[key] === undefined)
			object[key] = {};

		object = object[key];
	}

	object[keys[keys.length - 1]] = value;
}

/**
 * @param {any} object
 * @returns {string}
 */
function get_object_type(object) {
	if (object === null)
		return 'null';

	if (Array.isArray(object))
		return 'array';

	return typeof object;
}

/**
 * @param {Record<string, any>} config
 * @param {string} [parent_key='']
 */
function parse_config(config, parent_key = '') {
	for (const [key, value] of Object.entries(config)) {
		const full_key = parent_key === '' ? key : `${parent_key}.${key}`;
		const target_value = resolve_object_entry(configuration, full_key);

		if (target_value === undefined) {
			log_warn(`unknown configuration entry {${full_key}}; ignoring entry`);
		} else {
			const value_type = get_object_type(value);
			const target_type = get_object_type(target_value);

			if (value_type !== target_type) {
				log_warn(`invalid configuration entry {${full_key}}, expected {${target_type}} but got {${value_type}}; using default`);
			} else if (value_type === 'object') {
				parse_config(value, full_key);
			} else {
				set_object_entry(configuration, full_key, value);
			}
		}
	}
}

async function init_config() {
	const config_file = Bun.file(CONFIG_FILE_PATH);
	if (!await config_file.exists()) {
		log_warn(`configuration file not found at {${CONFIG_FILE_PATH}}; writing default configuration`);

		try {
			await Bun.write(CONFIG_FILE_PATH, JSON.stringify(configuration, null, 4));
		} catch (e) {
			log_error(`failed to write default configuration to {${CONFIG_FILE_PATH}}; using default configuration`);
		}
	}

	try {
		const user_configuration = await config_file.json();
		parse_config(user_configuration);
	} catch (e) {
		log_error(`failed to parse configuration file at {${CONFIG_FILE_PATH}}; using default configuration`);
	}

	log_ok(`configuration loaded from {${CONFIG_FILE_PATH}}`);
}

async function init_markers() {
	// TODO: This should be a much more robust system rather than just hard-loading from a file.

	for (const [key, marker_path] of Object.entries(MARKER_CONFIG)) {
		const marker_file = Bun.file(marker_path);
		if (!await marker_file.exists()) {
			log_error(`marker file not found at {${marker_path}}`);
			continue;
		}

		try {
			const marker_json = await marker_file.json();

			// TODO: Validate that the JSON actually contains a .markers property.
			scene_markers[key] = marker_json.markers;

			log_ok(`loaded {${marker_json.markers.length}} markers for {${key}}`);
		} catch (e) {
			log_error(`failed to parse marker file at {${marker_path}}`);
		}
	}
}

(async function main() {
	log_info(`KruLabs {v${package_json.version}}`);
	await init_config();
	await init_markers();
	init_local_server();
})();
