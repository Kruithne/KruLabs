import { document_ready } from './util.js';
import { createApp } from './vue.js';
import * as socket from './socket.js';

const ERROR_TIMEOUT = 5 * 1000;

let error_text_timeout = -1;

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

(async () => {
	socket.register_socket_listener(handle_socket_message);
	socket.register_connection_callback(handle_connect);

	requestAnimationFrame(anim_loop);

	await document_ready();
	socket.socket_init(socket.CLIENT_IDENTITY.CONTROLLER);

	function handle_connect() {
		socket.send_packet('CMSG_GET_PROJECT_STATE');
		socket.send_packet('CMSG_GET_ACTIVE_CUE_STACK');
	}

	let last_ts = null;
	function anim_loop(ts) {
		app.real_time = Date.now();

		if (app.is_live_go && last_ts !== null) {
			const delta_from_last_frame_in_ms = ts - last_ts;
			app.free_time_live = app.free_time_live + delta_from_last_frame_in_ms;
		}

		last_ts = ts;

		requestAnimationFrame(anim_loop);
	}

	function set_live_position(ms) {
		app.live_position = ms;
		app.free_time_live = 0;
	}

	function handle_socket_message(data) {
		if (data.op === 'SMSG_LIVE_GO') {
			app.is_live_go = true;
			set_live_position(data.position);
			return
		}

		if (data.op === 'SMSG_LIVE_HOLD') {
			app.is_live_go = false;
			app.is_fading = false;
			app.is_fading_to_black = false;
			set_live_position(data.position);
			return;
		}

		if (data.op === 'SMSG_LIVE_SEEK' || data.op === 'SMSG_LIVE_SYNC') {
			set_live_position(data.position);
			return;
		}

		if (data.op === 'SMSG_PROJECT_STATE') {
			app.production_name = data.name;
			app.scenes = data.scenes;
			app.active_scene = data.active_scene;
			app.is_live_go = data.is_live_go;
			app.live_position = data.live_position;
			app.free_time_live = 0;
			return;
		}

		if (data.op === 'SMSG_ACTIVE_SCENE') {
			app.active_scene = data.scene;
			return;
		}

		if (data.op === 'SMSG_ACTIVE_CUE_STACK') {
			app.cue_stack = data.cue_stack;
			return;
		}

		if (data.op === 'SMSG_CUE_INDEX_CHANGED') {
			app.cue_stack_index = data.cue_stack_index;
			return;
		}

		if (data.op === 'SMSG_DATA_UPDATED' || data.op === 'SMSG_SCENE_CHANGED') {
			socket.send_packet('CMSG_GET_PROJECT_STATE');
			socket.send_packet('CMSG_GET_ACTIVE_CUE_STACK');

			if (data.op === 'SMSG_SCENE_CHANGED') {
				app.is_live_go = false;
				app.cue_stack_index = -1;
				set_live_position(0);
			}
			return;
		}

		if (data.op === 'SMSG_ERROR') {
			app.error_text = data.error_text;

			clearTimeout(error_text_timeout);
			error_text_timeout = setTimeout(() => app.error_text = '', ERROR_TIMEOUT);

			return;
		}
	}

	const app = createApp({
		data() {
			return {
				page: 'MAIN',

				free_time_live: 0,
				timer_time: 0,
				timer_active: false,
				is_cue_lock: false,
				is_live_go: false,
				is_fading: false,
				is_fading_to_black: false,
				real_time: Date.now(),
				cue_stack_index: -1,
				live_position: 0,
				production_name: 'Live Production',
				active_scene: 'SCENE_NONE',
				error_text: '',
				scenes: [],
				cue_stack: []
			}
		},

		computed: {
			active_scene_name() {
				return this.active_scene === 'SCENE_NONE' ? 'No Scene' : this.active_scene;
			},

			formatted_real_time() {
				const date = new Date(this.real_time);

				const hours = date.getHours().toString().padStart(2, '0');
				const minutes = date.getMinutes().toString().padStart(2, '0');
				const seconds = date.getSeconds().toString().padStart(2, '0');

				return `${hours}:${minutes}:${seconds}`;
			},

			formatted_live_time() {
				return format_timestamp(this.live_position + this.free_time_live);
			},

			formatted_timer_time() {
				if (!this.timer_active)
					return '00:00';

				return format_timestamp_short(this.real_time - this.timer_time);
			}
		},

		methods: {
			toggle_timer() {
				this.timer_active = !this.timer_active;
				this.timer_time = this.timer_active ? Date.now() : 0;
			},

			fade_to_hold() {
				this.is_fading = true;
				socket.send_packet('CMSG_FADE_TO_HOLD');
			},

			fade_in() {
				socket.send_packet('CMSG_FADE_IN');
			},

			fade_out() {
				socket.send_packet('CMSG_FADE_OUT');
			},

			render_cue_time(ms) {
				return format_timestamp(Math.max(ms - (this.live_position + this.free_time_live), 0));
			},

			is_cue_triggered(ms) {
				return ms <= this.live_position + this.free_time_live;
			},

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
				if (!this.is_cue_lock)
					socket.send_packet('CMSG_LIVE_SEEK', { position: ms });
			}
		}
	}).mount('#app');
})();