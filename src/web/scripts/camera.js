import * as socket from './socket.js';
import { PACKET } from './packet.js';

// MARK: :init
(async () => {
	if (document.readyState === 'loading')
		await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve), { once: true });
	
	socket.init();

	const $btn_live = document.getElementById('btn-live');
	const $btn_switch = document.getElementById('btn-switch-camera');

	const permissions = await navigator.permissions.query({ name: 'camera' });
	if (permissions.state === 'prompt')
		await navigator.mediaDevices.getUserMedia({ video: true });

	const $canvas = document.getElementById('camera-view');
	const context = $canvas.getContext('2d');

	const devices = await navigator.mediaDevices.enumerateDevices();

	let device_index = 0;
	let is_live = false;

	let last_frame = 0;
	const frame_interval = 1000 / 30; // 30 FPS

	const video = document.createElement('video');
	const update_stream = async () => {
		if (!video.paused)
			video.pause();

		video.srcObject = await navigator.mediaDevices.getUserMedia({
			video: {
				deviceId: devices[device_index].deviceId,
				facingMode: 'environment'
			}
		});
	
		video.setAttribute('playsinline', '');
		video.setAttribute('autoplay', '');
		video.setAttribute('muted', '');	

		await video.play();
	};

	const update_canvas_dimensions = () => {
		$canvas.width = video.videoWidth;
		$canvas.height = video.videoHeight;
	};

	await update_stream();

	video.addEventListener('loadedmetadata', () => update_canvas_dimensions());
	update_canvas_dimensions();
	
	const handle_frame = timestamp => {
		if (timestamp - last_frame >= frame_interval) {
			context.drawImage(video, 0, 0, $canvas.width, $canvas.height);

			if (is_live) {
				const frame_data = context.getImageData(0, 0, $canvas.width, $canvas.height).data;
				const header = new Uint16Array([$canvas.width, $canvas.height]);
				const packet = new Uint8Array(header.buffer.byteLength + frame_data.buffer.byteLength);
				packet.set(new Uint8Array(header.buffer), 0);
				packet.set(new Uint8Array(frame_data.buffer), header.buffer.byteLength);
				socket.send_binary(PACKET.LIVE_CAMERA_FRAME, packet);
			}

			last_frame = timestamp;
		}
		
		requestAnimationFrame(handle_frame);
	};

	$btn_live.addEventListener('click', () => {
		is_live = !is_live;
		$btn_live.value = is_live ? 'STOP' : 'START';
	});

	$btn_switch.addEventListener('click', () => {
		device_index = (device_index + 1) % devices.length;
		update_stream();
	});

	requestAnimationFrame(handle_frame);
})();