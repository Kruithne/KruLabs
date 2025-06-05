import { EventsSocket } from './events.js'
import { createApp } from './vue.esm.prod.js';

const touchpad_name = location.pathname.split('/').pop();
document.title += ' :: ' + touchpad_name;

const events = new EventsSocket();
const state = createApp({
	data() {
		return {
			buttons: [],
			active_button_index: -1
		}
	},

	methods: {
		press(button) {
			this.active_button_index = this.buttons.indexOf(button);
			events.publish('touchpad:press', { layout: touchpad_name, index: this.active_button_index });
		},

		release() {
			if (this.active_button_index > -1) {
				events.publish('touchpad:release', { layout: touchpad_name, index: this.active_button_index });
				this.active_button_index = -1;
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