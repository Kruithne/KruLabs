import { document_ready } from './util.js';
import { createApp } from './vue.js';
import * as socket from './socket.js';

(async () => {
	socket.register_socket_listener(handle_socket_message);
	socket.register_connection_callback(handle_connect);

	await document_ready();
	socket.socket_init(socket.CLIENT_IDENTITY.CONTROLLER);

	function handle_connect() {
		socket.send_packet('CMSG_GET_PROJECT_STATE');
		socket.send_packet('CMSG_GET_ACTIVE_CUE_STACK');
	}

	function handle_socket_message(data) {
		if (data.op === 'SMSG_LIVE_GO') {
			app.is_live_go = true;
			return
		}

		if (data.op === 'SMSG_LIVE_HOLD') {
			app.is_live_go = false;
			return;
		}

		if (data.op === 'SMSG_PROJECT_STATE') {
			app.production_name = data.name;
			app.scenes = data.scenes;
			app.active_scene = data.active_scene;
			app.is_live_go = data.is_live_go;
			return;
		}

		if (data.op === 'SMSG_ACTIVE_SCENE') {
			app.active_scene = data.scene;
			return;
		}

		if (data.op === 'SMSG_ACTIVE_CUE_STACK') {
			console.log(data);
			app.cue_stack = data.cue_stack;
			return;
		}

		if (data.op === 'SMSG_DATA_UPDATED' || data.op === 'SMSG_SCENE_CHANGED') {
			socket.send_packet('CMSG_GET_PROJECT_STATE');
			socket.send_packet('CMSG_GET_ACTIVE_CUE_STACK');
			return;
		}
	}

	const app = createApp({
		data() {
			return {
				page: 'MAIN',

				is_live_go: false,
				production_name: 'Live Production',
				active_scene: 'SCENE_NONE',
				scenes: [],
				cue_stack: []
			}
		},

		computed: {
			active_scene_name() {
				return this.active_scene === 'SCENE_NONE' ? 'No Scene' : this.active_scene;
			}
		},

		methods: {
			show_page(page) {
				this.page = page;
			},

			select_scene(scene) {
				socket.send_packet('CMSG_SET_ACTIVE_SCENE', { scene });
			},

			live_go() {
				socket.send_packet('CMSG_LIVE_GO');
			},

			live_hold() {
				socket.send_packet('CMSG_LIVE_HOLD');
			},

			live_seek(ms) {
				socket.send_packet('CMSG_LIVE_SEEK', { position: ms });
			}
		}
	}).mount('#app');
})();