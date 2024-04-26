import { document_ready } from './util.js';
import { socket_init, register_socket_listener, socket_send } from './socket.js';

(async () => {
	register_socket_listener(handle_socket_message);

	await document_ready();
	await socket_init();

	document.getElementById('test').innerHTML = 'Hello, controller!';
})();

function handle_socket_message(data) {
	switch (data.op) {
		case 'SMSG_KL_AUTHENTICATE': {
			if (data.success)
				console.log('authenticated');
			else
				console.error('authentication failed');
			break;
		}

		default: {
			console.error('unhandled message:', data);
		}
	}
}