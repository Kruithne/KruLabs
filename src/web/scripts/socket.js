let ws;
let is_socket_open = false;
let client_identity = 0;

const event_listeners = [];
const connect_callbacks = [];
const disconnect_callbacks = [];

export const CLIENT_IDENTITY = {
	BLENDER: 1 << 1,
	CONTROLLER: 1 << 2,
	PROJECTOR: 1 << 3
};

/**
 * @param {number} identity
 * @param {number} key
 */
export function socket_init(identity) {
	client_identity = identity;
	open_socket();
}

function open_socket() {
	ws = new WebSocket(`ws://${location.host}/pipe`);
	
	ws.addEventListener('close', handle_socket_close);
	ws.addEventListener('error', console.error);
	ws.addEventListener('message', handle_socket_message);
	ws.addEventListener('open', handle_socket_open);
}

export function send_packet(op, data) {
	if (is_socket_open)
		ws.send(JSON.stringify({ op, ...data }));
}

export function register_socket_listener(callback) {
	event_listeners.push(callback);
}

export function register_connection_callback(callback) {
	connect_callbacks.push(callback);
}

export function register_disconnect_callback(callback) {
	disconnect_callbacks.push(callback);
}

function handle_socket_close() {
	is_socket_open = false;
	console.log('socket closed, attempting reconnection in 2 seconds');

	for (const listener of disconnect_callbacks)
		listener();

	setTimeout(open_socket, 2000);
}

function handle_socket_message(event) {
	const data = JSON.parse(event.data);

	if (data.op === 'SMSG_IDENTITY') {
		for (const listener of connect_callbacks)
			listener();
	}

	for (const listener of event_listeners)
		listener(data);
}

function handle_socket_open() {
	is_socket_open = true;
	send_packet('CMSG_IDENTITY', { identity: client_identity });
}