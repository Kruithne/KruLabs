import * as socket from './socket.js';
import { PACKET } from './packet.js';
import * as THREE from './three.module.min.js';

const zones = new Map();

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();

const aspect_ratio = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(-2 * aspect_ratio, 2 * aspect_ratio, 2, -2, 0.1, 100);

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
			const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
			const plane = new THREE.Mesh(geometry, material);

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

// MARK: :init
(async () => {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });

	document.body.appendChild(renderer.domElement);
	window.addEventListener('resize', handle_window_resize);

	socket.on(PACKET.ZONES_UPDATED, update_zones);
	socket.on(PACKET.SET_TEST_SCREEN, set_test_screen);
	socket.on(PACKET.SET_BLACKOUT_STATE, data => set_blackout_state(data.state, data.time));
	
	socket.on('statechange', state => {
		if (state === socket.SOCKET_STATE_CONNECTED)
			socket.send_empty(PACKET.REQ_ZONES);
	});
	
	socket.init();
	animate();
})();