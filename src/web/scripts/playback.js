import { createApp } from './vue.js';
import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :state
let app_state = null;
const reactive_state = {
	data() {
		return {};
	}
};

// MARK: :utils
async function document_ready() {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });
}

// MARK: :audio
const audio_channels = new Map();

function audio_dispose_channel(channel_id) {
	const audio = audio_channels.get(channel_id);
	if (!audio)
		return;

	audio.pause();
	audio.src = '';

	audio_channels.delete(channel_id);
}

function audio_play_track(track_url, channel_id, volume = 1.0) {
	console.log({ track_url, channel_id, volume });
	audio_dispose_channel(channel_id);

	const audio = new Audio('audio/' + track_url);
	audio.volume = volume;
	audio.play();
	audio_channels.set(channel_id, audio);
}

function audio_pause_channel(channel_id) {
	audio_channels.get(channel_id)?.pause();
}

function audio_resume_channel(channel_id) {
	audio_channels.get(channel_id)?.play();
}

function audio_pause_all() {
	for (const audio of audio_channels.values())
		audio.pause();
}

function audio_resume_all() {
	for (const audio of audio_channels.values())
		audio.play();
}

function audio_fade_channel(channel_id, time) {
	const audio = audio_channels.get(channel_id);
	if (!audio)
		return;

	const start = audio.volume;
	const steps = 20;
	const interval = time * 1000 / steps;
	const volume_step = start / steps;
	
	let current_step = 0;
	
	const fade_interval = setInterval(() => {
		current_step++;
		audio.volume = Math.max(0, start - volume_step * current_step);
		
		if (current_step >= steps) {
			clearInterval(fade_interval);
			audio.volume = 0;
		}
	}, interval);
}

// MARK: :init
(async () => {
	await document_ready();
	
	const app = createApp();
	
	app_state = app.mount('#app');
	
	socket.on('statechange', state => {
		app_state.socket_state = state;

		if (state === socket.SOCKET_STATE_CONNECTED) {
			// stub
		}
	});

	socket.on(PACKET.AUDIO_PLAY_TRACK, data => audio_play_track(data.track, data.channel, data.volume));
	socket.on(PACKET.AUDIO_PAUSE_CHANNEL, data => audio_pause_channel(data.channel));
	socket.on(PACKET.AUDIO_RESUME_CHANNEL, data => audio_resume_channel(data.channel));
	socket.on(PACKET.AUDIO_PAUSE_ALL, data => audio_pause_all());
	socket.on(PACKET.AUDIO_RESUME_ALL, data => audio_resume_all());
	socket.on(PACKET.AUDIO_FADE_CHANNEL, data => audio_fade_channel(data.channel, data.time));

	socket.init();
})();