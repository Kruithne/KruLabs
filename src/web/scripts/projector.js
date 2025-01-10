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

function animate() {
	requestAnimationFrame(animate);
	renderer.render(scene, camera);
}

function update_zone_plane(zone) {
	const plane = zone.plane;
	const geometry = plane.geometry;

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
	for (const [zone_id, zone] of Object.entries(new_zones)) {
		const existing_zone = zones.get(zone_id);
		if (existing_zone) {
			existing_zone.corners = zone.corners;
			existing_zone.accessor_id = zone.accessor_id;

			update_zone_plane(existing_zone);
		} else {
			const geometry = new THREE.PlaneGeometry(2, 2);
			const plane = new THREE.Mesh(geometry, base_material);

			const new_zone = {
				plane,
				corners: zone.corners,
				accessor_id: zone.accessor_id,
			};

			update_zone_plane(new_zone);
			
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
		blackout.style.transitionDuration = time + 's';
		blackout.style.opacity = state ? 1 : 0;
	}
}

// MARK: :media
const media_channels = new Map();

function handle_play_media_event(event) {
	stop_media_by_channel(event.channel);

	const track = document.createElement('video');
	track.style.display = 'none';
	document.body.appendChild(track); 

	track.src = SOURCE_DIR + event.src;
	track.loop = event.loop;
	track.volume = event.volume;

	const media_info = { track };
	media_channels.set(event.channel, media_info);

	track.addEventListener('loadedmetadata', () => track.play());
	track.addEventListener('ended', () => {
		socket.send_string(PACKET.CONFIRM_MEDIA_END, event.channel);
		stop_media_by_channel(event.channel);
	});

	if (event.zone_id?.length > 0) {
		const video_texture = new THREE.VideoTexture(track);
		const material = new THREE.MeshBasicMaterial({ map: video_texture });

		media_info.video_texture = video_texture;
		media_info.material = material;

		for (const zone of zones.values()) {
			if (event.zone_id == zone.accessor_id)
				zone.plane.material = material;
		}
	}
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
	stop_media_by_channel(event.channel);
}

function stop_media_by_channel(channel) {
	const media = media_channels.get(channel);
	if (media) {
		dispose_media(media);
		media_channels.delete(channel);
	}
}

function dispose_media(media) {
	if (!media.track.paused)
		media.track.pause();

	media.track.remove();

	for (const zone of zones.values())
		if (zone.plane.material === media.material)
			zone.plane.material = base_material;
	
	media.video_texture.dispose();
	media.material.dispose();
}

function handle_playback_hold_event() {
	for (const media of media_channels.values())
		media.track.pause();
}

function handle_playback_go_event() {
	for (const media of media_channels.values())
		media.track.play();
}

function handle_reset_media_event() {
	for (const media of media_channels.values())
		dispose_media(media);

	media_channels.clear();
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
	
	let first_time = true;
	socket.on('statechange', state => {
		if (state === socket.SOCKET_STATE_CONNECTED) {
			socket.send_empty(PACKET.REQ_ZONES);

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
	animate();
})();