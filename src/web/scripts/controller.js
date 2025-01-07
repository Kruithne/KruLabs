import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :constants
const PROJECT_MANAGEMENT_TIMEOUT = 10000;
const LSK_LAST_PROJECT_ID = 'last_project_id';

// MARK: :state
let modal_confirm_resolver = null;
let app_state = null;

const reactive_state = {
	data() {
		return {
			nav_pages: ['project', 'cues', 'zones'],
			nav_page: '',
			
			socket_state: 0x0,
			
			project_last_save_hash: 0,
			selected_project_id: null,
			available_projects: [],
			
			project_state: {
				name: 'Untitled Project',
				tracks: [
					{
						name: 'Test Track',
						duration: 5634834,
						cues: [
							{
								name: 'Test Cue 1',
								time: 20000
							},
							{
								name: 'Test Cue 2',
								time: 40000
							}
						]
					},
					{
						name: 'Test Track',
						duration: 5634834
					},
					{
						name: 'Test Track',
						duration: 5634834
					}
				]
			},

			selected_track: null,
			selected_cue: null,

			local_time: Date.now(),
			
			loading_message: '',
			
			modal_title: '',
			modal_message: '',
			modal_type: 'NONE',
			modal_is_active: false,
		}
	},

	watch: {
		nav_page(new_page) {
			if (new_page === 'project')
				socket.send_empty(PACKET.REQ_PROJECT_LIST);
		},

		selected_track() {
			this.selected_cue = null;
		}
	},
	
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
		}
	},
	
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

		// MARK: :project methods
		get_project_by_id(id) {
			return this.available_projects.find(p => p.id === id);
		},

		update_project_hash() {
			this.project_last_save_hash = hash_object(this.project_state);
		},

		local_save_project_id() {
			localStorage.setItem(LSK_LAST_PROJECT_ID, this.selected_project_id);
		},

		local_load_project_id() {
			const project_id = localStorage.getItem(LSK_LAST_PROJECT_ID);
			if (project_id !== null) {
				this.selected_project_id = project_id;
				this.load_selected_project();
			}
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
				this.project_state = res.state;
				this.update_project_hash();
				this.local_save_project_id();
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
				this.local_save_project_id();

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

		// MARK: :track methods
		track_add() {
			const new_track = {
				name: 'New Track',
				duration: 1000
			};

			this.project_state.tracks.push(new_track);
			this.selected_track = new_track;

			this.track_edit();
		},

		track_delete() {
			// todo: show a confirmation dialog and then delete the track
		},

		track_edit() {
			// todo: show the editing interface
		},

		track_move_down() {
			move_element(this.project_state.tracks, this.selected_track, 1);
		},

		track_move_up() {
			move_element(this.project_state.tracks, this.selected_track, -1);
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

// MARK: :timeinput
const timeinput_component = {
	props: {
		value: String,
		includeMs: Boolean
	},

	template: `
		<input 
			type="text" 
			:value="formatted_time"
			@input="temp_input = $event.target.value"
			@blur="handle_input"
		/>`,

	data() {
		return {
			temp_input: ''
		}
	},

	computed: {
		formatted_time() {
			if (this.includeMs)
				return format_timespan_ms(this.value);

			return format_timespan(this.value);
		}
	},

	methods: {
		handle_input(e) {
			if (!this.temp_input)
				return;

			const parts = e.target.value.split(':').map(Number);
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
			<slot v-for="item in items" :item="item"></slot>
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
	app_state = app.mount('#app');

	setInterval(() => app_state.local_time = Date.now(), 1000);

	app_state.update_project_hash();
	
	socket.on('statechange', state => app_state.socket_state = state);
	socket.on(PACKET.ACK_PROJECT_LIST, data => app_state.available_projects = data.projects);
	socket.once('connected', () => app_state.local_load_project_id());

	socket.init();
})();