import * as socket from './socket.js';
import { PACKET } from './packet.js';
import * as THREE from './three.module.min.js';

// MARK: :constants
const SOURCE_DIR = './sources/';

// MARK: :zone rendering
const zones = new Map();

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();

const aspect_ratio = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(-2 * aspect_ratio, 2 * aspect_ratio, 2, -2, 0.1, 100);

const base_material = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0 });

camera.position.z = 5;

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000);

function animate(ts) {
	requestAnimationFrame(animate);
	renderer.render(scene, camera);
	update_timers(ts);
}

function update_zone_plane(zone, render_order) {
	const plane = zone.plane;
	const geometry = plane.geometry;

	if (render_order !== undefined)
		plane.renderOrder = render_order;

	const vertices = geometry.attributes.position;
	const camera_positions = zone.corners.map(p => ({
		x: (p.x * 2 - 1) * camera.right,
		y: -(p.y * 2 - 1) * camera.top
	}));

	vertices.setXY(0, camera_positions[0].x, camera_positions[0].y);
	vertices.setXY(1, camera_positions[1].x, camera_positions[1].y);
	vertices.setXY(2, camera_positions[3].x, camera_positions[3].y);
	vertices.setXY(3, camera_positions[2].x, camera_positions[2].y);

	vertices.needsUpdate = true;
}

function update_all_planes() {
	for (const zone of zones.values())
		update_zone_plane(zone);
}

function update_zones(new_zones) {
	const new_zone_entries = Object.entries(new_zones);
	let render_order = new_zone_entries.length;

	for (const [zone_id, zone] of new_zone_entries) {
		const existing_zone = zones.get(zone_id);
		if (existing_zone) {
			existing_zone.corners = zone.corners;
			existing_zone.accessor_id = zone.accessor_id;

			update_zone_plane(existing_zone, render_order--);
		} else {
			const geometry = new THREE.PlaneGeometry(2, 2);
			const plane = new THREE.Mesh(geometry, base_material);

			const new_zone = {
				plane,
				corners: zone.corners,
				accessor_id: zone.accessor_id.toLowerCase(),
			};

			update_zone_plane(new_zone, render_order--);
			
			scene.add(plane);
			zones.set(zone_id, new_zone);
		}
	}

	for (const [zone_id, zone] of zones) {
		if (!(zone_id in new_zones)) {
			scene.remove(zone.plane);
			zones.delete(zone_id);
		}
	}
}

function handle_window_resize() {
	const aspect_ratio = window.innerWidth / window.innerHeight;
	camera.left = -2 * aspect_ratio;
	camera.right = 2 * aspect_ratio;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	update_all_planes();
}

function set_zone_debug_state(state) {
	base_material.opacity = state ? 1 : 0;
}

// MARK: :overlays
function set_test_screen(state) {
	const test_screen = document.getElementById('test-screen');
	if (test_screen)
		test_screen.style.display = state ? 'block' : 'none';
}

function set_blackout_state(state, time) {
	const blackout = document.getElementById('blackout');
	if (blackout) {
		blackout.style.transitionDuration = time + 'ms';
		blackout.style.opacity = state ? 1 : 0;
	}
}

// MARK: :media
const active_media = new Map();
const preloaded_tracks = new Map();

let playback_volume = 1;

function handle_play_media_event(event, autoplay = true) {
	let track = preloaded_tracks.get(event.uuid);
	if (track === undefined) {
		track = document.createElement('video');
		track.style.display = 'none';
		document.body.appendChild(track);

		track.src = SOURCE_DIR + event.src;
	} else {
		preloaded_tracks.delete(event.uuid);
	}

	track.loop = event.loop;
	track.volume = event.volume * playback_volume;

	// store channel lowercase ahead of time for channel comparison
	event.channel = event.channel.toLowerCase();

	const media_info = { track, event };
	active_media.set(event.uuid, media_info);

	if (autoplay)
		track.readyState > 0 ? track.play() : track.addEventListener('loadedmetadata', () => track.play());

	track.addEventListener('ended', () => {
		socket.send_string(PACKET.CONFIRM_MEDIA_END, event.uuid);
		stop_media_by_channel(event.channel);
	});

	if (event.zone_id?.length > 0) {
		const zone_id = event.zone_id.toLowerCase();
		const video_texture = new THREE.VideoTexture(track);
		const material = new THREE.MeshBasicMaterial({ map: video_texture });

		media_info.video_texture = video_texture;
		media_info.material = material;

		for (const zone of zones.values()) {
			if (zone_id == zone.accessor_id)
				zone.plane.material = material;
		}
	}

	return media_info;
}

function handle_media_length_event(src) {
	const track = create_media_track(src);
	track.addEventListener('loadedmetadata', () => {
		socket.send_object(PACKET.ACK_MEDIA_LENGTH, track.duration * 1000 ?? 0);
		track.remove();
	});
}

function create_media_track(src) {
	const track = document.createElement('video');
	track.style.display = 'none';
	document.body.appendChild(track);

	track.src = SOURCE_DIR + src;
	return track;
}

function handle_stop_media_event(event) {
	stop_media_by_channel(event.channel.toLowerCase());
}

function stop_media_by_channel(channel) {
	for (const media of active_media.values()) {
		if (media.event.channel == channel)
			dispose_media(media);
	}
}

function dispose_media(media) {
	if (!media.track.paused)
		media.track.pause();

	media.track.remove();

	for (const zone of zones.values())
		if (zone.plane.material === media.material)
			zone.plane.material = base_material;
	
	media.video_texture?.dispose();
	media.material?.dispose();

	active_media.delete(media.event.uuid);
}

function handle_playback_seek_event(event) {
	// positive is forward, negative is backward seek
	const disposed = new Set();
	for (const media of active_media.values()) {
		const new_time = media.track.currentTime + (event.delta / 1000);
		if (new_time < 0 || new_time >= media.track.duration) {
			disposed.add(media.event.uuid);
			dispose_media(media);
			socket.send_string(PACKET.CONFIRM_MEDIA_END, media.event.uuid);
		} else {
			media.track.currentTime = new_time;
		}
	}

	// to handle seeking into media that is not yet started, the seek event passes us an array
	// of media before the seek time. we start all of this media, set the relative seek time
	// within the media, and then immediately dispose of media which is out-of-bounds.
	for (const media of event.media) {
		if (active_media.has(media.event.uuid) || disposed.has(media.event.uuid))
			continue;

		const media_info = handle_play_media_event(media.event, event.state);
		const track = media_info.track;

		track.addEventListener('loadedmetadata', () => {
			if (media.time > track.duration * 1000)
				dispose_media(media_info);
			else
				track.currentTime = media.time / 1000;
		}, { once: true });
	}
}

function handle_playback_hold_event() {
	for (const media of active_media.values())
		media.track.pause();
}

function handle_playback_go_event() {
	for (const media of active_media.values())
		media.track.play();
}

function handle_reset_media_event() {
	for (const track of preloaded_tracks.values())
		track.remove();

	preloaded_tracks.clear();

	for (const media of active_media.values())
		dispose_media(media);
}

function handle_media_preload_event(event) {
	const preload_promises = [];
	for (const media of event) {
		const track = document.createElement('video');
		track.style.display = 'none';
		document.body.appendChild(track);
	
		track.src = SOURCE_DIR + media.src;

		preload_promises.push(new Promise(res => track.addEventListener('loadedmetadata', res, { once: true })));
		preloaded_tracks.set(media.uuid, track);
	}

	Promise.all(preload_promises).then(() => socket.send_empty(PACKET.ACK_MEDIA_PRELOAD));
}

function handle_playback_volume_event(volume) {
	playback_volume = volume;
	for (const media of active_media.values())
		media.track.volume = media.event.volume * volume;
}

// MARK: :live
let live_canvas_width = 1;
let live_canvas_height = 1;

let live_data = null;
const live_zones = new Set();

function handle_live_camera_frame(frame) {
	if (live_data === null)
		return;

	const image_data = live_data.ctx.createImageData(live_data.canvas.width, live_data.canvas.height);
	image_data.data.set(frame);

	live_data.ctx.putImageData(image_data, 0, 0);

	for (const zone of live_zones)
		zone.plane.material.map.needsUpdate = true;
}

function handle_live_camera_dimensions(event) {
	live_canvas_width = event.width;
	live_canvas_height = event.height;

	if (live_data) {
		live_data.canvas.width = live_canvas_width;
		live_data.canvas.height = live_canvas_height;
	}
}

function handle_start_live_event(event) {
	const canvas = document.createElement('canvas');
	canvas.width = live_canvas_width;
	canvas.height = live_canvas_height;

	const ctx = canvas.getContext('2d');

	const zone_id = event.zone_id.toLowerCase();
	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.MeshBasicMaterial({ map: texture });

	for (const zone of zones.values()) {
		if (zone_id == zone.accessor_id) {
			zone.plane.material = material;
			live_zones.add(zone);
		}
	}

	live_data = {
		canvas, ctx, texture, material
	};
}

function handle_stop_live_event() {
	for (const zone of live_zones)
		zone.plane.material = base_material;

	live_zones.clear();
	live_data = null;

	socket.unregister_packet(PACKET.LIVE_CAMERA_FRAME);
}

// MARK: :timers
const timers = new Map();
function handle_timer_create_event(event) {
	const timer_id = event.timer_id.toLowerCase();
	delete_timer(timer_id);

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	
	ctx.font = event.font;
	ctx.fillStyle = event.color;
	
	const metrics = ctx.measureText('00:00:00');
	canvas.width = metrics.width;
	canvas.height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
	
	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.MeshBasicMaterial({ map: texture });
	
	const timer = {
		canvas, ctx, material, texture,
		value: 0, running: false,
		font: event.font, color: event.color
	};
	
	timers.set(timer_id, timer);
	update_timer(timer, 0);
	
	const zone_id = event.zone_id.toLowerCase();
	for (const zone of zones.values()) {
		if (zone.accessor_id == zone_id)
			zone.plane.material = material;
	}
}

function delete_timer(timer_id) {
	const timer = timers.get(timer_id);
	if (timer) {
		dispose_timer(timer);
		timers.delete(timer_id);
	}
}

function dispose_timer(timer) {
	for (const zone of zones.values()) {
		if (zone.plane.material == timer.material)
			zone.plane.material = base_material;
	}

	timer.material.dispose();
	timer.texture.dispose();
}

function update_timer(timer, value) {
	timer.value = value;
	const time_str = format_timespan(value);
	
	timer.ctx.fillStyle = 'black';
	timer.ctx.fillRect(0, 0, timer.canvas.width, timer.canvas.height);

	timer.ctx.font = timer.font;
	timer.ctx.fillStyle = timer.color;
	timer.ctx.fillText(time_str, 0, timer.ctx.measureText(time_str).actualBoundingBoxAscent);
	
	timer.texture.needsUpdate = true;
}

function handle_timer_set_event(event) {
	const timer = timers.get(event.timer_id.toLowerCase());
	if (timer)
		update_timer(timer, event.value);
}

function handle_timer_start_event(event) {
	const timer = timers.get(event.timer_id.toLowerCase());
	if (timer)
		timer.running = true;
}

function handle_timer_remove_event(event) {
	delete_timer(event.timer_id.toLowerCase());
}

function handle_timer_remove_all_event() {
	for (const timer of timers.values())
		dispose_timer(timer);

	timers.clear();
}

let last_timer_update = null;
function update_timers(ts) {
	if (last_timer_update === null) {
		last_timer_update = ts;
		return;
	}

	const elapsed = ts - last_timer_update;
	last_timer_update = ts;
	
	for (const timer of timers.values())
		if (timer.running) {
			const new_value = Math.max(0, timer.value - elapsed);
			if (new_value !== timer.value)
				update_timer(timer, new_value);
		}
}

function pad_time_unit(unit) {
	return String(unit).padStart(2, '0');
}

function format_timespan(span) {
	const total_seconds = Math.floor(span / 1000);
	const hours = Math.floor(total_seconds / 3600);
	const minutes = Math.floor((total_seconds % 3600) / 60);
	const seconds = total_seconds % 60;
	
	return `${pad_time_unit(hours)}:${pad_time_unit(minutes)}:${pad_time_unit(seconds)}`;
}

// MARK: :init
(async () => {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });

	let activator = document.getElementById('activator');
	if (activator) {
		activator.addEventListener('click', () => {
			socket.send_object(PACKET.PROJECTOR_CLIENT_NEEDS_ACTIVATION, false);
			activator.remove();
			activator = null;
		});
	}

	document.body.appendChild(renderer.domElement);
	window.addEventListener('resize', handle_window_resize);

	socket.on(PACKET.ZONES_UPDATED, update_zones);
	socket.on(PACKET.SET_TEST_SCREEN, set_test_screen);
	socket.on(PACKET.SET_BLACKOUT_STATE, data => set_blackout_state(data.state, data.time));
	socket.on(PACKET.CUE_EVENT_PLAY_MEDIA, handle_play_media_event);
	socket.on(PACKET.CUE_EVENT_STOP_MEDIA, handle_stop_media_event);
	socket.on(PACKET.REQ_MEDIA_LENGTH, handle_media_length_event);
	socket.on(PACKET.PLAYBACK_HOLD, handle_playback_hold_event);
	socket.on(PACKET.PLAYBACK_GO, handle_playback_go_event);
	socket.on(PACKET.RESET_MEDIA, handle_reset_media_event);
	socket.on(PACKET.SET_ZONE_DEBUG_STATE, set_zone_debug_state);
	socket.on(PACKET.PLAYBACK_MEDIA_SEEK, handle_playback_seek_event);
	socket.on(PACKET.REQ_MEDIA_PRELOAD, handle_media_preload_event);
	socket.on(PACKET.PLAYBACK_VOLUME, handle_playback_volume_event);
	socket.on(PACKET.LIVE_CAMERA_FRAME, handle_live_camera_frame);
	socket.on(PACKET.CUE_EVENT_START_LIVE, handle_start_live_event);
	socket.on(PACKET.CUE_EVENT_STOP_LIVE, handle_stop_live_event);
	socket.on(PACKET.LIVE_CAMERA_DIMENSIONS, handle_live_camera_dimensions);
	socket.on(PACKET.CUE_EVENT_CREATE_TIMER, handle_timer_create_event);
	socket.on(PACKET.CUE_EVENT_SET_TIMER, handle_timer_set_event);
	socket.on(PACKET.CUE_EVENT_START_TIMER, handle_timer_start_event);
	socket.on(PACKET.CUE_EVENT_REMOVE_TIMER, handle_timer_remove_event);
	socket.on(PACKET.REMOVE_ALL_TIMERS, handle_timer_remove_all_event);
	
	let first_time = true;
	socket.on('statechange', state => {
		if (state === socket.SOCKET_STATE_CONNECTED) {
			socket.send_empty(PACKET.REQ_ZONES);
			socket.send_empty(PACKET.REQ_PLAYBACK_VOLUME);

			if (first_time) {
				// display an activator overlay that disappears when clicking, this is visual feedback to
				// ensure calls to HTMLMediaElement.play() will not fail due to lack of user interactivity.
				if (activator !== null)
					socket.send_object(PACKET.PROJECTOR_CLIENT_NEEDS_ACTIVATION, true);

				first_time = false;
			}
		}
	});
	
	socket.init();
	requestAnimationFrame(animate);
})();