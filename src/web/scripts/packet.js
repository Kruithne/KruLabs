export const PACKET = {
	/** [CLIENT -> SERVER] Register client to receive events. **/
	REQ_REGISTER: 0x0,

	/** [CLIENT -> SERVER] Request project state data. Expects ACK_LOAD_PROJECT */
	REQ_LOAD_PROJECT: 0x1,

	/** [SERVER -> CLIENT] Response to REQ_LOAD_PROJECT containing project state */
	ACK_LOAD_PROJECT: 0x2,

	/** [CLIENT -> SERVER] Persist project state. Expects ACK_SAVE_PROJECT */
	REQ_SAVE_PROJECT: 0x3,

	/** [SERVER -> CLIENT] Response to REQ_SAVE_PROJECT containing save status */
	ACK_SAVE_PROJECT: 0x4,

	/** [CLIENT -> SERVER] Delete project. Expects ACK_DELETE_PROJECT */
	REQ_DELETE_PROJECT: 0x5,

	/** [SERVER -> CLIENT] Response to REQ_DELETE_PROJECT containing deletion status */
	ACK_DELETE_PROJECT: 0x6,

	/** [CLIENT -> SERVER] Request project list. Expects ACK_PROJECT_LIST. */
	REQ_PROJECT_LIST: 0x7,

	/** [SERVER -> CLIENT] Response to REQ_PROJECT_LIST containing available projects. */
	ACK_PROJECT_LIST: 0x8,

	/** [CLIENT -> ALL] Contains updated zone configuration. */
	ZONES_UPDATED: 0x9,

	/** [CLIENT -> ALL] Requests zone configuration. */
	REQ_ZONES: 0xA,

	/** [CLIENT -> SERVER] Request the server IPv4 address. Expects ACK_SERVER_ADDR. */
	REQ_SERVER_ADDR: 0xB,

	/** [SERVER -> CLIENT] Response to REQ_SERVER_ADDR containing the server IPv4 address. */
	ACK_SERVER_ADDR: 0xC,

	/** [CLIENT -> ALL] Set test screen state (true/false). */
	SET_TEST_SCREEN: 0xD,

	/** [CLIENT -> ALL] Set blackout state (true/false) with transition duration. */
	SET_BLACKOUT_STATE: 0xE,

	/** [CLIENT -> SERVER] Request list of available source files. Expects ACK_SOURCE_LIST. */
	REQ_SOURCE_LIST: 0xF,

	/** [SERVER -> CLIENT] Response to REQ_SOURCE_LIST containing available source files. */
	ACK_SOURCE_LIST: 0x10,

	/** [CLIENT -> ALL] Fired when a PLAY_MEDIA cue event is triggered. */
	CUE_EVENT_PLAY_MEDIA: 0x11,

	/** [CLIENT -> ALL] Fired when a STOP_MEDIA cue event is triggered. */
	CUE_EVENT_STOP_MEDIA: 0x12,

	/** [CLIENT -> ALL] Fired when media has naturally ended. */
	CONFIRM_MEDIA_END: 0x13,

	/** [CLIENT -> ALL] Request length of media track. Expects ACK_MEDIA_LENGTH. */
	REQ_MEDIA_LENGTH: 0x14,

	/** [CLIENT -> ALL] Response to REQ_MEDIA_LENGTH containing media track length. */
	ACK_MEDIA_LENGTH: 0x15,

	/* [CLIENT -> ALL] Sent by projector client to request activation.  */
	PROJECTOR_CLIENT_NEEDS_ACTIVATION: 0x16,

	/* [CLIENT -> ALL] Sent by controller to indicate playback has held. */
	PLAYBACK_HOLD: 0x17,

	/* [CLIENT -> ALL] Sent by controller to indicate playback has resumed. */
	PLAYBACK_GO: 0x18,

	/* [CLIENT -> ALL] Informs a projector client to reset media. */
	RESET_MEDIA: 0x19,

	/* [CLIENT -> ALL] Toggles zone debugging state. */
	SET_ZONE_DEBUG_STATE: 0x1A,

	/** [CLIENT -> ALL] Sent by controller to indicate playback seek. */
	PLAYBACK_MEDIA_SEEK: 0x1B,

	/** [CLIENT -> ALL] Sent by controller to request media preload. Expects ACK_MEDIA_PRELOAD. */
	REQ_MEDIA_PRELOAD: 0x1C,

	/** [CLIENT -> ALL] Response to ACK_MEDIA_PRELOAD, confirming media is preloaded. */
	ACK_MEDIA_PRELOAD: 0x1D,

	/** [CLIENT -> ALL] Sent by controller to indicate global playback volume. */
	PLAYBACK_VOLUME: 0x1E,

	/** [CLIENT -> ALL] Requests updated volume from controller. Expects PLAYBACK_VOLUME. */
	REQ_PLAYBACK_VOLUME: 0x1F,

	/** [CLIENT -> ALL] Contains a frame from a live camera. */
	LIVE_CAMERA_FRAME: 0x20,

	/** [CLIENT -> ALL] Fired when a START_LIVE cue event is triggered. */
	CUE_EVENT_START_LIVE: 0x21,

	/** [CLIENT -> ALL] Fired when a STOP_LIVE cue event is triggered. */
	CUE_EVENT_STOP_LIVE: 0x22,

	/** REUSE ME */
	UNUSED: 0x23,

	/** [CLIENT -> ALL] Unregister a packet with the server. */
	REQ_UNREGISTER: 0x24,

	/** [CLIENT -> ALL] Requests creation of a timer zone. */
	CUE_EVENT_CREATE_TIMER: 0x25,

	/** [CLIENT -> ALL] Sets the current time of a timer. */
	CUE_EVENT_SET_TIMER: 0x26,

	/** [CLIENT -> ALL] Starts a timer. */
	CUE_EVENT_START_TIMER: 0x27,

	/** [CLIENT -> ALL] Removes a timer. */
	CUE_EVENT_REMOVE_TIMER: 0x28,

	/** [CLIENT -> ALL] Requests removal of all timers. */
	REMOVE_ALL_TIMERS: 0x29,

	/** [CLIENT -> ALL] Pauses a timer */
	CUE_EVENT_PAUSE_TIMER: 0x2A,

	/** [CLIENT -> ALL] Contains updated masks. */
	UPDATE_MASKS: 0x2B,

	/** [CLIENT -> ALL] Requests updated masks. Expects UPDATE_MASKS. */
	REQ_MASKS: 0x2C,

	/** [CLIENT -> ALL] Fired when a SHOW_MASK cue event is triggered. */
	CUE_EVENT_SHOW_MASK: 0x2D,

	/** [CLIENT -> ALL] Fired when a HIDE_MASK cue event is triggered. */
	CUE_EVENT_HIDE_MASK: 0x2E,

	/** [CLIENT -> ALL] Request track list from controller. Expects ACK_REMOTE_TRACKS. */
	REQ_REMOTE_TRACKS: 0x2F,

	/** [CLIENT -> ALL] Response to REQ_REMOTE_TRACKS with track list. */
	ACK_REMOTE_TRAKCS: 0x30,

	/** [CLIENT -> ALL] Request track from controller. */
	REQ_REMOTE_TRACK: 0x31,

	/** [CLIENT -> ALL] Fired when the selected track changes on the controller. */
	ACK_REMOTE_TRACK: 0x32,

	/** [CLIENT -> ALL] Requests controller to GO. */
	REQ_REMOTE_GO: 0x33,

	/** [CLIENT -> ALL] Requests controller to HOLD. */
	REQ_REMOTE_HOLD: 0x34,

	/** [CLIENT -> ALL] Requests controller to SEEK. */
	REQ_REMOTE_SEEK: 0x35,
};

export const PACKET_UNK = 'UNKNOWN';

export const PACKET_TYPE = Object.freeze({
	NONE: 0x0,
	STRING: 0x1,
	OBJECT: 0x2,
	BINARY: 0x3
});

let packet_name_cache = null;
export function get_packet_name(id) {
	if (packet_name_cache === null) {
		packet_name_cache = new Map();
		for (let key in PACKET)
			packet_name_cache.set(PACKET[key], key);
	}

	if (packet_name_cache.has(id))
		return packet_name_cache.get(id);

	return PACKET_UNK;
}

export function build_packet(packet_id, packet_type, data) {
	let size = 2;
	let payload = null;

	if (data !== null) {
		if (packet_type === PACKET_TYPE.STRING || packet_type === PACKET_TYPE.OBJECT) {
			const str = packet_type === PACKET_TYPE.OBJECT ? JSON.stringify(data) : data;
			const encoder = new TextEncoder();

			payload = encoder.encode(str);
			size += payload.length;
		} else if (packet_type === PACKET_TYPE.BINARY) {
			payload = data;
			size += data.byteLength;
		}
	}

	const buffer = new ArrayBuffer(size);
	const view = new DataView(buffer);

	// pack packet_id to 13-bit (MAX 8191) and type to 3-bit (MAX 7)
	view.setUint16(0, (packet_id << 3) | packet_type);

	if (payload)
		new Uint8Array(buffer).set(payload, 2);

	return buffer;
}

export function parse_packet(buffer) {
	const view = new DataView(buffer);
	const packed = view.getUint16(0);
	const packet_id = packed >> 3;
	const packet_type = packed & 0b111;

	const parsed = { id: packet_id, data: null };
	
	if (buffer.byteLength <= 2 || packet_type === PACKET_TYPE.NONE) 
		return [parsed, packet_type];

	const data = new Uint8Array(buffer.slice(2));
	if (packet_type === PACKET_TYPE.STRING)
		parsed.data = new TextDecoder().decode(data);
	else if (packet_type === PACKET_TYPE.OBJECT)
		parsed.data = JSON.parse(new TextDecoder().decode(data));
	else
		parsed.data = data;
		
	return [parsed, packet_type];
 }