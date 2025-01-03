// MARK: :constants
const RECONNECT_TIME = 2000;

export const SOCKET_STATE_DISCONNECTED = 0x0;
export const SOCKET_STATE_CONNECTED = 0x1;
export const SOCKET_STATE_CONNECTING = 0x2;

// MARK: :state
let ws;
let is_socket_open = false;
let socket_state = SOCKET_STATE_DISCONNECTED;

const state_change_listeners = [];

export function init() {
	set_socket_state(SOCKET_STATE_CONNECTING);

	ws = new WebSocket(`ws://${location.host}/api/exchange`);
	
	ws.addEventListener('close', handle_socket_close);
	ws.addEventListener('error', console.error);
	ws.addEventListener('message', handle_socket_message);
	ws.addEventListener('open', handle_socket_open);
}

export function send_op(op, data) {
	// todo: support binary
	if (is_socket_open)
		ws.send(JSON.stringify({ op, ...data }));
}

export function on_state_change(callback) {
	callback(socket_state);
	state_change_listeners.push(callback);
}

function set_socket_state(state) {
	socket_state = state;
	for (const callback of state_change_listeners)
		callback(state);
}

function handle_socket_close() {
	is_socket_open = false;
	set_socket_state(SOCKET_STATE_DISCONNECTED);


	console.log('socket closed, attempting reconnection in %d ms', RECONNECT_TIME);
	setTimeout(init, RECONNECT_TIME);
}

function handle_socket_message(event) {
	const data = JSON.parse(event.data);
}

function handle_socket_open() {
	is_socket_open = true;
	set_socket_state(SOCKET_STATE_CONNECTED);

	// todo: send REGISTER_EVENTS
}