import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :constants
const PROJECT_MANAGEMENT_TIMEOUT = 10000;

const LSK_LAST_PROJECT_ID = 'last_project_id';
const LSK_SYS_CONFIG = 'system_config';

const DEFAULT_PROJECT_STATE = {
	name: 'Untitled Project',
	tracks: [
		{
			name: 'Test Track',
			duration: 5634834,
			cues: [
				{
					name: 'Test Cue 1',
					time: 1000
				},
				{
					name: 'Test Cue 2',
					time: 40000
				}
			]
		}
	],
	zones: [
	]
};

const DEFAULT_CUE = {
	name: 'New Cue',
	time: 10000 // todo: replace with current track time
};

const DEFAULT_TRACK = {
	name: 'New Track',
	duration: 1000
};

const DEFAULT_ZONE = {
	id: '',
	name: 'Zone',
	accessor_id: 0,
	visible: true,
	corners: [
		{ x: 0.2, y: 0.2 },
		{ x: 0.8, y: 0.3 },
		{ x: 0.7, y: 0.8 },
		{ x: 0.1, y: 0.7 }
	],
	rotation: 0.7853981633974483
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

			playback_live: false,
			playback_last_update: 0,
			playback_time: 0,
			playback_track_denominator: 0,

			local_time: Date.now(),
			
			loading_message: '',
			
			modal_title: '',
			modal_message: '',
			modal_type: 'NONE',
			modal_is_active: false,
		}
	},

	// MARK: :watch
	watch: {
		nav_page(new_page) {
			this.edit_mode = 'NONE';

			if (new_page === 'project')
				socket.send_empty(PACKET.REQ_PROJECT_LIST);
		},

		selected_track() {
			this.selected_cue = null;
			this.playback_live = false;
			this.playback_time = 0;

			this.calculate_track_denominator();
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
				return this.playback_time / this.selected_track.duration;

			return 0;
		},

		playback_current_time() {
			return format_timespan_ms(this.selected_track ? this.playback_time : 0);
		},

		playback_remaining_time() {
			return format_timespan_ms(this.selected_track ? this.selected_track.duration - this.playback_time : 0);
		},

		playback_total_remaining() {
			return format_timespan_ms(this.selected_track ? this.playback_track_denominator - this.playback_time : 0);
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
			const res = await socket.expect(PACKET.ACK_LOAD_PROJECT, PROJECT_MANAGEMENT_TIMEOUT);

			this.hide_loading_message();

			if (res.success) {
				this.set_project_state(res.state);
				this.update_project_hash();
			} else {
				show_info_modal('CANNOT LOAD PROJECT', 'The system was unable to load the specified project.');
			}
		},

		async save_project(project_id = null) {
			this.show_loading_message('SAVING PROJECT');

			socket.send_object(PACKET.REQ_SAVE_PROJECT, { id: project_id, state: this.project_state });
			const res = await socket.expect(PACKET.ACK_SAVE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT);

			this.hide_loading_message();

			if (res.success) {
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
				await socket.expect(PACKET.ACK_DELETE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT);

				const local_project = localStorage.getItem(LSK_LAST_PROJECT_ID);
				if (local_project === project_id)
					localStorage.removeItem(LSK_LAST_PROJECT_ID);

				socket.send_empty(PACKET.REQ_PROJECT_LIST);

				this.hide_loading_message();
				this.selected_project_id = null;
			}
		},

		// MARK: :zone methods
		zone_add() {
			const new_zone = structuredClone(DEFAULT_ZONE);
			new_zone.id = crypto.randomUUID();

			this.project_state.zones.unshift(new_zone);
			this.selected_zone = new_zone;

			this.edit_mode = 'ZONE';
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

			// todo: sync zone deletion with clients

			const zones = this.project_state.zones;
			const zone_index = zones.indexOf(zone);
			zones.splice(zone_index, 1);

			this.selected_zone = zones[zone_index > 0 ? zone_index - 1 : 0] ?? null;
		},

		zone_move_down() {
			if (this.selected_zone === null)
				return;

			move_element(this.project_state.zones, this.selected_zone, 1);
			// todo: sync zone order with clients.
		},

		zone_move_up() {
			if (this.selected_zone === null)
				return;

			move_element(this.project_state.zones, this.selected_zone, -1);
			// todo: sync zone order with clients.
		},

		// MARK: :cue methods
		cue_goto() {
			if (!this.selected_track || !this.selected_cue)
				return;

			this.playback_time = Math.min(this.selected_track.duration, this.selected_cue.time);
		},

		cue_add() {
			const track = this.selected_track;
			if (track === null)
				return;

			const new_cue = structuredClone(DEFAULT_CUE);

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

		// MARK: :playback methods
		playback_go() {
			if (this.selected_track) {
				this.playback_last_update = performance.now();
				this.playback_live = true;
			}
		},

		playback_hold() {
			this.playback_live = false;
		},

		playback_reset() {
			this.playback_time = 0;
		},

		playback_update(ts) {
			if (this.playback_live && this.selected_track) {
				const elapsed = ts - this.playback_last_update;
				this.playback_time += elapsed;
				this.playback_last_update = ts;
		
				if (this.playback_time >= this.selected_track.duration) {
					this.playback_time = this.selected_track.duration;
					this.playback_hold();
				}
			}
			requestAnimationFrame(ts => this.playback_update(ts));
		},

		playback_seek(event) {
			if (this.selected_track) {
				const $bar = event.target.closest('#playback-bar');
				const factor = (event.clientX - $bar.getBoundingClientRect().left) / $bar.offsetWidth;
				this.playback_time = this.selected_track.duration * factor;
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
	props: ['zones'],
	template: `
		<div class="zone-editor">
			<div
				class="zone-editor-point"
				v-for="zone in zones"
				:style="{
					top: (compute_centroid_y(zone.corners) * 100) + '%',
					left: (compute_centroid_x(zone.corners) * 100) + '%'
				}"
			></div>

			<canvas ref="canvas" width=1920 height=1080></canvas>
		</div>`,

	watch: {
		zones: {
			deep: true,
			immediate: true,
			handler() {
				this.$nextTick(() => this.render());
			}
		}
	},

	methods: {
		render() {
			const canvas = this.$refs.canvas;
			const ctx = canvas.getContext('2d');

			const width = canvas.width;
			const height = canvas.height;

			ctx.clearRect(0, 0, width, height);

			for (const zone of this.zones) {
				if (!zone.visible)
					continue;

				const corners = zone.corners;
				const rotation = zone.rotation;

				const centroid_x = compute_centroid_x(corners) * width;
				const centroid_y = compute_centroid_y(corners) * height;

				ctx.save();
				ctx.translate(centroid_x, centroid_y);
				ctx.rotate(rotation);
				ctx.translate(-centroid_x, -centroid_y);

				ctx.beginPath();
				ctx.moveTo(corners[0].x * width, corners[0].y * height);
				ctx.lineTo(corners[1].x * width, corners[1].y * height);
				ctx.lineTo(corners[2].x * width, corners[2].y * height);
				ctx.lineTo(corners[3].x * width, corners[3].y * height);
				ctx.closePath();
				
				ctx.fillStyle = 'red';
				ctx.fill();
				ctx.restore();
			}
		},

		compute_centroid_y(points) {
			return compute_centroid_y(points);
		},

		compute_centroid_x(points) {
			return compute_centroid_x(points);
		},
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
	
	socket.on('statechange', state => app_state.socket_state = state);
	socket.on(PACKET.ACK_PROJECT_LIST, data => app_state.available_projects = data.projects);

	socket.init();
})();