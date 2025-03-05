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

	/** [CLIENT -> SERVER] Request the server IPv4 address. Expects ACK_SERVER_ADDR. */
	REQ_SERVER_ADDR: 0x9,

	/** [SERVER -> CLIENT] Response to REQ_SERVER_ADDR containing the server IPv4 address. */
	ACK_SERVER_ADDR: 0xA,

	/** [CLIENT -> SERVER] Request list of available source files. Expects ACK_SOURCE_LIST. */
	REQ_SOURCE_LIST: 0xB,

	/** [SERVER -> CLIENT] Response to REQ_SOURCE_LIST containing available source files. */
	ACK_SOURCE_LIST: 0xC,

	/* [CLIENT -> ALL] Sent by controller to indicate playback state. */
	PLAYBACK_STATE: 0xD,

	/* [CLIENT -> ALL] Request playback state. Expects PLAYBACK_STATE. */
	REQ_PLAYBACK_STATE: 0xE,

	/** [CLIENT -> ALL] Unregister a packet with the server. */
	REQ_UNREGISTER: 0xF,

	/** [CLIENT -> ALL] Request track list from controller. Expects ACK_REMOTE_TRACKS. */
	REQ_REMOTE_TRACKS: 0x10,

	/** [CLIENT -> ALL] Response to REQ_REMOTE_TRACKS with track list. */
	ACK_REMOTE_TRACKS: 0x11,

	/** [CLIENT -> ALL] Request track from controller. */
	REQ_REMOTE_TRACK: 0x12,

	/** [CLIENT -> ALL] Fired when the selected track changes on the controller. */
	ACK_REMOTE_TRACK: 0x13,

	/** [CLIENT -> ALL] Requests controller to GO. */
	REQ_REMOTE_GO: 0x14,

	/** [CLIENT -> ALL] Requests controller to HOLD. */
	REQ_REMOTE_HOLD: 0x15,

	/** [CLIENT -> ALL] Requests controller to SEEK. */
	REQ_REMOTE_SEEK: 0x16,

	/** [CLIENT -> SERVER] Sets the system volume. */
	SET_SYSTEM_VOLUME: 0x17,

	/** [CLIENT -> ALL] Requests the current track. Expects ACK_REMOTE_TRACK. */
	REQ_CURRENT_TRACK: 0x18,

	/** [SERVER -> CLIENT] Total amount of connected clients. */
	INFO_CLIENT_COUNT: 0x19,

	/** [CLIENT -> SERVER] Request client count. Expects INFO_CLIENT_COUNT. */
	REQ_CLIENT_COUNT: 0x1A,

	/** [CLIENT -> SERVER -> PLAYBACK] */
	AUDIO_PLAY_TRACK: 0x1B,

	/** [CLIENT -> SERVER -> PLAYBACK] */
	AUDIO_PAUSE_CHANNEL: 0x1C,

	/** [CLIENT -> SERVER -> PLAYBACK] */
	AUDIO_RESUME_CHANNEL: 0x1D,

	/** [CLIENT -> SERVER -> PLAYBACK] */
	AUDIO_PAUSE_ALL: 0x1E,

	/** [CLIENT -> SERVER -> PLAYBACK] */
	AUDIO_RESUME_ALL: 0x1F,

	/** [CLIENT -> SERVER -> OBS] Requests a scene change in OBS by name. */
	OBS_SET_SCENE_BY_NAME: 0x1F,

	/** [CLIENT -> SERVER -> OBS] Requests a scene change in OBS. */
	OBS_SET_SCENE: 0x20,

	/** [OBS -> SERVER -> CLIENT] Sends media duration from OBS on playback start. */
	OBS_MEDIA_DURATION: 0x21,

	/** [OBS -> SERVER -> CLIENT] Sent when the current program scene changes in OBS. */
	OBS_SCENE_NAME: 0x22,

	/** [CLIENT -> SERVER -> OBS] Request current program scene from OBS. */
	REQ_OBS_SCENE_NAME: 0x23,

	/** [OBS -> SERVER -> CLIENT] Sent when media playback starts in OBS. */
	OBS_MEDIA_PLAYBACK_STARTED: 0x24,

	/** [OBS -> SERVER -> CLIENT] Sent when media playback stops in OBS. */
	OBS_MEDIA_PLAYBACK_ENDED: 0x25,

	/** [CLIENT -> SERVER -> OBS] Request media seeking. */
	OBS_MEDIA_SEEK: 0x26,

	/** [CLIENT -> SERVER -> OBS] Request media restart. */
	OBS_MEDIA_RESTART: 0x27,

	/** [OBS -> SERVER -> CLIENT] Contains an updated scene list from OBS. */
	OBS_SCENE_LIST: 0x28,

	/** [CLIENT -> SERVER -> OBS] Requests an updated scene list. Expects OBS_SCENE_LIST. */
	REQ_OBS_SCENE_LIST: 0x29,

	/** [CLIENT -> SERVER -> PLAYBACK] */
	AUDIO_FADE_CHANNEL: 0x2A,
	//UNUSED: 0x2B,

	/** [CLIENT -> SERVER -> ETC] */
	ETC_SEND_COMMAND: 0x2C,

	/** [CLIENT -> SERVER] */
	UPDATE_INTEGRATIONS: 0x2D,

	/** [SERVER -> CLIENT] */
	INTEGRATION_STATUS: 0x2E,
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

export function build_packet(packet_id, packet_type, data, uid = 0) {
	let size = 2 + 2;
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
	view.setUint16(2, uid);

	if (payload)
		new Uint8Array(buffer).set(payload, 4);

	return buffer;
}

export function parse_packet(buffer) {
	const view = new DataView(buffer);
	const packed = view.getUint16(0);
	const packet_id = packed >> 3;
	const packet_type = packed & 0b111;
	const uid = view.getUint16(2);

	const parsed = { id: packet_id, data: null };
	
	if (buffer.byteLength <= 4 || packet_type === PACKET_TYPE.NONE)
		return [parsed, packet_type, uid];

	const data = new Uint8Array(buffer.slice(4));
	if (packet_type === PACKET_TYPE.STRING)
		parsed.data = new TextDecoder().decode(data);
	else if (packet_type === PACKET_TYPE.OBJECT)
		parsed.data = JSON.parse(new TextDecoder().decode(data));
	else
		parsed.data = data;
		
	return [parsed, packet_type, uid];
 }