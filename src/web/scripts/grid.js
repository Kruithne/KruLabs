import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';
import { INTEGRATION_TYPE, INTEGRATION_LABELS } from './integration_type.js';

// MARK: :constants
const PROJECT_MANAGEMENT_TIMEOUT = 10000; // timeout in ms that state callback timeout (load, save, etc)
const MIN_LOADING_ELAPSED = 500; // minimum time in ms a loading message is visible for

const INTEGRATION_UPDATE_DEBOUNCE = 500; // time in milliseconds to debounce sending integration changes to server

const NOOP = () => {};

// local storage keys
const LSK_LAST_PROJECT_ID = 'last_project_id';

const BUTTON_TYPE_NORMAL = 0x1;
const BUTTON_TYPE_TOGGLE = 0x2;
const BUTTON_TYPE_TOUCH = 0x3;

const BUTTON_TYPES = {
	[BUTTON_TYPE_NORMAL]: { label: 'NORMAL' },
	[BUTTON_TYPE_TOGGLE]: { label: 'TOGGLE' },
	[BUTTON_TYPE_TOUCH]: { label: 'TOUCH' }
};

const DEFAULT_PROJECT_STATE = {
	name: 'Untitled Grid',
	integrations: [],
	tabs: [],
	grid_columns: 3
};

const DEFAULT_INTEGRATION_STATE = {
	name: 'INT1',
	enabled: false,
	type: INTEGRATION_TYPE.NONE,
	meta: {}
};

const INTEGRATION_META = {
	[INTEGRATION_TYPE.OBS]: {
		obs_host: 'localhost',
		obs_port: 4455,
		obs_password: ''
	},

	[INTEGRATION_TYPE.ETC]: {
		etc_host: 'localhost',
		etc_port: 3032
	}
};

const DEFAULT_TAB_STATE = {
	name: 'Untitled Tab',
	buttons: []
};

const DEFAULT_BUTTON_STATE = {
	name: 'Button',
	commands: [],
	type: BUTTON_TYPE_NORMAL,
	meta: {}
};

const BUTTON_META = {
	[BUTTON_TYPE_NORMAL]: {
		script: '',
	},

	[BUTTON_TYPE_TOGGLE]: {
		script_in: '',
		script_out: '',
		active: false
	},

	[BUTTON_TYPE_TOUCH]: {
		script_in: '',
		script_out: '',
		active: false
	}
};

// MARK: :state
let modal_confirm_resolver = null;
let app_state = null;

let integrations_update_debounce_timer = -1;

const integration_fast_map = new Map();

const reactive_state = {
	data() {
		return {
			nav_pages: ['project', 'grid', 'tabs', 'integrations'],
			nav_page: '',

			active_tab: null,

			edit_mode: 'NONE', // NONE | TABS

			selected_tab: null,
			selected_button: null,
			selected_integration: null,

			integration_status: {},
			
			socket_state: 0x0,
			
			project_last_save_hash: 0,
			selected_project_id: null,
			available_projects: [],
			
			project_state: structuredClone(DEFAULT_PROJECT_STATE),

			server_addr: 'IPv4 Unknown',
			
			loading_message: '',
			
			modal_title: '',
			modal_message: '',
			modal_type: 'NONE',
			modal_is_active: false,

			INTEGRATION_LABELS,
			BUTTON_TYPES
		}
	},

	// MARK: :watch
	watch: {
		nav_page(new_page) {
			this.edit_mode = 'NONE';

			if (new_page === 'project')
				socket.send_object(PACKET.REQ_PROJECT_LIST, { project_type: 'GRID' });
		},

		'selected_integration.type': {
			handler(integration_type) {
				if (this.selected_integration && this.selected_integration.meta.id !== integration_type) {
					const meta = object_clone(INTEGRATION_META[integration_type]) ?? {};

					this.selected_integration.meta = meta;
					this.selected_integration.meta.id = integration_type;
				}
			}
		},

		'selected_button.type': {
			handler(button_type) {
				if (this.selected_button && this.selected_button.meta?.id !== button_type) {
					const meta = object_clone(BUTTON_META[button_type]) ?? {};

					this.selected_button.meta = meta;
					this.selected_button.meta.id = button_type;
				}
			}
		},

		'project_state.integrations': {
			deep: true,
			handler(integrations) {
				integration_fast_map.clear();

				for (const int of integrations)
					integration_fast_map.set(int.name.toLowerCase(), int);

				clearTimeout(integrations_update_debounce_timer);
				integrations_update_debounce_timer = setTimeout(() => {
					socket.send_object(PACKET.UPDATE_INTEGRATIONS, { integrations });
				}, INTEGRATION_UPDATE_DEBOUNCE);
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

		current_tab_buttons() {
			return this.selected_tab?.buttons;
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

		handle_button_down(button) {
			if (button.type == BUTTON_TYPE_NORMAL) {
				execute_script(button.meta.script);
			} else if (button.type == BUTTON_TYPE_TOGGLE) {
				if (button.meta.active) {
					execute_script(button.meta.script_out);
					button.meta.active = false;
				} else {
					execute_script(button.meta.script_in);
					button.meta.active = true;
				}
			} else if (button.type == BUTTON_TYPE_TOUCH) {
				if (!button.meta.active) {
					execute_script(button.meta.script_in);
					button.meta.active = true;
				}
			}
		},

		handle_button_up(button) {
			if (button.type == BUTTON_TYPE_TOUCH) {
				if (button.meta.active) {
					execute_script(button.meta.script_out);
					button.meta.active = false;
				}
			}
		},

		// MARK: :integration methods
		update_integration_status(data) {
			this.integration_status[data.id] = data.connected;
		},

		integration_add() {
			const new_int = structuredClone(DEFAULT_INTEGRATION_STATE);
			const integrations = this.project_state.integrations;

			new_int.id = crypto.randomUUID();

			let name_index = 2;
			while (this.is_integration_name_used(new_int.name))
				new_int.name = `INT${name_index++}`;

			let new_index = integrations.length;
			if (this.selected_integration !== null)
				new_index = integrations.indexOf(this.selected_integration) + 1;

			integrations.splice(new_index, 0, new_int);
			this.selected_integration = new_int;
		},

		is_integration_name_used(name) {
			return this.project_state.integrations.some(e => e.name === name);
		},

		async integration_delete() {
			if (this.selected_integration === null)
				return;

			const integrations = this.project_state.integrations;
			const int_index = integrations.indexOf(this.selected_integration);
			integrations.splice(int_index, 1);
			
			const previous_int = integrations[int_index > 0 ? int_index - 1 : 0];
			this.selected_integration = previous_int ?? null;
		},

		// MARK: :tab methods
		tab_add() {
			const new_tab = structuredClone(DEFAULT_TAB_STATE);
			const tabs = this.project_state.tabs;

			new_tab.id = crypto.randomUUID();

			let new_index = tabs.length;
			if (this.selected_tab !== null)
				new_index = tabs.indexOf(this.selected_tab) + 1;

			tabs.splice(new_index, 0, new_tab);
			this.selected_tab = new_tab;

			this.edit_mode = 'TAB';
		},

		async tab_delete() {
			if (this.selected_tab === null)
				return;

			this.edit_mode = 'NONE';

			const tabs = this.project_state.tabs;

			const tab_index = tabs.indexOf(this.selected_tab);
			tabs.splice(tab_index, 1);
			
			const previous_tab = tabs[tab_index > 0 ? tab_index - 1 : 0];
			this.selected_tab = previous_tab ?? null;
		},

		tab_duplicate() {
			if (this.selected_tab === null)
				return;

			const new_tab = object_clone(this.selected_tab);
			const tabs = this.project_state.tabs;

			new_tab.id = crypto.randomUUID();

			let new_index = tabs.length;
			if (this.selected_tab !== null)
				new_index = tabs.indexOf(this.selected_tab) + 1;

			tabs.splice(new_index, 0, new_tab);
			this.selected_tab = new_tab;

			this.edit_mode = 'TAB';
		},

		tab_move_down() {
			if (this.selected_tab === null)
				return;

			move_element(this.project_state.tabs, this.selected_tab, 1);
		},

		tab_move_up() {
			if (this.selected_tab === null)
				return;

			move_element(this.project_state.tabs, this.selected_tab, -1);
		},

		// MARK: :button methods
		button_add() {
			if (this.selected_tab === null)
				return;

			const new_button = structuredClone(DEFAULT_BUTTON_STATE);
			const buttons = this.selected_tab.buttons;

			new_button.id = crypto.randomUUID();

			let new_index = buttons.length;
			if (this.selected_button !== null)
				new_index = buttons.indexOf(this.selected_button) + 1;

			buttons.splice(new_index, 0, new_button);
			this.selected_button = new_button;

			this.edit_mode = 'BUTTON';
		},

		async button_delete() {
			if (this.selected_button === null || this.selected_tab === null)
				return;

			this.edit_mode = 'NONE';

			const buttons = this.selected_tab.buttons;
			const button_index = buttons.indexOf(this.selected_button);
			buttons.splice(button_index, 1);
			
			const previous_tab = buttons[button_index > 0 ? button_index - 1 : 0];
			this.selected_button = previous_tab ?? null;
		},

		button_duplicate() {
			if (this.selected_tab === null || this.selected_button === null)
				return;

			const new_button = object_clone(this.selected_button);
			const buttons = this.selected_tab.buttons;

			new_button.id = crypto.randomUUID();

			let new_index = buttons.length;
			if (this.selected_button !== null)
				new_index = buttons.indexOf(this.selected_button) + 1;

			buttons.splice(new_index, 0, new_button);
			this.selected_button = new_button;

			this.edit_mode = 'BUTTON';
		},

		button_move_down() {
			if (this.selected_button === null || this.selected_tab === null)
				return;

			move_element(this.selected_tab.buttons, this.selected_button, 1);
		},

		button_move_up() {
			if (this.selected_button === null || this.selected_tab === null)
				return;

			move_element(this.selected_tab.buttons, this.selected_button, -1);
		},

		// MARK: :project methods
		get_project_by_id(id) {
			return this.available_projects.find(p => p.id === id);
		},

		update_project_hash() {
			this.project_last_save_hash = hash_object(this.project_state);
		},

		set_project_state(state) {
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

			socket.send_object(PACKET.REQ_SAVE_PROJECT, { id: project_id, state: this.project_state, project_type: 'GRID' });

			const res = await socket.expect(PACKET.ACK_SAVE_PROJECT, PROJECT_MANAGEMENT_TIMEOUT).then(r => r).catch(NOOP);
			await this.hide_loading_message(load_start_ts);

			if (res?.success) {
				this.selected_project_id = res.id;
				this.update_project_hash();

				socket.send_object(PACKET.REQ_PROJECT_LIST, { project_type: 'GRID' });
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

					socket.send_object(PACKET.REQ_PROJECT_LIST, { project_type: 'GRID' });
					this.selected_project_id = null;
				} else {
					show_info_modal('PROJECT DELETION FAILED', 'The system was unable to delete the specified project.');
				}

				await this.hide_loading_message(load_start_ts);
			}
		}
	}
};

// MARK: :script parse
function execute_script(script) {
	const lines = script.split(/\r?\n/);
	for (const line of lines) {
		const parts = line.split('/');
		const int_id = parts.shift();

		const integration = integration_fast_map.get(int_id);
		if (integration) {
			if (integration.type == INTEGRATION_TYPE.ETC) {
				socket.send_object(PACKET.ETC_SEND_COMMAND, { command: parts.join('/'), args: [] });
			} else if (integration.type == INTEGRATION_TYPE.OBS) {
				if (parts[0] === 'scene' && parts[2] === 'go') {
					// hard-coded OBS command, expand in the future
					socket.send_object(PACKET.OBS_SET_SCENE_BY_NAME, {
						scene_name: parts[1],
						int_uuid: integration.id
					});
				}
			} else if (integration.type == INTEGRATION_TYPE.MEDIA) {
				// audio/channel/1/play/SOME_FILE_NAME.mp4/volume/0.5
				// audio/channel/1/pause
				// audio/channel/1/resume
				// audio/channel/1/fade/5
				// audio/pause_all
				// audio/resume_all

				const cmd = parts.shift();
				if (cmd === 'channel') {
					const channel = parseInt(parts.shift());
					const channel_cmd = parts.shift();

					console.log({ channel, channel_cmd });

					if (channel_cmd === 'play') {
						const track = parts.shift();
						let volume = 1.0;

						if (parts.length > 1 && parts[0] === 'volume')
							volume = parseFloat(parts[1]);

						console.log({ track, volume });

						socket.send_object(PACKET.AUDIO_PLAY_TRACK, { channel, track, volume });
					} else if (channel_cmd === 'pause') {
						socket.send_object(PACKET.AUDIO_PAUSE_CHANNEL, { channel });
					} else if (channel_cmd === 'resume') {
						socket.send_object(PACKET.AUDIO_RESUME_CHANNEL, { channel });
					} else if (channel_cmd === 'fade') {
						const time = parseFloat(parts.shift());
						socket.send_object(PACKET.AUDIO_FADE_CHANNEL, { channel, time });
					}
				} else if (cmd === 'pause_all') {
					socket.send_empty(PACKET.AUDIO_PAUSE_ALL);
				} else if (cmd === 'resume_all') {
					socket.send_empty(PACKET.AUDIO_RESUME_ALL);
				}
			}
		} else {
			console.log('cannot find integration %s', int_id);
		}
	}
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

function object_clone(obj) {
	if (obj === undefined)
		return undefined;

	return JSON.parse(JSON.stringify(obj));
}

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
	
	app_state = app.mount('#app');
	app_state.update_project_hash();
	
	socket.on('statechange', state => {
		app_state.socket_state = state;

		if (state === socket.SOCKET_STATE_CONNECTED) {
			socket.send_empty(PACKET.REQ_SERVER_ADDR);
			socket.send_object(PACKET.UPDATE_INTEGRATIONS, { integrations: app_state.project_state.integrations });
		}
	});

	socket.on(PACKET.ACK_SERVER_ADDR, addr => app_state.server_addr = addr);
	socket.on(PACKET.ACK_PROJECT_LIST, data => app_state.available_projects = data.projects);
	socket.on(PACKET.INTEGRATION_STATUS, data => app_state.update_integration_status(data));

	socket.init();
})();