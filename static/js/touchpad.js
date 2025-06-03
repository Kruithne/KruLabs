import { EventsSocket } from './events.js'
import { createApp } from './vue.esm.prod.js';

const touchpad_name = location.pathname.split('/').pop();
document.title += ' :: ' + touchpad_name;

const events = EventsSocket();
const state = createApp({
	data() {
		return {
			buttons: []
		}
	},

	methods: {
		trigger(button) {
			const index = this.buttons.indexOf(button);
			events.publish('touchpad:trigger', { layout: touchpad_name, index });
		}
	}
}).mount('#container');

events.subscribe('connected', () => {
	events.publish('touchpad:load', { layout: touchpad_name });

	events.subscribe('touchpad:layout', data => {
		state.buttons = data.buttons;
	});
});