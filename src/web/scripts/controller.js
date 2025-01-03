import { createApp } from './vue.js';
import * as socket from './socket.js';

// MARK: :state
let modal_confirm_resolver = null;
let app = null;

const reactive_state = {
	data() {
		return {
			nav_pages: ['project', 'tracks', 'cues', 'zones', 'config'],
			nav_page: 'project',
			
			socket_state: 0x0,
			
			project_last_save_hash: 0,
			selected_project_id: null,
			available_projects: [
				{
					"name": "Timeless",
					"last_saved": 1704597600000,
					"id": "550e8400-e29b-41d4-a716-446655440000"
				},
				{
					"name": "ICONIC",
					"last_saved": 1704297600000,
					"id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
				},
				{
					"name": "Tonight...",
					"last_saved": 1704297600000,
					"id": "7ba7b810-9dad-11d1-80b4-00c04fd430c9"
				},
				{
					"name": "Bill & Fred' Excellent Adventure",
					"last_saved": 1704297600000,
					"id": "8ba7b810-9dad-11d1-80b4-00c04fd430c0"
				},
				{
					"name": "A Festive Christmas Spectacular",
					"last_saved": 1704297600000,
					"id": "9ba7b810-9dad-11d1-80b4-00c04fd430c1"
				},
				{
					"name": "Starlight Chronicles",
					"last_saved": 1704297600000,
					"id": "aba7b810-9dad-11d1-80b4-00c04fd430c2"
				},
				{
					"name": "Aslyum",
					"last_saved": 1704297600000,
					"id": "bba7b810-9dad-11d1-80b4-00c04fd430c3"
				},
				{
					"name": "Hospital",
					"last_saved": 1704297600000,
					"id": "cba7b810-9dad-11d1-80b4-00c04fd430c4"
				},
				{
					"name": "Nutcracker",
					"last_saved": 1704297600000,
					"id": "dba7b810-9dad-11d1-80b4-00c04fd430c5"
				},
				{
					"name": "Art Attack",
					"last_saved": 1804297600000,
					"id": "eba7b810-9dad-11d1-80b4-00c04fd430c6"
				},
				{
					"name": "Begin Again",
					"last_saved": 1704297600000,
					"id": "fba7b810-9dad-11d1-80b4-00c04fd430c7"
				},
				{
					"name": "Timeless",
					"last_saved": 1704297600000,
					"id": "0ca7b810-9dad-11d1-80b4-00c04fd430d0"
				},
				{
					"name": "ICONIC",
					"last_saved": 1704297600000,
					"id": "1ca7b810-9dad-11d1-80b4-00c04fd430d1"
				},
				{
					"name": "Tonight...",
					"last_saved": 1704297600000,
					"id": "2ca7b810-9dad-11d1-80b4-00c04fd430d2"
				},
				{
					"name": "Bill & Fred' Excellent Adventure",
					"last_saved": 1704297600000,
					"id": "3ca7b810-9dad-11d1-80b4-00c04fd430d3"
				},
				{
					"name": "A Festive Christmas Spectacular",
					"last_saved": 1704297600000,
					"id": "4ca7b810-9dad-11d1-80b4-00c04fd430d4"
				},
				{
					"name": "Starlight Chronicles",
					"last_saved": 1704297600000,
					"id": "5ca7b810-9dad-11d1-80b4-00c04fd430d5"
				},
				{
					"name": "Aslyum",
					"last_saved": 1704297600000,
					"id": "6ca7b810-9dad-11d1-80b4-00c04fd430d6"
				},
				{
					"name": "Hospital",
					"last_saved": 1704297600000,
					"id": "7ca7b810-9dad-11d1-80b4-00c04fd430d7"
				},
				{
					"name": "Nutcracker",
					"last_saved": 1704297600000,
					"id": "8ca7b810-9dad-11d1-80b4-00c04fd430d8"
				},
				{
					"name": "Art Attack",
					"last_saved": 1704297600000,
					"id": "9ca7b810-9dad-11d1-80b4-00c04fd430d9"
				},
				{
					"name": "Begin Again",
					"last_saved": 1704297600000,
					"id": "aca7b810-9dad-11d1-80b4-00c04fd430da"
				},
				{
					"name": "Timeless",
					"last_saved": 1704297600000,
					"id": "bca7b810-9dad-11d1-80b4-00c04fd430db"
				},
				{
					"name": "ICONIC",
					"last_saved": 1704297600000,
					"id": "cca7b810-9dad-11d1-80b4-00c04fd430dc"
				},
				{
					"name": "Tonight...",
					"last_saved": 1704297600000,
					"id": "dca7b810-9dad-11d1-80b4-00c04fd430dd"
				},
				{
					"name": "Bill & Fred' Excellent Adventure",
					"last_saved": 1704297600000,
					"id": "eca7b810-9dad-11d1-80b4-00c04fd430de"
				},
				{
					"name": "A Festive Christmas Spectacular",
					"last_saved": 1704297600000,
					"id": "fca7b810-9dad-11d1-80b4-00c04fd430df"
				},
				{
					"name": "Starlight Chronicles",
					"last_saved": 1704297600000,
					"id": "0da7b810-9dad-11d1-80b4-00c04fd430e0"
				},
				{
					"name": "Aslyum",
					"last_saved": 1704297600000,
					"id": "1da7b810-9dad-11d1-80b4-00c04fd430e1"
				},
				{
					"name": "Hospital",
					"last_saved": 1704297600000,
					"id": "2da7b810-9dad-11d1-80b4-00c04fd430e2"
				},
				{
					"name": "Nutcracker",
					"last_saved": 1704297600000,
					"id": "3da7b810-9dad-11d1-80b4-00c04fd430e3"
				},
				{
					"name": "Art Attack",
					"last_saved": 1704297600000,
					"id": "4da7b810-9dad-11d1-80b4-00c04fd430e4"
				},
				{
					"name": "Begin Again",
					"last_saved": 1704297600000,
					"id": "5da7b810-9dad-11d1-80b4-00c04fd430e5"
				}
			],
			
			project_state: {
				name: 'Untitled Project',
				last_saved: Date.now()
			},
			
			loading_message: '',
			
			modal_title: '',
			modal_message: '',
			modal_is_active: false,
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

		get_project_by_id(id) {
			return this.available_projects.find(p => p.id === id);
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

			// todo: pull save data from server
			await new Promise(res => setTimeout(res, 3000)); // placeholder

			this.hide_loading_message();

			// todo: update the save hash with the new data pulled from server.
		},

		async save_selected_project() {
			const project_id = this.selected_project_id;
			this.show_loading_message('SAVING PROJECT');

			// todo: send serialized state to the server.
			await new Promise(res => setTimeout(res, 3000)); // placeholder

			this.hide_loading_message();
			this.project_last_save_hash = hash_object(this.project_state);
		},

		async delete_selected_project() {
			const project_id = this.selected_project_id;
			const project = this.get_project_by_id(project_id);

			if (project === undefined)
				return;

			const user_confirm = await show_confirm_modal('CONFIRM PROJECT DELETION', `Are you sure you want to delete the project '${project.name}'? This action cannot be reversed.`);
			if (user_confirm) {
				// todo: send deletion to server

				this.selected_project_id = null;
				this.available_projects.splice(this.available_projects.indexOf(project), 1);
			}
		}
	}
};

// MARK: :modal
async function show_confirm_modal(title, message) {
	app.modal_message = message;
	app.modal_title = title;
	app.modal_is_active = true;
	
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

async function document_ready() {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });
}

function hash_object(obj) {
	const str = JSON.stringify(obj);
	let hash = 0

	for (let i = 0; i < str.length; i++)
		hash = ((hash << 5) - hash) + str.charCodeAt(i);

	return hash >>> 0;
}

// MARK: :init
(async () => {
	await document_ready();
	
	app = createApp(reactive_state).mount('#app');
	
	socket.on_state_change(state => app.socket_state = state);
	socket.init();
})();