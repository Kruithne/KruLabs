export const CUE_EVENTS = {
	NONE: {
		id: 0x0,
		name: 'NONE',
		default_meta: {}
	},

	PLAY_AUDIO: {
		id: 0x1,
		name: 'PLAY AUDIO TRACK',
		default_meta: {
			src: '',
			channel: 'master',
			volume: 1,
			loop: false
		}
	},

	STOP_AUDIO: {
		id: 0x2,
		name: 'STOP AUDIO TRACK',
		default_meta: {}
	}
};

export function get_cue_event_by_id(id) {
	for (const key in CUE_EVENTS) {
		const event = CUE_EVENTS[key];
		if (event.id === id)
			return event;
	}

	return CUE_EVENTS.NONE;
}