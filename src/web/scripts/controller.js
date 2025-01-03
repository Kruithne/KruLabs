import { document_ready } from './util.js';
import { createApp } from './vue.js';
import * as socket from './socket.js';

// MARK: :state
const reactive_state = {
	data() {
		return {
			nav_pages: ['project', 'tracks', 'cues', 'zones', 'config'],
			nav_page: '',
			socket_state: 0x0
		}
	},

	computed: {
		socket_state_text() {
			if (this.socket_state === socket.SOCKET_STATE_DISCONNECTED)
				return 'Disconnected';

			if (this.socket_state === socket.SOCKET_STATE_CONNECTING)
				return 'Connecting';

			if (this.socket_state === socket.SOCKET_STATE_CONNECTED)
				return 'Connected';

			return 'Unknown';
		}
	},

	methods: {
		
	}
};

// MARK: :general
function format_timestamp(ts) {
	const hours = Math.floor(ts / 3600000).toString().padStart(2, '0');
	const minutes = Math.floor(ts % 3600000 / 60000).toString().padStart(2, '0');
	const seconds = Math.floor(ts % 60000 / 1000).toString().padStart(2, '0');
	const milliseconds = Math.floor(Math.min(ts % 1000), 999).toString().padStart(3, '0');

	return `${hours}:${minutes}:${seconds}:${milliseconds}`;
}

function format_timestamp_short(ts) {
	const minutes = Math.floor(ts % 3600000 / 60000).toString().padStart(2, '0');
	const seconds = Math.floor(ts % 60000 / 1000).toString().padStart(2, '0');

	return `${minutes}:${seconds}`;
}

// MARK: :init
(async () => {
	await document_ready();

	const app = createApp(reactive_state).mount('#app');

	socket.on_state_change(state => app.socket_state = state);
	socket.init();
})();