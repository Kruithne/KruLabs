import { document_ready } from './util.js';
import { socket_init, register_socket_listener, socket_send } from './socket.js';
import { createApp } from './vue.js';

// todo: implement v-cloak with loading spinner

(async () => {
	register_socket_listener(handle_socket_message);

	await document_ready();
	await socket_init();

	function handle_socket_message(data) {
		switch (data.op) {
			case 'SMSG_AUTHENTICATE': {
				if (data.success)
					console.log('authenticated');
				else
					console.error('authentication failed');
				break;
			}
	
			case 'SMSG_LOAD_MARKERS': {
				app.markers = data.markers;
				break;
			}
	
			default: {
				console.error('unhandled message:', data);
			}
		}
	}

	const app = createApp({
		data() {
			return {
				test: 'Hello, world!',
				markers: []
			}
		},

		methods: {
			switch_scene_act1() {
				socket_send({
					op: 'CMSG_SWITCH_SCENE',
					scene: 'ACT_1'
				});
			},

			switch_scene_act1_skip() {
				socket_send({
					op: 'CMSG_SWITCH_SCENE',
					scene: 'ACT_1'
				});

				socket_send({
					op: 'CMSG_SEEK',
					position: 1991041
				});
			},

			switch_scene_act2() {
				socket_send({
					op: 'CMSG_SWITCH_SCENE',
					scene: 'ACT_2'
				});
			},

			switch_scene_diamond() {
				socket_send({
					op: 'CMSG_SWITCH_SCENE',
					scene: 'DIAMOND'
				})
			},

			play() {
				socket_send({
					op: 'CMSG_PLAY'
				});
			},

			pause() {
				socket_send({
					op: 'CMSG_PAUSE'
				});
			},

			seek(ms) {
				socket_send({
					op: 'CMSG_SEEK',
					position: ms
				});
			}
		}
	}).mount('#app');
})();