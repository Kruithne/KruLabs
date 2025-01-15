import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :state

let app_state = null;

const reactive_state = {
	data() {
		return {
			tracks: [],
			selected_track: ''
		};
	},

	methods: {
		request_track(id) {
			socket.send_object(PACKET.REQ_REMOTE_TRACK, id);
		},

		request_go() {
			socket.send_empty(PACKET.REQ_REMOTE_GO);
		},

		request_hold() {
			socket.send_empty(PACKET.REQ_REMOTE_HOLD);
		},

		request_seek(offset) {
			socket.send_object(PACKET.REQ_REMOTE_SEEK, offset);
		},
	}
};

// MARK: :init
(async () => {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });
	
	const app = createApp(reactive_state);
	app_state = app.mount('#app');

	socket.on('statechange', state => {
		if (state === socket.SOCKET_STATE_CONNECTED) {
			socket.send_empty(PACKET.REQ_REMOTE_TRACKS);
		}
	});

	socket.on(PACKET.ACK_REMOTE_TRAKCS, tracks => app_state.tracks = tracks);
	socket.on(PACKET.ACK_REMOTE_TRACK, id => app_state.selected_track = id);

	socket.init();
})();