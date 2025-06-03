const SOCKET_RECONNECT_DELAY = 100; // backoff base
const SOCKET_BACKOFF_MAX = 5000; // maximum backoff

class MultiMap {
	constructor() {
		this._map = new Map();
	}

	insert(key, value) {
		if (!this._map.has(key))
			this._map.set(key, new Set());

		this._map.get(key).add(value);
	}

	remove(key, value) {
		const set = this._map.get(key);
		if (set === undefined)
			return;

		set.delete(value);

		if (set.size === 0)
			this._map.delete(key);
	}

	callback(key, ...params) {
		const callbacks = this._map.get(key);
		if (callbacks === undefined)
			return 0;

		for (const callback of callbacks)
			callback(...params);

		return callbacks.size;
	}

	clear() {
		this._map.clear();
	}
}

function get_ws_url() {
	const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
	return `${protocol}${window.location.host}`;
}

export class EventsSocket {
	constructor() {
		this.socket = null;
		this.backoff = 0;
		this._events = new MultiMap();

		this._connect();
	}

	subscribe(id, callback) {
		this._events.insert(id, callback);

		if (id.indexOf(':') !== -1)
			this._send('subscribe', id);
	}

	publish(id, data) {
		this._send('publish', id, data);
	}

	_send(action, id, data) {
		const payload = JSON.stringify({ action, id, data });
		this.socket?.send(payload);
	}

	_disconnect() {
		this.socket?.close();
	}

	_queue_reconnect() {
		this.backoff++;

		const delay = Math.min(SOCKET_RECONNECT_DELAY * Math.pow(2, this.backoff - 1), SOCKET_BACKOFF_MAX);
		console.info('reconnecting in %dms', delay);

		setTimeout(this._connect.bind(this), delay);
	}

	_connect() {
		const socket = new WebSocket(get_ws_url());
		socket.addEventListener('open', this._open.bind(this));
		socket.addEventListener('close', this._close.bind(this));
		socket.addEventListener('message', this._message.bind(this));
		socket.addEventListener('error', this._error.bind(this));
		
		this.socket = socket;
	}

	_open() {
		this.backoff = 0;
		console.log('events socket connected');
		this._events.callback('connected');
	}

	_close(event) {
		console.error('event socket disconnected: [%d] %s', event.code, event.reason);
		this._events.clear();
		this._queue_reconnect();
	}

	_message(event) {
		try {
			const data = JSON.parse(event.data);
			this._events.callback(data.id, data.data ?? null);
		} catch (e) {
			console.error('failed to process socket message: %o', e);
		}
	}

	_error(event) {
		console.error('event socket error: %o', event);
	}
}