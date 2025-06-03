import { SocketInterface } from './socket.js'
import { createApp } from './vue.esm.prod.js';

const touchpad_name = location.pathname.split('/').pop();
document.title += ' :: ' + touchpad_name;

const socket = new SocketInterface('touchpad');

const state = createApp({
	data() {
		return {
			buttons: []
		}
	},

	methods: {
		trigger(button) {
			const index = this.buttons.indexOf(button);
			socket.send('trigger', { layout: touchpad_name, index });
		}
	}
}).mount('#container');

socket.on('ready', () => {
	socket.send('load', { layout: touchpad_name });
});

socket.on('event:layout', data => {
	state.buttons = data.buttons;
});