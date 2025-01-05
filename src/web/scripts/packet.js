export const packet = {
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

	TEST: 0x7
};

export const PACKET_UNK = 'UNKNOWN';

let packet_name_cache = null;
export function get_packet_name(id) {
	if (packet_name_cache === null) {
		packet_name_cache = new Map();
		for (let key in packet)
			packet_name_cache.set(packet[key], key);
	}

	if (packet_name_cache.has(id))
		return packet_name_cache.get(id);

	return PACKET_UNK;
}