let ws;
let is_socket_open = false;
let client_identity = 0;
let auth_key = undefined;

const event_listeners = [];

export const CLIENT_IDENTITY = {
	BLENDER: 1 << 1,
	CONTROLLER: 1 << 2,
	PROJECTOR: 1 << 3
};

/**
 * @param {number} identity
 * @param {number} key
 */
export async function socket_init(identity) {
	ws = new WebSocket(`ws://${location.host}/pipe`);

	client_identity = identity;
	
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

function handle_socket_close() {
	is_socket_open = false;
	console.log('socket closed, attempting reconnection in 2 seconds');
	setTimeout(socket_init, 2000);
}

function handle_socket_message(event) {
	const data = JSON.parse(event.data);
	for (const listener of event_listeners)
		listener(data);
}

function handle_socket_open() {
	is_socket_open = true;
	send_packet('CMSG_IDENTITY', { identity: client_identity });
}