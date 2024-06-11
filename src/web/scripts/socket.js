let ws;
let is_socket_open = false;

const event_listeners = [];

/**
 * @param {function} init_fn 
 */
export async function socket_init(init_fn) {
	ws = new WebSocket(`ws://${location.host}/pipe`);
	
	ws.addEventListener('close', handle_socket_close);
	ws.addEventListener('error', console.error);
	ws.addEventListener('message', handle_socket_message);
	ws.addEventListener('open', () => {
		is_socket_open = true;
		init_fn?.();
	});
}

export function socket_send(data) {
	if (is_socket_open)
		ws.send(JSON.stringify(data));
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