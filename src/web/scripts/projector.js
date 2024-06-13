import { document_ready } from './util.js';
import * as socket from './socket.js';

let first_connection = true;
const $zone_elements = [];

const frame_width = 1920;
const frame_height = 1080;

const frame_center_x = frame_width / 2;
const frame_center_y = frame_height / 2;

const ext_to_tag = {
	'mp4': 'video',
	'png': 'img',
	'jpg': 'img'
};

function setup_zones(zones) {
	const $container = document.getElementById('container');
	const $used_zones = [];

	for (const zone of zones) {
		const zone_ext = zone.source.split('.').pop();
		const zone_tag = ext_to_tag[zone_ext] ?? 'video';

		let $zone_element = document.getElementById(zone.name);

		if ($zone_element && $zone_element.tagName.toLowerCase() !== zone_tag)
			$zone_element = undefined;

		const src_path = `/sources/${zone.source}`;

		if (!$zone_element) {
			$zone_element = document.createElement(zone_tag);
			$container.appendChild($zone_element);

			$zone_element.src = src_path;
		} else {
			const full_src_path = window.location.origin + src_path;
			if ($zone_element.src !== full_src_path)
				$zone_element.src = src_path;
		}

		$used_zones.push($zone_element);

		$zone_element.id = zone.name;
		$zone_element.classList.add('zone');

		const zone_width = frame_width * zone.scale_x;
		const zone_height = frame_height * zone.scale_y;

		$zone_element.style.width = zone_width + 'px';
		$zone_element.style.height = zone_height + 'px';

		const position_x = ((frame_center_x + zone.offset_x) - (zone_width / 2)) / frame_width
		$zone_element.style.left = `${position_x * 100}%`;

		const position_y = ((frame_center_y + zone.offset_y) - (zone_height / 2)) / frame_height;
		$zone_element.style.bottom = `${position_y * 100}%`;

		$zone_element.style.zIndex = zone.channel;
		$zone_element.style.transform = `rotate(${-zone.rotation}rad)`;
	}

	for (const element of $zone_elements) {
		if (!$used_zones.includes(element))
			element.remove();
	}

	$zone_elements.length = 0;
	$zone_elements.push(...$used_zones);
}

function suspend_videos() {
	for (const $zone of $zone_elements) {
		if ($zone.tagName.toLowerCase() === 'video')
			$zone.pause();
	}
}

(async () => {
	socket.register_socket_listener(handle_socket_message);
	socket.register_connection_callback(handle_connect);

	await document_ready();
	socket.socket_init(socket.CLIENT_IDENTITY.PROJECTOR);

	function handle_connect() {
		if (first_connection) {
			first_connection = false;
			socket.send_packet('CMSG_GET_ACTIVE_ZONES');
		}
	}

	function handle_socket_message(data) {
		if (data.op === 'SMSG_LIVE_GO') {
			for (const $zone of $zone_elements) {
				if ($zone.tagName.toLowerCase() === 'video')
					$zone.play();
			}
			return;
		}

		if (data.op === 'SMSG_LIVE_HOLD') {
			suspend_videos();
			return;
		}

		if (data.op === 'SMSG_LIVE_SEEK') {
			for (const $zone of $zone_elements) {
				if ($zone.tagName.toLowerCase() === 'video')
					$zone.currentTime = data.position / 1000;
			}

			return;
		}

		if (data.op === 'SMSG_SCENE_CHANGED') {
			suspend_videos();
			socket.send_packet('CMSG_GET_ACTIVE_ZONES');
			return;
		}

		if (data.op === 'SMSG_DATA_UPDATED') {
			socket.send_packet('CMSG_GET_ACTIVE_ZONES');
			return;
		}

		if (data.op === 'SMSG_ACTIVE_ZONES') {
			setup_zones(data.zones);
			return;
		}
	}
})();