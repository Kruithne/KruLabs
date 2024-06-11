import { document_ready } from './util.js';
import { socket_init, register_socket_listener, send_packet, CLIENT_IDENTITY } from './socket.js';

(async () => {
	register_socket_listener(handle_socket_message);

	await document_ready();
	await socket_init(CLIENT_IDENTITY.PROJECTOR);

	function handle_socket_message(data) {
		switch (data.op) {
			default: {
				console.error('unhandled message:', data);
			}
		}
	}
})();