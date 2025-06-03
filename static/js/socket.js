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
}

class EventEmitter {
	constructor() {
		this._events = new MultiMap();
	}

	fire(event, ...params) {
		this._events.callback(event, ...params);
	}

	on(event, callback) {
		this._events.insert(event, callback);
	}

	once(event, callback) {
		const wrapper = () => {
			this._events.remove(event, wrapper);
			callback();
		};

		this._events.insert(event, wrapper);
	}
}

function get_ws_url() {
	const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
	return `${protocol}${window.location.host}`;
}

export class SocketInterface extends EventEmitter {
	constructor(type) {
		super();
		this.type = type;
		this.socket = null;
		this.ready = false;
		this.backoff = 0;

		this._connect();
	}

	_disconnect() {
		this.ready = false;
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

	send(id, data) {
		if (this.ready || id === 'identify')
			this._send({ id, data });
	}

	_send(object) {
		const payload = JSON.stringify(object);
		this.socket?.send(payload);
	}

	_open() {
		this.backoff = 0;
		this._send({ id: 'identify', type: this.type });
	}

	_close(event) {
		console.error('socket disconnected: [%d] %s', event.code, event.reason);
		this.ready = false;

		this._queue_reconnect();
	}

	_message(event) {
		try {
			const data = JSON.parse(event.data);

			if (data.id === 'identified') {
				this.ready = true;
				this.fire('ready');
			} else {
				this.fire('event:' + data.id, data.data ?? null);
			}
		} catch (e) {
			console.error('failed to process socket message: %o', e);
		}
	}

	_error(event) {
		console.error('socket error: %o', event);
	}
}