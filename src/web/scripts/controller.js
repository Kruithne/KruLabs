import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :constants
const PROJECT_MANAGEMENT_TIMEOUT = 10000;

const ARRAY_EMPTY = [];
const NOOP = () => {};

const LSK_LAST_PROJECT_ID = 'last_project_id';
const LSK_SYS_CONFIG = 'system_config';

const CEV_BASIC = 0x0;
const CEV_PLAY_MEDIA = 0x1;
const CEV_STOP_MEDIA = 0x2;
const CEV_GOTO = 0x3;
const CEV_HOLD = 0x4;

const CEV_LABELS = {
	[CEV_BASIC]: { short: 'CUE', long: 'BASIC CUE' },
	[CEV_GOTO]: { short: 'GOTO', long: 'GO TO CUE' },
	[CEV_HOLD]: { short: 'HOLD', long: 'HOLD' },
	[CEV_PLAY_MEDIA]: { short: 'MEDIA', long: 'PLAY MEDIA TRACK' },
	[CEV_STOP_MEDIA]: { short: 'MEDIA STOP', long: 'STOP MEDIA TRACK' }
};

const CEV_PACKETS = {
	[CEV_PLAY_MEDIA]: PACKET.CUE_EVENT_PLAY_MEDIA,
	[CEV_STOP_MEDIA]: PACKET.CUE_EVENT_STOP_MEDIA
};

const CEV_EVENT_META = {
	[CEV_PLAY_MEDIA]: {
		src: '',
		channel: 'master',
		volume: 1,
		confirm: false,
		loop: false,
		zone_id: ''
	},
	[CEV_STOP_MEDIA]: {
		channel: 'master'
	},
	[CEV_GOTO]: {
		target_name: ''
	}
};

const DEFAULT_PROJECT_STATE = {
	name: 'Untitled Project',
	blackout_time: 2,
	tracks: [],
	zones: []
};

const DEFAULT_CUE = {
	name: 'New Cue',
	time: 1,
	event_type: CEV_BASIC
};

const DEFAULT_TRACK = {
	name: 'New Track',
	duration: 30000,
	cues: []
};

const DEFAULT_ZONE = {
	id: '',
	name: 'Zone',
	accessor_id: '',
	visible: true,
	corners: [
		{ x: 0.1, y: 0.1 },
		{ x: 0.9, y: 0.1 },
		{ x: 0.9, y: 0.9 },
		{ x: 0.1, y: 0.9 }
	]
};

// MARK: :state
let modal_confirm_resolver = null;
let app_state = null;

const reactive_state = {
	data() {
		return {
			nav_pages: ['project', 'cues', 'zones', 'config'],
			nav_page: '',
			
			socket_state: 0x0,
			
			project_last_save_hash: 0,
			selected_project_id: null,
			available_projects: [],

			config: {
				confirm_track_deletion: true,
				confirm_cue_deletion: true,
				confirm_zone_deletion: true,
			},
			
			project_state: structuredClone(DEFAULT_PROJECT_STATE),

			selected_track: null,
			selected_cue: null,
			selected_zone: null,

			edit_mode: 'NONE', // NONE | TRACK | CUE

			playback_loop: false,
			playback_auto: false,
			playback_auto_next: false,
			playback_live: false,
			playback_last_update: 0,
			playback_time: 0,
			playback_track_denominator: 0,
			playback_seeking: false,
			playback_confirm_media: new Set(),
			last_cue_index: 0,

			source_list: [],

			local_time: Date.now(),
			server_addr: 'IPv4 Unknown',

			state_test_screen: false,
			state_blackout: false,
			state_zone_debug: false,
			
			projector_client_requires_activation: false,
			
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

		playback_loop(state) {
			if (state)
				this.playback_auto = false;
		},

		playback_auto(state) {
			if (state)
				this.playback_loop = false;
		},

		nav_page(new_page) {
			this.edit_mode = 'NONE';

			if (new_page === 'project')
				socket.send_empty(PACKET.REQ_PROJECT_LIST);
		},

		edit_mode(mode) {
			if (mode === 'CUE')
				socket.send_empty(PACKET.REQ_SOURCE_LIST);
		},

		selected_track() {
			socket.send_empty(PACKET.RESET_MEDIA);

			this.selected_cue = null;
			this.playback_hold();
			this.playback_time = 0;

			this.calculate_track_denominator();

			if (this.playback_auto_next) {
				this.playback_go();
				this.playback_auto_next = false;
			}
		},

		state_test_screen(state) {
			socket.send_object(PACKET.SET_TEST_SCREEN, state);
		},

		state_blackout(state) {
			socket.send_object(PACKET.SET_BLACKOUT_STATE, { state, time: this.project_state.blackout_time });
		},

		state_zone_debug(state) {
			socket.send_object(PACKET.SET_ZONE_DEBUG_STATE, state);
		},

		'selected_cue.event_type': {
			handler(event_type) {
				if (this.selected_cue && this.selected_cue.event_meta?.id !== event_type) {
					this.selected_cue.event_meta = object_clone(CEV_EVENT_META[event_type]) ?? {};
					this.selected_cue.event_meta.id = event_type;
				}
			}
		},

		'selected_cue.time': {
			handler(time) {
				// prevent cue starting at 0ms so GOTO can seek -1ms before cue
				if (time < 1)
					return 1;
			}
		},

		'project_state.tracks': {
			deep: true,
			handler() {
				this.calculate_track_denominator();

				if (this.selected_track) {
					// this prevents tracks going out-of-bounds if we shorten a track
					if (this.playback_time > this.selected_track.duration)
						this.playback_time = this.selected_track.duration;
				}
			}
		},

		'project_state.zones': {
			deep: true,
			handler() {
				this.dispatch_zone_updates();
			}
		},

		config: {
			deep: true,
			handler(new_config) {
				this.save_config(new_config);
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
		},
		
		hide_loading_message() {
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

		// MARK: :project methods
		get_project_by_id(id) {
			return this.available_projects.find(p => p.id === id);
		},

		update_project_hash() {
			this.project_last_save_hash = hash_object(this.project_state);
		},

		set_project_state(state) {
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

			this.show_loading_message('LOADING PROJECT');

			socket.send_object(PACKET.REQ_LOAD_PROJECT, { id: project_id });

			const res = await socket.expect(PACKET.ACK_LOAD_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(r => r).catch(NOOP);
			this.hide_loading_message();

			if (res?.success) {
				this.set_project_state(res.state);
				this.update_project_hash();
			} else {
				show_info_modal('CANNOT LOAD PROJECT', 'The system was unable to load the specified project.');
			}
		},

		async save_project(project_id = null) {
			this.show_loading_message('SAVING PROJECT');

			socket.send_object(PACKET.REQ_SAVE_PROJECT, { id: project_id, state: this.project_state });

			const res = await socket.expect(PACKET.ACK_SAVE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(r => r).catch(NOOP);
			this.hide_loading_message();

			if (res?.success) {
				this.selected_project_id = res.id;
				this.update_project_hash();

				socket.send_empty(PACKET.REQ_PROJECT_LIST);
			} else {
				show_info_modal('PROJECT NOT SAVED', 'The system was unable to save the specified project.');
			}
		},

		async save_selected_project() {
			if (this.selected_project_id === null)
				return;

			await this.save_project(this.selected_project_id);
		},

		async delete_selected_project() {
			const project_id = this.selected_project_id;
			const project = this.get_project_by_id(project_id);

			if (project === undefined)
				return;

			const user_confirm = await show_confirm_modal('CONFIRM PROJECT DELETION', `Are you sure you want to delete the project '${project.name}'? This action cannot be reversed.`);
			if (user_confirm) {
				this.show_loading_message('DELETING PROJECT');

				socket.send_object(PACKET.REQ_DELETE_PROJECT, { id: project_id });
				
				const success = await socket.expect(PACKET.ACK_DELETE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(() => true).catch(NOOP);

				if (success) {
					const local_project = localStorage.getItem(LSK_LAST_PROJECT_ID);
					if (local_project === project_id)
						localStorage.removeItem(LSK_LAST_PROJECT_ID);

					socket.send_empty(PACKET.REQ_PROJECT_LIST);
					this.selected_project_id = null;
				} else {
					show_info_modal('PROJECT DELETION FAILED', 'The system was unable to delete the specified project.');
				}

				this.hide_loading_message();
			}
		},

		// MARK: :zone methods
		zone_add(source = DEFAULT_ZONE) {
			const new_zone = object_clone(source);
			new_zone.id = crypto.randomUUID();

			this.project_state.zones.unshift(new_zone);
			this.selected_zone = new_zone;
		},

		zone_duplicate() {
			const zone = this.selected_zone;
			if (zone === null)
				return;

			this.zone_add(this.selected_zone);
		},

		async zone_delete() {
			const zone = this.selected_zone;
			if (zone === null)
				return;

			if (this.config.confirm_zone_deletion) {
				const user_confirm = await show_confirm_modal('CONFIRM ZONE DELETE', `Are you sure you wish to delete cue "${zone.name}"? This action cannot be reversed.`);
				if (!user_confirm)
					return;
			}

			const zones = this.project_state.zones;
			const zone_index = zones.indexOf(zone);
			zones.splice(zone_index, 1);

			this.selected_zone = zones[zone_index > 0 ? zone_index - 1 : 0] ?? null;
		},

		zone_move_down() {
			if (this.selected_zone === null)
				return;

			move_element(this.project_state.zones, this.selected_zone, 1);
		},

		zone_move_up() {
			if (this.selected_zone === null)
				return;

			move_element(this.project_state.zones, this.selected_zone, -1);
		},

		dispatch_zone_updates() {
			const payload = {};

			for (const zone of this.project_state.zones) {
				payload[zone.id] = {
					accessor_id: zone.accessor_id,
					corners: zone.corners
				};
			}
			
			socket.send_object(PACKET.ZONES_UPDATED, payload);
		},

		// MARK: :cue methods
		cue_goto(cue) {
			if (!this.selected_track || !cue)
				return;

			this.playback_seeking = true;

			// seek to 1 millisecond before the cue so that it fires
			this.playback_time = Math.min(this.selected_track.duration, cue.time - 1);
		},

		cue_add() {
			const track = this.selected_track;
			if (track === null)
				return;

			const new_cue = structuredClone(DEFAULT_CUE);

			new_cue.time = this.playback_time;

			track.cues.push(new_cue);
			this.selected_cue = new_cue;

			this.edit_mode = 'CUE';
		},

		async cue_delete() {
			const cue = this.selected_cue;
			const track = this.selected_track;

			if (cue === null || track === null)
				return;

			if (this.config.confirm_cue_deletion) {
				const user_confirm = await show_confirm_modal('CONFIRM CUE DELETE', `Are you sure you wish to delete cue "${cue.name}" from "${track.name}"? This action cannot be reversed.`);
				if (!user_confirm)
					return;
			}

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
			} else if (event_type == CEV_PLAY_MEDIA) {
				if (event_meta.confirm)
					this.playback_confirm_media.add(event_meta.channel);
			}
		},

		// MARK: :track methods
		track_add() {
			const new_track = structuredClone(DEFAULT_TRACK);
			const tracks = this.project_state.tracks;

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

			if (this.config.confirm_track_deletion) {
				const user_confirm = await show_confirm_modal('CONFIRM TRACK DELETE', 'Are you sure you wish to delete the track "' + this.selected_track.name + '"? This action cannot be reversed.');
				if (!user_confirm)
					return;
			}

			this.edit_mode = 'NONE';

			const tracks = this.project_state.tracks;

			const track_index = tracks.indexOf(this.selected_track);
			tracks.splice(track_index, 1);
			
			const previous_track = tracks[track_index > 0 ? track_index - 1 : 0];
			this.selected_track = previous_track ?? null;
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

		async calculate_track_duration() {
			if (this.selected_track === null)
				return;

			let failed = false;
			let duration = 0;

			this.show_loading_message('CALCULATING TRACK DURATION');

			for (const cue of this.selected_track.cues) {
				duration = Math.max(cue.time, duration);

				if (cue.event_type == CEV_PLAY_MEDIA) {
					socket.send_string(PACKET.REQ_MEDIA_LENGTH, cue.event_meta.src);

					try {
						const res = await socket.expect(PACKET.ACK_MEDIA_LENGTH, 3000);
						duration += res;
					} catch (e) {
						failed = true;
					}
				}
			}

			this.selected_track.duration = duration;
			this.hide_loading_message();

			if (failed)
				show_info_modal('TRACK CALCULATION', 'Failed to get duration for one or more media cues in this track. Ensure projector client is active.');
		},

		// MARK: :playback methods
		playback_go() {
			if (this.selected_track) {
				socket.send_empty(PACKET.PLAYBACK_GO);

				this.playback_last_update = performance.now();
				this.playback_live = true;

			}
		},

		playback_hold() {
			socket.send_empty(PACKET.PLAYBACK_HOLD);
			this.playback_live = false;
		},

		playback_reset() {
			this.playback_time = 0;
		},

		playback_update(ts) {
			if (this.playback_live && this.selected_track) {
				const now = performance.now();
				const elapsed = performance.now() - this.playback_last_update;
				this.playback_time += elapsed;
				this.playback_last_update = now;
		
				if (this.playback_time >= this.selected_track.duration && this.playback_confirm_media.size === 0) {
					this.playback_hold();

					if (this.playback_loop) {
						this.playback_seek(0);
						this.playback_go();
					} else if (this.playback_auto) {
						this.playback_auto_next = true;
						this.playback_next_track();
					}
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

		// MARK: :config methods
		save_config(config) {
			localStorage.setItem(LSK_SYS_CONFIG, JSON.stringify(config));
		},

		load_config() {
			const config = localStorage.getItem(LSK_SYS_CONFIG);
			if (config)
				this.config = JSON.parse(config);
		}
	}
};

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

// MARK: :zone editor
const zone_editor_component = {
	props: ['zones', 'selected'],
	template: `
		<div class="zone-editor">
			<template v-if="selected">
				<div
					class="zone-editor-point"
					:style="{
						top: (compute_centroid_y(selected.corners) * 100) + '%',
						left: (compute_centroid_x(selected.corners) * 100) + '%'
					}"
					@mousedown="start_translate(selected, $event)"
				></div>
				<div
					class="zone-editor-point point-rotate"
					:style="{
						top: compute_center(selected.corners[0].y, selected.corners[1].y) * 100 + '%',
						left: compute_center(selected.corners[0].x, selected.corners[1].x) * 100 + '%'
					}"
					@mousedown="start_rotation(selected, $event)"
				></div>
				<div
					class="zone-editor-point point-scale"
					:style="{
						top: compute_center(selected.corners[1].y, selected.corners[2].y) * 100 + '%',
						left: compute_center(selected.corners[1].x, selected.corners[2].x) * 100 + '%'
					}"
					@mousedown="start_scale(selected, $event)"
				></div>
				<div
					class="zone-editor-point point-corner"
					v-for="point in selected.corners"
					:style="{
						top: (point.y * 100) + '%',
						left: (point.x * 100) + '%'
					}"
					@mousedown="start_translate_point(point, $event)"
				></div>
			</template>

			<canvas ref="canvas" width=1920 height=1080></canvas>
		</div>`,

	watch: {
		zones: {
			deep: true,
			immediate: true,
			handler() {
				this.$nextTick(() => this.render());
			}
		},

		selected() {
			this.render();
		}
	},

	methods: {
		start_scale(zone, event) {
			const canvas = this.$refs.canvas;
			const bounds = canvas.getBoundingClientRect();
			
			const corners = zone.corners;
			const original_corners = corners.map(p => ({ x: p.x, y: p.y }));

			const center_x = this.compute_centroid_x(original_corners) * bounds.width;
			const center_y = this.compute_centroid_y(original_corners) * bounds.height;
			
			const start_x = event.clientX - bounds.left;
			const start_y = event.clientY - bounds.top;
			const start_dist = Math.hypot(start_x - center_x, start_y - center_y);
			
			const scale_stop = () => document.removeEventListener('mousemove', scale_update);
			
			const scale_update = (event) => {
				const current_x = event.clientX - bounds.left;
				const current_y = event.clientY - bounds.top;
				const current_dist = Math.hypot(current_x - center_x, current_y - center_y);
				
				const scale = current_dist / start_dist;
				
				for (let i = 0; i < corners.length; i++) {
					const screen_x = original_corners[i].x * bounds.width;
					const screen_y = original_corners[i].y * bounds.height;
					
					const dx = screen_x - center_x;
					const dy = screen_y - center_y;
					
					corners[i].x = (center_x + dx * scale) / bounds.width;
					corners[i].y = (center_y + dy * scale) / bounds.height;
				}
			};
			
			document.addEventListener('mouseup', scale_stop, { once: true });
			document.addEventListener('mousemove', scale_update);
		},

		start_rotation(zone, event) {
			const canvas = this.$refs.canvas;
			const bounds = canvas.getBoundingClientRect();

			const corners = zone.corners;
			const original_corners = corners.map(p => ({ x: p.x, y: p.y }));

			const start_x = event.clientX - bounds.left;
			const start_y = event.clientY - bounds.top;
			
			const rotate_stop = () => document.removeEventListener('mousemove', rotate_update);
			
			const rotate_update = (event) => {
				const current_x = event.clientX - bounds.left;
				const current_y = event.clientY - bounds.top;
		 
				const center = {
					x: this.compute_centroid_x(original_corners) * bounds.width,
					y: this.compute_centroid_y(original_corners) * bounds.height
				};
		 
				const origin_angle = Math.atan2(start_y - center.y, start_x - center.x);
				const point_angle = Math.atan2(current_y - center.y, current_x - center.x);

				const rotation = point_angle - origin_angle;
				const cos = Math.cos(rotation);
				const sin = Math.sin(rotation);
		 
				for (let i = 0; i < corners.length; i++) {
					const screen_x = original_corners[i].x * bounds.width;
					const screen_y = original_corners[i].y * bounds.height;
					
					const dx = screen_x - center.x;
					const dy = screen_y - center.y;
					
					corners[i].x = (center.x + dx * cos - dy * sin) / bounds.width;
					corners[i].y = (center.y + dx * sin + dy * cos) / bounds.height;
				}
			};
		 
			document.addEventListener('mouseup', rotate_stop, { once: true });
			document.addEventListener('mousemove', rotate_update);
		 },

		start_translate_point(point, event) {
			const point_x_initial = point.x;
			const point_y_initial = point.y;

			const canvas = this.$refs.canvas;
			const canvas_bounds = canvas.getBoundingClientRect();

			const translate_start_x = event.clientX - canvas_bounds.left;
			const translate_start_y = event.clientY - canvas_bounds.top;

			const translate_stop = () => document.removeEventListener('mousemove', translate_update);
			const translate_update = (event) => {
				point.x = (((event.clientX - canvas_bounds.left) - translate_start_x) / canvas_bounds.width) + point_x_initial;
				point.y = (((event.clientY - canvas_bounds.top) - translate_start_y) / canvas_bounds.height) + point_y_initial;
			};

			document.addEventListener('mouseup', translate_stop, { once: true });
			document.addEventListener('mousemove', translate_update);
		},

		start_translate(zone, event) {
			const initial_corners = object_clone(zone.corners);

			const canvas = this.$refs.canvas;
			const canvas_bounds = canvas.getBoundingClientRect();

			const translate_start_x = event.clientX - canvas_bounds.left;
			const translate_start_y = event.clientY - canvas_bounds.top;

			const translate_stop = () => document.removeEventListener('mousemove', translate_update);
			const translate_update = (event) => {
				for (let i = 0; i < zone.corners.length; i++) {
					const initial = initial_corners[i];
					const corner = zone.corners[i];

					corner.x = (((event.clientX - canvas_bounds.left) - translate_start_x) / canvas_bounds.width) + initial.x;
					corner.y = (((event.clientY - canvas_bounds.top) - translate_start_y) / canvas_bounds.height) + initial.y;
				}
			};

			document.addEventListener('mouseup', translate_stop, { once: true });
			document.addEventListener('mousemove', translate_update);
		},

		render() {
			const canvas = this.$refs.canvas;
			const ctx = canvas.getContext('2d');

			const width = canvas.width;
			const height = canvas.height;

			ctx.clearRect(0, 0, width, height);

			for (let i = this.zones.length - 1; i >= 0; i--) {
				const zone = this.zones[i];
				const is_selected_zone = this.selected === zone;

				const corners = zone.corners;

				ctx.beginPath();
				ctx.moveTo(corners[0].x * width, corners[0].y * height);
				ctx.lineTo(corners[1].x * width, corners[1].y * height);
				ctx.lineTo(corners[2].x * width, corners[2].y * height);
				ctx.lineTo(corners[3].x * width, corners[3].y * height);
				ctx.closePath();

				if (zone.visible) {
					ctx.fillStyle = is_selected_zone ? '#4bf34b' : 'orange';
					ctx.fill();
				} else {
					ctx.setLineDash([5, 15]);
					ctx.strokeStyle = is_selected_zone ? 'orange' : 'grey';
					ctx.stroke();
					ctx.setLineDash(ARRAY_EMPTY);
				}
			}
		},

		compute_centroid_y(points) {
			return compute_centroid_y(points);
		},

		compute_centroid_x(points) {
			return compute_centroid_x(points);
		},

		compute_center(a, b) {
			return (a + b) / 2
		}
	}
};

// MARK: :init
(async () => {
	await document_ready();
	
	const app = createApp(reactive_state);
	app.component('listbox-component', listbox_component);
	app.component('time-input', timeinput_component);
	app.component('zone-editor', zone_editor_component);
	
	app_state = app.mount('#app');

	setInterval(() => app_state.local_time = Date.now(), 1000);

	app_state.load_config();
	app_state.update_project_hash();
	app_state.playback_update();
	
	socket.on('statechange', state => {
		app_state.socket_state = state;

		if (state === socket.SOCKET_STATE_CONNECTED)
			socket.send_empty(PACKET.REQ_SERVER_ADDR);
	});

	socket.on(PACKET.ACK_SERVER_ADDR, addr => app_state.server_addr = addr);
	socket.on(PACKET.ACK_PROJECT_LIST, data => app_state.available_projects = data.projects);
	socket.on(PACKET.REQ_ZONES, () => app_state.dispatch_zone_updates());
	socket.on(PACKET.ACK_SOURCE_LIST, data => app_state.source_list = data);
	socket.on(PACKET.CONFIRM_MEDIA_END, channel => app_state.playback_confirm_media.delete(channel));
	socket.on(PACKET.PROJECTOR_CLIENT_NEEDS_ACTIVATION, state => app_state.projector_client_requires_activation = state);

	socket.init();
})();