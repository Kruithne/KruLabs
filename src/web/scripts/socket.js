import { PACKET, build_packet, parse_packet, PACKET_TYPE } from './packet.js';

// MARK: :constants
const RECONNECT_TIME = 2000;
const TRACKED_RESPONSE_TIMEOUT = 5000;

export const SOCKET_STATE_DISCONNECTED = 0x0;
export const SOCKET_STATE_CONNECTED = 0x1;
export const SOCKET_STATE_CONNECTING = 0x2;

// MARK: :prototype
Map.prototype.get_set_arr = function(key, value) {
	let arr = this.get(key);
	if (arr)
		arr.push(value);
	else
		this.set(key, [value]);
	return arr;
}

// MARK: :state
let ws;
let is_socket_open = false;

let is_dispatching = false;
let dispatching_register_ids = [];
let dispatching_packets = [];

let last_tracked_packet_id = 1;

const event_listeners = new Map();
const tracked_listeners = new Map();

const registered_packet_ids = [];

export function init() {
	set_socket_state(SOCKET_STATE_CONNECTING);

	ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/pipe`);
	
	ws.addEventListener('close', handle_socket_close);
	ws.addEventListener('error', console.error);
	ws.addEventListener('message', handle_socket_message);
	ws.addEventListener('open', handle_socket_open);
}

function generate_packet_uid() {
	if (last_tracked_packet_id === 0xFFFF)
		last_tracked_packet_id = 1;

	return last_tracked_packet_id++;
}

function timeout_fn(resolve, reject, timeout) {
	const timeout_id = setTimeout(reject, timeout);

	return (...params) => {
		clearTimeout(timeout_id);
		resolve(...params);
	};
}

export async function response(tracked_id, timeout = TRACKED_RESPONSE_TIMEOUT) {
	return new Promise(resolve => {
		if (timeout > 0) {
			tracked_listeners.set(tracked_id, timeout_fn(resolve, () => {
				tracked_listeners.delete(tracked_id);
				console.warn('Timed out waiting for tracked packet response %d', tracked_id);
			}, timeout));
		} else {
			tracked_listeners.set(tracked_id, resolve);
		}
	});
}

export async function expect(packet_id, timeout = 0) {
	register_packet(packet_id);
	return new Promise((resolve, reject) => {
		if (timeout > 0) {
			once(packet_id, timeout_fn(resolve, () => reject('Timed out waiting for expected packet ' + packet_id), timeout));
		} else {
			once(packet_id, resolve);
		}
	});
}

export function on(event, callback) {
	event_listeners.get_set_arr(event, callback);

	// register packets with server to receive them
	if (typeof event === 'number')
		register_packet(event);
}

export function off(event, callback) {
	const listeners = event_listeners.get(event);
	if (listeners !== undefined) {
		const index = listeners.indexOf(callback);
		if (index !== -1)
			listeners.splice(index, 1);
	}
}

export function once(event, callback) {
	const once_fn = data => {
		off(event, callback);
		callback(data);
	};

	on(event, once_fn);
}

function emit(event, data) {
	const listeners = event_listeners.get(event);
	if (listeners) {
		for (const callback of listeners)
			callback(data);
	}
}

function send(packet_id, packet_type, packet_data) {
	const uid = generate_packet_uid();
	queue_packet(build_packet(packet_id, packet_type, packet_data, uid));
	return uid;
}

export function send_empty(packet_id) {
	return send(packet_id, PACKET_TYPE.NONE, null);
}

export function send_string(packet_id, str) {
	return send(packet_id, PACKET_TYPE.STRING, str);
}

export function send_object(packet_id, obj) {
	return send(packet_id, PACKET_TYPE.OBJECT, obj);
}

export function send_binary(packet_id, data) {
	return send(packet_id, PACKET_TYPE.BINARY, data);
}

function queue_packet(packet) {
	dispatching_packets.push(packet);
	queue_dispatch();
}

function send_raw(packet) {
	ws.send(packet);
}

export function register_packet(packet_id) {
	if (!registered_packet_ids.includes(packet_id)) {
		if (is_socket_open) {
			if (!dispatching_register_ids.includes(packet_id))
				dispatching_register_ids.push(packet_id);

			queue_dispatch();
		}

		registered_packet_ids.push(packet_id);
	}
}

export function unregister_packet(packet_id) {
	const index = registered_packet_ids.indexOd(packet_id);
	if (index > -1)
		registered_packet_ids.splice(index, 1);

	send_object(PACKET.REQ_UNREGISTER, { packet_id });
}

function queue_dispatch() {
	if (!is_dispatching) {
		is_dispatching = true;
		queueMicrotask(process_dispatch);
	}
}

function process_dispatch() {
	if (is_socket_open) {
		// dispatch register events first
		if (dispatching_register_ids.length > 0)
			send_raw(build_packet(PACKET.REQ_REGISTER, PACKET_TYPE.OBJECT, { packets: dispatching_register_ids }));

		// dispatch packets
		for (const dispatch_packet of dispatching_packets)
			send_raw(dispatch_packet);
	}

	dispatching_register_ids = [];
	dispatching_packets = [];

	is_dispatching = false;
}

function set_socket_state(state) {
	emit('statechange', state);
}

function handle_socket_close() {
	is_socket_open = false;
	set_socket_state(SOCKET_STATE_DISCONNECTED);


	console.log('socket closed, attempting reconnection in %d ms', RECONNECT_TIME);
	setTimeout(init, RECONNECT_TIME);
}

async function handle_socket_message(event) {
	let data = event.data;
	if (data instanceof Blob)
		data = await data.arrayBuffer();

	const [packet, packet_type, uid] = parse_packet(data);

	if (uid > 0) {
		const tracked_resolver = tracked_listeners.get(uid);
		if (tracked_resolver) {
			tracked_resolver(packet.data);
			tracked_listeners.delete(uid);
		}
	}

	emit(packet.id, packet.data);
	emit('*', packet.data);
}

function handle_socket_open() {
	is_socket_open = true;
	set_socket_state(SOCKET_STATE_CONNECTED);

	if (registered_packet_ids.length > 0) {
		dispatching_register_ids.push(...registered_packet_ids);
		queue_dispatch();
	}
}