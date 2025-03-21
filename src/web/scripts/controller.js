import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :constants
const PROJECT_MANAGEMENT_TIMEOUT = 10000; // timeout in ms that state callback timeout (load, save, etc)
const MIN_LOADING_ELAPSED = 500; // minimum time in ms a loading message is visible for
const SEEK_PADDING = 10; // time in milliseconds to pad before cues

const ARRAY_EMPTY = Object.freeze([]);
const NOOP = () => {};

const PLAYBACK_MODE_NONE = 'NONE';
const PLAYBACK_MODE_LOOP = 'LOOP';
const PLAYBACK_MODE_AUTO_GO = 'AUTO_GO';
const PLAYBACK_MODE_AUTO_TRACK = 'AUTO_TRACK';

const TYPE_STRING = 'string';

// local storage keys
const LSK_LAST_PROJECT_ID = 'last_project_id';

// cue event ids
const CEV_BASIC = 0x0;
const CEV_ETC_LX = 0x1;
// 0x2
const CEV_GOTO = 0x3;
const CEV_HOLD = 0x4;

// cue event labels. short appears in cue stack, long appears in config
const CEV_LABELS = {
	[CEV_BASIC]: { short: 'CUE', long: 'MARKER CUE' },
	[CEV_GOTO]: { short: 'GOTO', long: 'GO TO CUE' },
	[CEV_ETC_LX]: { short: 'LX', long: 'ETC LX CUE' },
	[CEV_HOLD]: { short: 'HOLD', long: 'HOLD' },
};

// assign cue events packets to fire
const CEV_PACKETS = {
	//[CEV_PLAY_MEDIA]: PACKET.CUE_EVENT_PLAY_MEDIA,
};

// default meta structure for cue events
const CEV_EVENT_META = {
	[CEV_GOTO]: {
		target_name: ''
	},

	[CEV_ETC_LX]: {
		target_cue: '0'
	}
};

const DEFAULT_PROJECT_STATE = {
	name: 'Untitled Project',
	playback_volume: 1,
	vol_fade_time: 2000,
	tracks: [],
};

const DEFAULT_CUE = {
	name: 'New Cue',
	time: SEEK_PADDING,
	event_type: CEV_BASIC
};

const DEFAULT_TRACK = {
	id: '',
	name: 'New Track',
	duration: 30000,
	obs_scene: '',
	obs_sync: true,
	cues: []
};

// MARK: :state
let modal_confirm_resolver = null;
let app_state = null;

let config_update_debounce_timer = -1;

const reactive_state = {
	data() {
		return {
			nav_pages: ['project', 'live', 'config'],
			nav_page: '',
			
			socket_state: 0x0,
			
			project_last_save_hash: 0,
			selected_project_id: null,
			available_projects: [],
			
			project_state: structuredClone(DEFAULT_PROJECT_STATE),

			selected_track: null,
			selected_cue: null,

			edit_mode: 'NONE', // NONE | TRACK | CUE

			playback_mode: PLAYBACK_MODE_NONE,
			playback_auto_next: false,
			playback_live: false,
			playback_last_update: 0,
			playback_time: 0,
			playback_track_denominator: 0,
			playback_seeking: false,
			last_cue_index: 0,

			obs_status: -1, // -1 disconnected (naturally), 0 connected, > 0 disconnect code
			obs_media_durations: [],
			obs_scene_name: 'No Scene',
			obs_active_media: new Set(),
			obs_scene_change_requested: false,
			obs_scene_list: [],

			etc_stauts: 0, // 0 disconnected, 1 connected

			vol_fade_active: false,
			vol_previous: 1,

			source_list: [],

			local_time: Date.now(),
			server_addr: 'IPv4 Unknown',
			n_connected_clients: 0,
			
			loading_message: '',
			
			modal_title: '',
			modal_message: '',
			modal_type: 'NONE',
			modal_is_active: false,

			CEV_LABELS
		}
	},

	// MARK: :watch
	watch: {
		playback_time(time, prev_time) {
			if (this.playback_seeking) {
				const media = [];
				for (const cue of this.cue_stack_sorted) {
					if (cue.time > time)
						break;
				}

				// todo: seek obs media here?
			}
			
			const cue_stack = this.cue_stack_sorted;
			if (time < prev_time) {
				// playback time has gone backwards, rewind cue index
				this.last_cue_index = 0;
				for (let i = this.last_cue_index - 1; i >= 0; i--) {
					const cue = cue_stack[i];
					if (time >= cue.time) {
						this.last_cue_index = i + 1;
						break;
					}
				}
			} else {
				for (let i = this.last_cue_index, n = cue_stack.length; i < n; i++) {
					const cue = cue_stack[i];
					if (time >= cue.time) {
						if (!this.playback_seeking)
							this.fire_cue_event(cue);
	
						this.last_cue_index++;
					} else {
						// cues are sorted by time, so nothing ahead should be fired
						break;
					}
				}

				this.playback_seeking = false;
			}
		},

		nav_page(new_page) {
			this.edit_mode = 'NONE';

			if (new_page === 'project')
				socket.send_object(PACKET.REQ_PROJECT_LIST, { project_type: 'CONTROLLER' });
		},

		edit_mode(mode) {
			if (mode === 'TRACK')
				socket.send_empty(PACKET.REQ_OBS_SCENE_LIST);
		},

		selected_track(track) {
			socket.send_object(PACKET.ACK_REMOTE_TRACK, track.id);

			this.selected_cue = null;
			this.playback_hold();

			this.playback_time = 0;

			this.obs_scene_change_requested = false;
			this.obs_media_durations.length = 0;

			this.calculate_track_denominator();

			if (this.playback_auto_next) {
				this.playback_auto_next = false;
				this.playback_intent_go();
			}
		},

		'selected_cue.event_type': {
			handler(event_type) {
				if (this.selected_cue && this.selected_cue.event_meta?.id !== event_type) {
					const event_meta = object_clone(CEV_EVENT_META[event_type]) ?? {};

					if (typeof event_meta.uuid === TYPE_STRING)
						event_meta.uuid = crypto.randomUUID();

					this.selected_cue.event_meta = event_meta;
					this.selected_cue.event_meta.id = event_type;
				}
			}
		},

		'project_state.tracks': {
			deep: true,
			handler() {
				this.remote_dispatch_tracks();
				this.calculate_track_denominator();

				if (this.selected_track) {
					// this prevents tracks going out-of-bounds if we shorten a track
					if (this.playback_time > this.selected_track.duration)
						this.playback_time = this.selected_track.duration;
				}
			}
		},

		'project_state.playback_volume': {
			handler(playback_volume) {
				socket.send_object(PACKET.SET_SYSTEM_VOLUME, playback_volume);
			}
		},
	},
	
	// MARK: :computed
	computed: {
		socket_state_text() {
			if (this.socket_state === socket.SOCKET_STATE_DISCONNECTED)
				return 'DISCONNECTED';
			
			if (this.socket_state === socket.SOCKET_STATE_CONNECTING)
				return 'CONNECTING';
			
			if (this.socket_state === socket.SOCKET_STATE_CONNECTED)
				return 'CONNECTED';
			
			return 'ERROR';
		},
		
		available_projects_sorted() {
			return this.available_projects.sort((a, b) => b.last_saved - a.last_saved);
		},

		cue_stack_sorted() {
			return this.selected_track?.cues?.sort((a, b) => a.time - b.time) ?? [];
		},

		local_time_formatted() {
			return format_time(this.local_time);
		},

		playback_factor() {
			if (this.selected_track)
				return Math.min(1, this.playback_time / this.selected_track.duration);

			return 0;
		},

		playback_current_time() {
			return format_timespan_ms(this.selected_track ? this.playback_time : 0);
		},

		playback_remaining_time() {
			return format_timespan_ms(this.selected_track ? this.selected_track.duration - Math.min(this.selected_track.duration, this.playback_time) : 0);
		},

		playback_total_remaining() {
			return format_timespan_ms(this.selected_track ? this.playback_track_denominator - Math.min(this.playback_track_denominator, this.playback_time) : 0);
		},

		connected_clients_formatted() {
			return this.n_connected_clients + (this.n_connected_clients === 1 ? ' CLIENT' : ' CLIENTS');
		},

		is_awaiting_obs_media_playback_end() {
			// todo: re-implement with integrations
			//if (!this.config.obs_enable || !this.config.obs_confirm_playback_end)
				//return false;

			//return this.obs_active_media.size > 0;
		}
	},
	
	// MARK: :methods
	methods: {
		modal_confirm() {
			this.modal_is_active = false;
			modal_confirm_resolver?.(true);
		},
		
		modal_cancel() {
			this.modal_is_active = false;
			modal_confirm_resolver?.(false);
		},
		
		show_loading_message(message) {
			this.loading_message = message;
			return Date.now();
		},
		
		async hide_loading_message(ts) {
			if (ts !== undefined) {
				const elapsed = Date.now() - ts;
				if (elapsed < MIN_LOADING_ELAPSED)
					await new Promise(res => setTimeout(res, MIN_LOADING_ELAPSED - elapsed));
			}

			this.loading_message = '';
		},
		
		format_datetime(ts) {
			return format_datetime(ts);
		},

		format_timespan(ts) {
			return format_timespan(ts);
		},

		format_timespan_ms(ts) {
			return format_timespan_ms(ts);
		},

		format_index(index) {
			return (index + 1).toString().padStart(3, '0');
		},

		// MARK: :volume methods
		async vol_fade_out() {
			if (this.vol_fade_active)
				return;

			this.vol_fade_active = true;

			const current_volume = this.project_state.playback_volume;
			this.vol_previous = current_volume;

			await interpolate(current_volume, 0, this.project_state.vol_fade_time, v => this.project_state.playback_volume = v);
			this.vol_fade_active = false;
		},

		async vol_fade_hold() {
			await this.vol_fade_out();
			this.playback_hold();
		},

		async vol_fade_back() {
			if (this.vol_fade_active)
				return;

			this.vol_fade_active = true;

			const current_volume = this.project_state.playback_volume;
			await interpolate(current_volume, this.vol_previous, this.project_state.vol_fade_time, v => this.project_state.playback_volume = v);

			this.vol_fade_active = false;
		},

		// MARK: :project methods
		get_project_by_id(id) {
			return this.available_projects.find(p => p.id === id);
		},

		update_project_hash() {
			this.project_last_save_hash = hash_object(this.project_state);
		},

		set_project_state(state) {
			if (this.selected_track !== null)
				socket.send_empty(PACKET.REMOVE_ALL_TIMERS);

			this.selected_track = null;
			this.project_state = state;
		},

		async load_selected_project() {
			const project_id = this.selected_project_id;

			const save_hash = hash_object(this.project_state);
			if (save_hash !== this.project_last_save_hash) {
				const user_confirm = await show_confirm_modal('CONFIRM PROJECT LOAD', 'You have unsaved changes. Are you sure you wish to load another project? Unsaved changes will be lost.');
				if (!user_confirm)
					return;
			}

			const load_start_ts = this.show_loading_message('LOADING PROJECT');

			socket.send_object(PACKET.REQ_LOAD_PROJECT, { id: project_id });

			const res = await socket.expect(PACKET.ACK_LOAD_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(r => r).catch(NOOP);
			await this.hide_loading_message(load_start_ts);

			if (res?.success) {
				this.set_project_state(res.state);
				this.update_project_hash();
			} else {
				show_info_modal('CANNOT LOAD PROJECT', 'The system was unable to load the specified project.');
			}
		},

		async save_project(project_id = null) {
			const load_start_ts = this.show_loading_message('SAVING PROJECT');

			socket.send_object(PACKET.REQ_SAVE_PROJECT, { id: project_id, state: this.project_state, project_type: 'CONTROLLER' });

			const res = await socket.expect(PACKET.ACK_SAVE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(r => r).catch(NOOP);
			await this.hide_loading_message(load_start_ts);

			if (res?.success) {
				this.selected_project_id = res.id;
				this.update_project_hash();

				socket.send_object(PACKET.REQ_PROJECT_LIST, { project_type: 'CONTROLLER' });
			} else {
				show_info_modal('PROJECT NOT SAVED', 'The system was unable to save the specified project.');
			}
		},

		async save_selected_project() {
			if (this.selected_project_id === null)
				return;

			const user_confirm = await show_confirm_modal('CONFIRM PROJECT SAVE', `Are you sure you want to overwrite the selected project? This action cannot be reversed.`);
			if (user_confirm)
				await this.save_project(this.selected_project_id);
		},

		async delete_selected_project() {
			const project_id = this.selected_project_id;
			const project = this.get_project_by_id(project_id);

			if (project === undefined)
				return;

			const user_confirm = await show_confirm_modal('CONFIRM PROJECT DELETION', `Are you sure you want to delete the project '${project.name}'? This action cannot be reversed.`);
			if (user_confirm) {
				const load_start_ts = this.show_loading_message('DELETING PROJECT');

				socket.send_object(PACKET.REQ_DELETE_PROJECT, { id: project_id });
				
				const success = await socket.expect(PACKET.ACK_DELETE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(() => true).catch(NOOP);

				if (success) {
					const local_project = localStorage.getItem(LSK_LAST_PROJECT_ID);
					if (local_project === project_id)
						localStorage.removeItem(LSK_LAST_PROJECT_ID);

					socket.send_object(PACKET.REQ_PROJECT_LIST, { project_type: 'CONTROLLER' });
					this.selected_project_id = null;
				} else {
					show_info_modal('PROJECT DELETION FAILED', 'The system was unable to delete the specified project.');
				}

				await this.hide_loading_message(load_start_ts);
			}
		},

		// MARK: :cue methods
		cue_goto(cue) {
			if (!this.selected_track || !cue)
				return;

			this.playback_seeking = true;

			// seek before the cue so that it fires
			this.playback_time = Math.min(this.selected_track.duration, cue.time - SEEK_PADDING);
			this.update_obs_media_seek();
		},

		cue_add() {
			const track = this.selected_track;
			if (track === null)
				return;

			const new_cue = structuredClone(DEFAULT_CUE);

			new_cue.time = Math.max(SEEK_PADDING, this.playback_time);

			track.cues.push(new_cue);
			this.selected_cue = new_cue;

			this.edit_mode = 'CUE';
		},

		cue_move() {
			if (!this.selected_track || !this.selected_cue)
				return;

			this.selected_cue.time = Math.max(SEEK_PADDING, this.playback_time);
		},

		async cue_delete() {
			const cue = this.selected_cue;
			const track = this.selected_track;

			if (cue === null || track === null)
				return;

			this.edit_mode = 'NONE';

			const sorted_index = this.cue_stack_sorted.indexOf(cue);
			track.cues.splice(track.cues.indexOf(cue), 1);

			const sorted_previous = this.cue_stack_sorted[sorted_index > 0 ? sorted_index - 1 : 0];
			this.selected_cue = sorted_previous ?? null;
		},

		fire_cue_event(cue) {
			const { event_type, event_meta } = cue;

			const packet_id = CEV_PACKETS[event_type];
			if (packet_id !== undefined)
				socket.send_object(packet_id, event_meta);

			if (event_type == CEV_GOTO) {
				const target_cue_name = event_meta.target_name;
				const target_cue = this.cue_stack_sorted.find(e => e.name === target_cue_name);

				if (target_cue) {
					// fire_cue_event is called from the playback_time watcher which will unset
					// playback_seeking after this execution, so we need to call cue_goto on the
					// next tick to prevent us unsetting it prematurely
					this.$nextTick(() => this.cue_goto(target_cue));
				}
			} else if (event_type == CEV_HOLD) {
				this.playback_hold();
			} else if (event_type == CEV_ETC_LX) {
				const target_cue = parseFloat(event_meta.target_cue);

				if (!isNaN(target_cue))
					etc_send_command(`cue/${target_cue}/fire`);
			}
		},

		// MARK: :track methods
		track_add() {
			const new_track = structuredClone(DEFAULT_TRACK);
			const tracks = this.project_state.tracks;

			new_track.id = crypto.randomUUID();

			let new_index = tracks.length;
			if (this.selected_track !== null)
				new_index = tracks.indexOf(this.selected_track) + 1;

			tracks.splice(new_index, 0, new_track);
			this.selected_track = new_track;

			this.edit_mode = 'TRACK';
		},

		async track_delete() {
			if (this.selected_track === null)
				return;

			this.edit_mode = 'NONE';

			const tracks = this.project_state.tracks;

			const track_index = tracks.indexOf(this.selected_track);
			tracks.splice(track_index, 1);
			
			const previous_track = tracks[track_index > 0 ? track_index - 1 : 0];
			this.selected_track = previous_track ?? null;
		},

		track_duplicate() {
			if (this.selected_track === null)
				return;

			const new_track = object_clone(this.selected_track);
			const tracks = this.project_state.tracks;

			new_track.id = crypto.randomUUID();

			let new_index = tracks.length;
			if (this.selected_track !== null)
				new_index = tracks.indexOf(this.selected_track) + 1;

			tracks.splice(new_index, 0, new_track);
			this.selected_track = new_track;

			this.edit_mode = 'TRACK';
		},

		track_move_down() {
			if (this.selected_track === null)
				return;

			move_element(this.project_state.tracks, this.selected_track, 1);
		},

		track_move_up() {
			if (this.selected_track === null)
				return;

			move_element(this.project_state.tracks, this.selected_track, -1);
		},

		sync_track_duration(data) {
			if (!this.selected_track?.obs_sync)
				return;

			this.obs_media_durations.push(data.duration);

			const max_duration = Math.max(...this.obs_media_durations, 1000);
			this.selected_track.duration = max_duration;
		},

		// MARK: :playback methods
		async playback_go() {
			if (this.selected_track) {
				
				this.playback_last_update = performance.now();
				this.playback_live = true;

				this.dispatch_playback_state();
			}
		},

		async playback_intent_go() {
			if (!this.obs_scene_change_requested && obs_is_connected() && this.selected_track.obs_scene.length > 0) {
				this.obs_scene_change_requested = true;
				socket.send_object(PACKET.OBS_SET_SCENE, this.selected_track.obs_scene);
				await socket.expect(PACKET.OBS_SCENE_NAME);
			}

			this.playback_go();
		},

		playback_hold() {
			this.playback_live = false;
			this.dispatch_playback_state();
		},

		playback_update(ts) {
			if (this.playback_live && this.selected_track) {
				const now = performance.now();
				const elapsed = performance.now() - this.playback_last_update;
				this.playback_time += elapsed;
				this.playback_last_update = now;
		
				if (this.playback_time >= this.selected_track.duration && !this.is_awaiting_obs_media_playback_end) {
					this.playback_hold();

					this.$nextTick(() => {
						if (this.playback_mode == PLAYBACK_MODE_LOOP) {
							this.playback_seek(0);
							this.playback_go();

							if (obs_is_connected())
								socket.send_object(PACKET.OBS_MEDIA_RESTART, { obs_scene: this.selected_track?.obs_scene ?? '' });
						} else if (this.playback_mode == PLAYBACK_MODE_AUTO_GO) {
							this.playback_auto_next = true;
							this.playback_next_track();
						} else if (this.playback_mode == PLAYBACK_MODE_AUTO_TRACK) {
							this.playback_next_track();
						}
					});
				}
			}
			requestAnimationFrame(ts => this.playback_update(ts));
		},

		playback_next_track() {
			const tracks = this.project_state.tracks;
			if (this.selected_track !== null) {
				const track_index = tracks.indexOf(this.selected_track);
				if (track_index !== -1 && track_index + 1 < tracks.length)
					this.selected_track = tracks[track_index + 1];
			} else {
				this.selected_track = tracks[0];
			}
		},

		playback_seek(time) {
			this.playback_seeking = true;
			this.playback_time = time;

			this.update_obs_media_seek();
		},

		update_obs_media_seek(time) {
			if (obs_is_connected()) {
				socket.send_object(PACKET.OBS_MEDIA_SEEK, {
					time: this.playback_time,
					obs_scene: this.selected_track?.obs_scene ?? ''
				});
			}
		},

		handle_playback_seek(event) {
			if (this.selected_track) {
				const $bar = event.target.closest('#playback-bar');
				const factor = (event.clientX - $bar.getBoundingClientRect().left) / $bar.offsetWidth;

				this.playback_seek(this.selected_track.duration * factor);
			}
		},

		calculate_track_denominator() {
			let total = 0;

			if (this.selected_track) {
				const tracks = this.project_state.tracks;
				const track_index = tracks.indexOf(this.selected_track);

				for (let i = track_index, n = tracks.length; i < n; i++)
					total += tracks[i].duration;
			}

			this.playback_track_denominator = total;
		},

		dispatch_playback_state() {
			socket.send_object(PACKET.PLAYBACK_STATE, {
				state: this.playback_live ? 1 : 0,
				obs_scene: this.selected_track?.obs_scene ?? ''
			});
		},

		// MARK: :remote methods
		remote_dispatch_tracks() {
			socket.send_object(PACKET.ACK_REMOTE_TRACKS, this.project_state.tracks);
		},

		remote_dispatch_track() {
			socket.send_object(PACKET.ACK_REMOTE_TRACK, this.selected_track?.id ?? '');
		},

		remote_select_track(id) {
			const track = this.project_state.tracks.find(e => e.id == id);
			if (track)
				this.selected_track = track;
		},
		
		remote_seek(ofs) {
			if (!this.selected_track)
				return;

			this.playback_seeking = true;

			const new_time = ofs === 0 ? 0 : this.playback_time + ofs;
			this.playback_time = Math.min(this.selected_track.duration, Math.max(new_time, 0));
			this.update_obs_media_seek();
		},
	}
};

// MARK: :obs
function obs_is_connected() {
	return app_state.config.obs_enable && app_state.obs_status === 0;
}

// MARK: :etc
function etc_is_connected() {
	return app_state.config.etc_enable && app_state.etc_status === 1;
}

function etc_send_command(command, ...args) {
	if (!etc_is_connected())
		return;

	socket.send_object(PACKET.ETC_SEND_COMMAND, { command, args });
}

// MARK: :modal
async function show_confirm_modal(title, message) {
	return show_modal(title, message, 'CONFIRM');
}

async function show_info_modal(title, message) {
	return show_modal(title, message, 'OK');
}

async function show_modal(title, message, type) {
	app_state.modal_message = message;
	app_state.modal_title = title;
	app_state.modal_is_active = true;
	app_state.modal_type = type;

	return new Promise(res => {
		modal_confirm_resolver = res;
	});
}

// MARK: :general
/** Formats a UNIX timestamp as dd/mm/yy hh:mm:ss */
function format_datetime(ts) {
	const d = new Date(ts);
	return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function format_time(ts) {
	const d = new Date(ts);
	return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

async function document_ready() {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });
}

/** Formats a timespan (ms) as hh:mm:ss */
function format_timespan(span) {
	const total_seconds = Math.floor(span / 1000);
	const hours = Math.floor(total_seconds / 3600);
	const minutes = Math.floor((total_seconds % 3600) / 60);
	const seconds = total_seconds % 60;
	
	return `${pad_time_unit(hours)}:${pad_time_unit(minutes)}:${pad_time_unit(seconds)}`;
}

/** Formats a timespan (ms) as hh:mm:ss.mmm */
function format_timespan_ms(span) {
	const total_seconds = Math.floor(span / 1000);
	const ms = span % 1000;
	const hours = Math.floor(total_seconds / 3600);
	const minutes = Math.floor((total_seconds % 3600) / 60);
	const seconds = total_seconds % 60;
	
	return `${pad_time_unit(hours)}:${pad_time_unit(minutes)}:${pad_time_unit(seconds)}:${pad_ms(ms)}`;
 }
 
 function pad_ms(ms) {
	return String(Math.floor(ms)).padStart(3, '0');
 }

function pad_time_unit(unit) {
	return String(unit).padStart(2, '0');
}

function hash_object(obj) {
	const str = JSON.stringify(obj);
	let hash = 0

	for (let i = 0; i < str.length; i++)
		hash = ((hash << 5) - hash) + str.charCodeAt(i);

	return hash >>> 0;
}

/** Moves an element in an array forward (1) or back (-1) one place. */
function move_element(arr, elem, direction) {
	const index = arr.indexOf(elem);
    const new_index = direction > 0 ? index + 1 : index - 1;

    if (new_index < 0 || new_index >= arr.length)
		return arr;
    
    [arr[index], arr[new_index]] = [arr[new_index], arr[index]];
}

function compute_centroid_x(points) {
	return points.reduce((sum, p) => sum + p.x, 0) / points.length;
}

function compute_centroid_y(points) {
	return points.reduce((sum, p) => sum + p.y, 0) / points.length;
}

function object_clone(obj) {
	if (obj === undefined)
		return undefined;

	return JSON.parse(JSON.stringify(obj));
}

async function interpolate(current, target, duration, update) {
	if (current === target)
		return;

	return new Promise(resolve => {
		const start = Date.now();

		const tick = () => {
			const elapsed = Date.now() - start;
			const progress = Math.min(1, elapsed / duration);

			update(current + ((target - current) * progress));

			if (progress < 1)
				requestAnimationFrame(tick);
			else
				resolve();
		};

		requestAnimationFrame(tick);
	});
}

// MARK: :timeinput
const timeinput_component = {
	props: {
		value: [String, Number],
		includeMs: Boolean
	},

	template: `
		<input 
			type="text" 
			:value="formatted_time"
			@input="temp_input = $event.target.value"
			@focus="start_editing"
			@blur="stop_editing"
			@keyup.enter="force_blur"
		/>`,

	data() {
		return {
			temp_input: '',
			editing: false
		}
	},

	computed: {
		formatted_time() {
			if (this.editing)
				return this.temp_input;

			if (this.includeMs)
				return format_timespan_ms(this.value);

			return format_timespan(this.value);
		}
	},

	methods: {
		force_blur() {
			this.$el.blur();
		},

		start_editing() {
			this.temp_input = this.formatted_time;
			this.editing = true;
		},

		stop_editing() {
			this.editing = false;

			if (!this.temp_input)
				return;

			const parts = this.temp_input.split(':').map(Number);
			this.temp_input = '';

			if (parts.some(isNaN))
				return;
		 
			let ms = 0;
			switch(parts.length) {
				case 1: 
					ms = parts[0] * 1000;
					break;
				case 2:
					ms = (parts[0] * 60 + parts[1]) * 1000;
					break;
				case 3:
					ms = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
					break;
				case 4:
					ms = (parts[0] * 3600000 + parts[1] * 60000 + parts[2] * 1000 + parts[3]);
					break;
				default:
					return;
			}
			
			this.$emit('updated', ms);
		 }
	}
};

// MARK: :slider
const slider_component = {
	props: ['value', 'text'],

	computed: {
		off() {
			return this.value === 0;
		}
	},

	template: `
		<div class="input-slider" :class="{ off }">
			<div class="input-slider-text">{{ this.text }}</div>
			<div class="input-slider-inner" @mousedown="handle_mouse_down">
				<div class="input-slider-handle" :style="{ left: this.value * 100 + '%' }"></div>
			</div>
		</div>
	`,

	methods: {
		handle_mouse_down(event) {
			const $bar = event.target.closest('.input-slider-inner');

			const mouse_move_callback = event => {
				const factor = (event.clientX - $bar.getBoundingClientRect().left) / $bar.offsetWidth;

				this.$emit('updated', Math.min(1, Math.max(0, factor)));
			};

			const mouse_up_callback = () => {
				document.removeEventListener('mousemove', mouse_move_callback);
			};

			document.addEventListener('mousemove', mouse_move_callback);
			document.addEventListener('mouseup', mouse_up_callback, { once: true });

			mouse_move_callback(event);
		}
	}
};

// MARK: :listbox
function update_listbox_height($el) {
	$el.style.height = 0;

	const parent = $el.parentElement;
	const parent_style = getComputedStyle(parent, null);

	const padding_top = parseFloat(parent_style.getPropertyValue('padding-top'));
	const padding_bottom = parseFloat(parent_style.getPropertyValue('padding-bottom'));

	const parent_rect = parent.getBoundingClientRect();
	let available_height = parent_rect.height - padding_top - padding_bottom;

	for (const child of parent.children) {
		if (child === $el)
			continue;

		const child_rect = child.getBoundingClientRect();
		const child_style = getComputedStyle(child, null);

		const child_margin_bottom = parseFloat(child_style.getPropertyValue('margin-top'));
		const child_margin_top = parseFloat(child_style.getPropertyValue('margin-bottom'));

		available_height -= child_rect.height + child_margin_bottom + child_margin_top;
	}

	$el.style.height = available_height + 'px';
}

const listbox_component = {
	props: ['items'],
	template: `
		<div class="listbox">
			<slot v-for="(item, index) in items" :index="index" :item="item"></slot>
		</div>
	`,
	data() {
		return {
			observer: null
		};
	},
	mounted() {
		update_listbox_height(this.$el);
		
		this.observer = new ResizeObserver(() => update_listbox_height(this.$el));
		this.observer.observe(this.$el.parentElement);
	},
	unmounted() {
		this.observer?.disconnect();
	}
};

// MARK: :init
(async () => {
	await document_ready();
	
	const app = createApp(reactive_state);
	app.component('listbox-component', listbox_component);
	app.component('time-input', timeinput_component);
	app.component('input-slider', slider_component);
	
	app_state = app.mount('#app');

	setInterval(() => app_state.local_time = Date.now(), 1000);

	app_state.update_project_hash();
	app_state.playback_update();
	
	socket.on('statechange', state => {
		app_state.socket_state = state;

		if (state === socket.SOCKET_STATE_CONNECTED) {
			socket.send_empty(PACKET.REQ_SERVER_ADDR);
			socket.send_empty(PACKET.REQ_CLIENT_COUNT);
			socket.send_empty(PACKET.REQ_OBS_STATUS);
			socket.send_empty(PACKET.REQ_ETC_STATUS);
			socket.send_empty(PACKET.REQ_OBS_SCENE_NAME);
		}
	});

	socket.on(PACKET.ACK_SERVER_ADDR, addr => app_state.server_addr = addr);
	socket.on(PACKET.ACK_PROJECT_LIST, data => app_state.available_projects = data.projects);

	socket.on(PACKET.REQ_REMOTE_TRACKS, () => app_state.remote_dispatch_tracks());
	socket.on(PACKET.REQ_REMOTE_TRACK, id => app_state.remote_select_track(id));
	socket.on(PACKET.REQ_REMOTE_GO, () => app_state.playback_intent_go());
	socket.on(PACKET.REQ_REMOTE_HOLD, () => app_state.playback_hold());
	socket.on(PACKET.REQ_REMOTE_SEEK, offset => app_state.remote_seek(offset));
	socket.on(PACKET.REQ_CURRENT_TRACK, () => app_state.remote_dispatch_track());
	socket.on(PACKET.REQ_PLAYBACK_STATE, () => app_state.dispatch_playback_state());
	socket.on(PACKET.INFO_CLIENT_COUNT, count => app_state.n_connected_clients = count);
	socket.on(PACKET.OBS_STATUS, status => app_state.obs_status = status);
	socket.on(PACKET.ETC_STATUS, status => app_state.etc_status = status);
	socket.on(PACKET.OBS_MEDIA_DURATION, data => app_state.sync_track_duration(data));
	socket.on(PACKET.OBS_SCENE_NAME, scene_name => app_state.obs_scene_name = scene_name);
	socket.on(PACKET.OBS_MEDIA_PLAYBACK_STARTED, uuid => app_state.obs_active_media.add(uuid));
	socket.on(PACKET.OBS_MEDIA_PLAYBACK_ENDED, uuid => app_state.obs_active_media.delete(uuid));
	socket.on(PACKET.OBS_SCENE_LIST, scenes => app_state.obs_scene_list = scenes);

	socket.init();

	// keybound buttons
	document.addEventListener('keydown', event => {
		if (event.ctrlKey) {
			const $buttons = document.querySelectorAll(`[data-key-bind="${event.key}"]`);
			if ($buttons.length > 0)
				event.preventDefault();

			for (const $button of $buttons)
				$button.click();
		}
	});
})();