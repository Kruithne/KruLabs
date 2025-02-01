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

	/* [CLIENT -> ALL] Sent by controller to indicate playback has held. */
	PLAYBACK_HOLD: 0xD,

	/* [CLIENT -> ALL] Sent by controller to indicate playback has resumed. */
	PLAYBACK_GO: 0xE,

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