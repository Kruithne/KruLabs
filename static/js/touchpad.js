import { EventsSocket } from './events.js'
import { createApp } from './vue.esm.prod.js';

const touchpad_name = location.pathname.split('/').pop();
document.title += ' :: ' + touchpad_name;

const events = new EventsSocket();
const state = createApp({
	data() {
		return {
			buttons: [],
			active_button: null
		}
	},

	methods: {
		press(button) {
			this.active_button = button;
			events.publish('touchpad:press', { layout: touchpad_name, index: this.buttons.indexOf(button) });
		},

		release() {
			if (this.active_button !== null) {
				events.publish('touchpad:release', { layout: touchpad_name, index: this.buttons.indexOf(this.active_button) });
				this.active_button = null;
			}
		}
	}
}).mount('#container');

events.subscribe('connected', () => {
	events.publish('touchpad:load', { layout: touchpad_name });

	events.subscribe('touchpad:layout', data => {
		state.buttons = data.buttons;
	});
});