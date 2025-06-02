import { createHash } from 'crypto';
import { TCPSocket } from 'bun';

// region generics
type Unbox<T> = T extends Array<infer U> ? U : T;
type Enum<T> = T[keyof T];

function format_bytes(bytes: number): string {
	if (bytes === 0)
		return '0b';
	
	const units = ['b', 'kb', 'mb', 'gb'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	
	// no more than gb
	const unit_index = Math.min(i, 3);
	
	// format with at most 2 decimal places and remove trailing zeros
	return (bytes / Math.pow(1024, unit_index)).toFixed(2)
		.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + units[unit_index];
}
// endregion

// region logging
export function log_info(message: string, prefix = 'INFO') {
	const formatted_message = (`[{${prefix}}] ` + message).replace(/\{([^}]+)\}/g, `\x1b[36m$1\x1b[0m`);
	process.stdout.write(formatted_message + '\n');
}

export function log_verbose(message: string, prefix = 'INFO') {
	if (!process.argv.includes('--verbose'))
		return;

	log_info(message, prefix);
}

export function log_warn(message: string) {
	process.stdout.write('\x1b[93mWARNING: \x1b[31m' + message + '\x1b[0m\n');
}
// endregion

// region assertion
const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';

class AssertionError extends Error {
	constructor(message: string, key: string) {
		super('"' + key + '" ' + message);
		this.name = 'AssertionError';
	}
}

function validate_typed_array<T>(arr: any, elem_type: string, key: string): Array<T> {
	if (!Array.isArray(arr))
		throw new AssertionError(`expected array`, key);

	for (let i = 0, n = arr.length; i < n; i++) {
		if (typeof arr[i] !== elem_type)
			throw new AssertionError(`index [${i}] expected ${elem_type}`, key);
	}

	return arr as Array<T>;
}

function validate_object(obj: any, key: string): Record<string, any> {
	if (obj === null || typeof obj !== TYPE_OBJECT)
		throw new AssertionError('expected object', key);

	return obj;
}

function validate_string(str: any, key: string): string {
	if (typeof str !== TYPE_STRING)
		throw new AssertionError('expected string', key);

	return str;
}

function validate_number(num: any, key: string): number {
	if (typeof num !== TYPE_NUMBER)
		throw new AssertionError('expected number', key);

	return num;
}
// endregion

// region obs
interface OBSMessage {
	op: number;
	d: OBSMessageData;
}

type OBSMessageData = Record<string, any>;

const OBS_OP_CODE = {
	HELLO: 0,
	IDENTIFY: 1,
	IDENTIFIED: 2,
	REIDENTIFY: 3,
	EVENT: 5,
	REQUEST: 6,
	REQUEST_RESPONSE: 7,
	REQUEST_BATCH: 8,
	REQUEST_BATCH_RESPONSE: 9
};

const OBS_EVENT_TYPE = {
	// General Events
	EXIT_STARTED: 'ExitStarted',
	VENDOR_EVENT: 'VendorEvent',
	CUSTOM_EVENT: 'CustomEvent',

	// Config Events
	CURRENT_SCENE_COLLECTION_CHANGING: 'CurrentSceneCollectionChanging',
	CURRENT_SCENE_COLLECTION_CHANGED: 'CurrentSceneCollectionChanged',
	SCENE_COLLECTION_LIST_CHANGED: 'SceneCollectionListChanged',
	CURRENT_PROFILE_CHANGING: 'CurrentProfileChanging',
	CURRENT_PROFILE_CHANGED: 'CurrentProfileChanged',
	PROFILE_LIST_CHANGED: 'ProfileListChanged',

	// Scenes Events
	SCENE_CREATED: 'SceneCreated',
	SCENE_REMOVED: 'SceneRemoved',
	SCENE_NAME_CHANGED: 'SceneNameChanged',
	CURRENT_PROGRAM_SCENE_CHANGED: 'CurrentProgramSceneChanged',
	CURRENT_PREVIEW_SCENE_CHANGED: 'CurrentPreviewSceneChanged',
	SCENE_LIST_CHANGED: 'SceneListChanged',

	// Inputs Events
	INPUT_CREATED: 'InputCreated',
	INPUT_REMOVED: 'InputRemoved',
	INPUT_NAME_CHANGED: 'InputNameChanged',
	INPUT_SETTINGS_CHANGED: 'InputSettingsChanged',
	INPUT_ACTIVE_STATE_CHANGED: 'InputActiveStateChanged',
	INPUT_SHOW_STATE_CHANGED: 'InputShowStateChanged',
	INPUT_MUTE_STATE_CHANGED: 'InputMuteStateChanged',
	INPUT_VOLUME_CHANGED: 'InputVolumeChanged',
	INPUT_AUDIO_BALANCE_CHANGED: 'InputAudioBalanceChanged',
	INPUT_AUDIO_SYNC_OFFSET_CHANGED: 'InputAudioSyncOffsetChanged',
	INPUT_AUDIO_TRACKS_CHANGED: 'InputAudioTracksChanged',
	INPUT_AUDIO_MONITOR_TYPE_CHANGED: 'InputAudioMonitorTypeChanged',
	INPUT_VOLUME_METERS: 'InputVolumeMeters',

	// Transitions Events
	CURRENT_SCENE_TRANSITION_CHANGED: 'CurrentSceneTransitionChanged',
	CURRENT_SCENE_TRANSITION_DURATION_CHANGED: 'CurrentSceneTransitionDurationChanged',
	SCENE_TRANSITION_STARTED: 'SceneTransitionStarted',
	SCENE_TRANSITION_ENDED: 'SceneTransitionEnded',
	SCENE_TRANSITION_VIDEO_ENDED: 'SceneTransitionVideoEnded',

	// Filters Events
	SOURCE_FILTER_LIST_REINDEXED: 'SourceFilterListReindexed',
	SOURCE_FILTER_CREATED: 'SourceFilterCreated',
	SOURCE_FILTER_REMOVED: 'SourceFilterRemoved',
	SOURCE_FILTER_NAME_CHANGED: 'SourceFilterNameChanged',
	SOURCE_FILTER_SETTINGS_CHANGED: 'SourceFilterSettingsChanged',
	SOURCE_FILTER_ENABLE_STATE_CHANGED: 'SourceFilterEnableStateChanged',

	// Scene Items Events
	SCENE_ITEM_CREATED: 'SceneItemCreated',
	SCENE_ITEM_REMOVED: 'SceneItemRemoved',
	SCENE_ITEM_LIST_REINDEXED: 'SceneItemListReindexed',
	SCENE_ITEM_ENABLE_STATE_CHANGED: 'SceneItemEnableStateChanged',
	SCENE_ITEM_LOCK_STATE_CHANGED: 'SceneItemLockStateChanged',
	SCENE_ITEM_SELECTED: 'SceneItemSelected',
	SCENE_ITEM_TRANSFORM_CHANGED: 'SceneItemTransformChanged',

	// Outputs Events
	STREAM_STATE_CHANGED: 'StreamStateChanged',
	RECORD_STATE_CHANGED: 'RecordStateChanged',
	RECORD_FILE_CHANGED: 'RecordFileChanged',
	REPLAY_BUFFER_STATE_CHANGED: 'ReplayBufferStateChanged',
	VIRTUALCAM_STATE_CHANGED: 'VirtualcamStateChanged',
	REPLAY_BUFFER_SAVED: 'ReplayBufferSaved',

	// Media Inputs Events
	MEDIA_INPUT_PLAYBACK_STARTED: 'MediaInputPlaybackStarted',
	MEDIA_INPUT_PLAYBACK_ENDED: 'MediaInputPlaybackEnded',
	MEDIA_INPUT_ACTION_TRIGGERED: 'MediaInputActionTriggered',

	// UI Events
	STUDIO_MODE_STATE_CHANGED: 'StudioModeStateChanged',
	SCREENSHOT_SAVED: 'ScreenshotSaved'
} as const;

const OBS_REQUEST = {
	// General Requests
	GET_VERSION: 'GetVersion',
	GET_STATS: 'GetStats',
	BROADCAST_CUSTOM_EVENT: 'BroadcastCustomEvent',
	CALL_VENDOR_REQUEST: 'CallVendorRequest',
	GET_HOTKEY_LIST: 'GetHotkeyList',
	TRIGGER_HOTKEY_BY_NAME: 'TriggerHotkeyByName',
	TRIGGER_HOTKEY_BY_KEY_SEQUENCE: 'TriggerHotkeyByKeySequence',
	SLEEP: 'Sleep',

	// Config Requests
	GET_PERSISTENT_DATA: 'GetPersistentData',
	SET_PERSISTENT_DATA: 'SetPersistentData',
	GET_SCENE_COLLECTION_LIST: 'GetSceneCollectionList',
	SET_CURRENT_SCENE_COLLECTION: 'SetCurrentSceneCollection',
	CREATE_SCENE_COLLECTION: 'CreateSceneCollection',
	GET_PROFILE_LIST: 'GetProfileList',
	SET_CURRENT_PROFILE: 'SetCurrentProfile',
	CREATE_PROFILE: 'CreateProfile',
	REMOVE_PROFILE: 'RemoveProfile',
	GET_PROFILE_PARAMETER: 'GetProfileParameter',
	SET_PROFILE_PARAMETER: 'SetProfileParameter',
	GET_VIDEO_SETTINGS: 'GetVideoSettings',
	SET_VIDEO_SETTINGS: 'SetVideoSettings',
	GET_STREAM_SERVICE_SETTINGS: 'GetStreamServiceSettings',
	SET_STREAM_SERVICE_SETTINGS: 'SetStreamServiceSettings',
	GET_RECORD_DIRECTORY: 'GetRecordDirectory',
	SET_RECORD_DIRECTORY: 'SetRecordDirectory',

	// Sources Requests
	GET_SOURCE_ACTIVE: 'GetSourceActive',
	GET_SOURCE_SCREENSHOT: 'GetSourceScreenshot',
	SAVE_SOURCE_SCREENSHOT: 'SaveSourceScreenshot',

	// Scenes Requests
	GET_SCENE_LIST: 'GetSceneList',
	GET_GROUP_LIST: 'GetGroupList',
	GET_CURRENT_PROGRAM_SCENE: 'GetCurrentProgramScene',
	SET_CURRENT_PROGRAM_SCENE: 'SetCurrentProgramScene',
	GET_CURRENT_PREVIEW_SCENE: 'GetCurrentPreviewScene',
	SET_CURRENT_PREVIEW_SCENE: 'SetCurrentPreviewScene',
	CREATE_SCENE: 'CreateScene',
	REMOVE_SCENE: 'RemoveScene',
	SET_SCENE_NAME: 'SetSceneName',
	GET_SCENE_SCENE_TRANSITION_OVERRIDE: 'GetSceneSceneTransitionOverride',
	SET_SCENE_SCENE_TRANSITION_OVERRIDE: 'SetSceneSceneTransitionOverride',

	// Inputs Requests
	GET_INPUT_LIST: 'GetInputList',
	GET_INPUT_KIND_LIST: 'GetInputKindList',
	GET_SPECIAL_INPUTS: 'GetSpecialInputs',
	CREATE_INPUT: 'CreateInput',
	REMOVE_INPUT: 'RemoveInput',
	SET_INPUT_NAME: 'SetInputName',
	GET_INPUT_DEFAULT_SETTINGS: 'GetInputDefaultSettings',
	GET_INPUT_SETTINGS: 'GetInputSettings',
	SET_INPUT_SETTINGS: 'SetInputSettings',
	GET_INPUT_MUTE: 'GetInputMute',
	SET_INPUT_MUTE: 'SetInputMute',
	TOGGLE_INPUT_MUTE: 'ToggleInputMute',
	GET_INPUT_VOLUME: 'GetInputVolume',
	SET_INPUT_VOLUME: 'SetInputVolume',
	GET_INPUT_AUDIO_BALANCE: 'GetInputAudioBalance',
	SET_INPUT_AUDIO_BALANCE: 'SetInputAudioBalance',
	GET_INPUT_AUDIO_SYNC_OFFSET: 'GetInputAudioSyncOffset',
	SET_INPUT_AUDIO_SYNC_OFFSET: 'SetInputAudioSyncOffset',
	GET_INPUT_AUDIO_MONITOR_TYPE: 'GetInputAudioMonitorType',
	SET_INPUT_AUDIO_MONITOR_TYPE: 'SetInputAudioMonitorType',
	GET_INPUT_AUDIO_TRACKS: 'GetInputAudioTracks',
	SET_INPUT_AUDIO_TRACKS: 'SetInputAudioTracks',
	GET_INPUT_PROPERTIES_LIST_PROPERTY_ITEMS: 'GetInputPropertiesListPropertyItems',
	PRESS_INPUT_PROPERTIES_BUTTON: 'PressInputPropertiesButton',

	// Transitions Requests
	GET_TRANSITION_KIND_LIST: 'GetTransitionKindList',
	GET_SCENE_TRANSITION_LIST: 'GetSceneTransitionList',
	GET_CURRENT_SCENE_TRANSITION: 'GetCurrentSceneTransition',
	SET_CURRENT_SCENE_TRANSITION: 'SetCurrentSceneTransition',
	SET_CURRENT_SCENE_TRANSITION_DURATION: 'SetCurrentSceneTransitionDuration',
	SET_CURRENT_SCENE_TRANSITION_SETTINGS: 'SetCurrentSceneTransitionSettings',
	GET_CURRENT_SCENE_TRANSITION_CURSOR: 'GetCurrentSceneTransitionCursor',
	TRIGGER_STUDIO_MODE_TRANSITION: 'TriggerStudioModeTransition',
	SET_TBAR_POSITION: 'SetTBarPosition',

	// Filters Requests
	GET_SOURCE_FILTER_KIND_LIST: 'GetSourceFilterKindList',
	GET_SOURCE_FILTER_LIST: 'GetSourceFilterList',
	GET_SOURCE_FILTER_DEFAULT_SETTINGS: 'GetSourceFilterDefaultSettings',
	CREATE_SOURCE_FILTER: 'CreateSourceFilter',
	REMOVE_SOURCE_FILTER: 'RemoveSourceFilter',
	SET_SOURCE_FILTER_NAME: 'SetSourceFilterName',
	GET_SOURCE_FILTER: 'GetSourceFilter',
	SET_SOURCE_FILTER_INDEX: 'SetSourceFilterIndex',
	SET_SOURCE_FILTER_SETTINGS: 'SetSourceFilterSettings',
	SET_SOURCE_FILTER_ENABLED: 'SetSourceFilterEnabled',

	// Scene Items Requests
	GET_SCENE_ITEM_LIST: 'GetSceneItemList',
	GET_GROUP_SCENE_ITEM_LIST: 'GetGroupSceneItemList',
	GET_SCENE_ITEM_ID: 'GetSceneItemId',
	GET_SCENE_ITEM_SOURCE: 'GetSceneItemSource',
	CREATE_SCENE_ITEM: 'CreateSceneItem',
	REMOVE_SCENE_ITEM: 'RemoveSceneItem',
	DUPLICATE_SCENE_ITEM: 'DuplicateSceneItem',
	GET_SCENE_ITEM_TRANSFORM: 'GetSceneItemTransform',
	SET_SCENE_ITEM_TRANSFORM: 'SetSceneItemTransform',
	GET_SCENE_ITEM_ENABLED: 'GetSceneItemEnabled',
	SET_SCENE_ITEM_ENABLED: 'SetSceneItemEnabled',
	GET_SCENE_ITEM_LOCKED: 'GetSceneItemLocked',
	SET_SCENE_ITEM_LOCKED: 'SetSceneItemLocked',
	GET_SCENE_ITEM_INDEX: 'GetSceneItemIndex',
	SET_SCENE_ITEM_INDEX: 'SetSceneItemIndex',
	GET_SCENE_ITEM_BLEND_MODE: 'GetSceneItemBlendMode',
	SET_SCENE_ITEM_BLEND_MODE: 'SetSceneItemBlendMode',

	// Outputs Requests
	GET_VIRTUAL_CAM_STATUS: 'GetVirtualCamStatus',
	TOGGLE_VIRTUAL_CAM: 'ToggleVirtualCam',
	START_VIRTUAL_CAM: 'StartVirtualCam',
	STOP_VIRTUAL_CAM: 'StopVirtualCam',
	GET_REPLAY_BUFFER_STATUS: 'GetReplayBufferStatus',
	TOGGLE_REPLAY_BUFFER: 'ToggleReplayBuffer',
	START_REPLAY_BUFFER: 'StartReplayBuffer',
	STOP_REPLAY_BUFFER: 'StopReplayBuffer',
	SAVE_REPLAY_BUFFER: 'SaveReplayBuffer',
	GET_LAST_REPLAY_BUFFER_REPLAY: 'GetLastReplayBufferReplay',
	GET_OUTPUT_LIST: 'GetOutputList',
	GET_OUTPUT_STATUS: 'GetOutputStatus',
	TOGGLE_OUTPUT: 'ToggleOutput',
	START_OUTPUT: 'StartOutput',
	STOP_OUTPUT: 'StopOutput',
	GET_OUTPUT_SETTINGS: 'GetOutputSettings',
	SET_OUTPUT_SETTINGS: 'SetOutputSettings',

	// Stream Requests
	GET_STREAM_STATUS: 'GetStreamStatus',
	TOGGLE_STREAM: 'ToggleStream',
	START_STREAM: 'StartStream',
	STOP_STREAM: 'StopStream',
	SEND_STREAM_CAPTION: 'SendStreamCaption',

	// Record Requests
	GET_RECORD_STATUS: 'GetRecordStatus',
	TOGGLE_RECORD: 'ToggleRecord',
	START_RECORD: 'StartRecord',
	STOP_RECORD: 'StopRecord',
	TOGGLE_RECORD_PAUSE: 'ToggleRecordPause',
	PAUSE_RECORD: 'PauseRecord',
	RESUME_RECORD: 'ResumeRecord',
	SPLIT_RECORD_FILE: 'SplitRecordFile',
	CREATE_RECORD_CHAPTER: 'CreateRecordChapter',

	// Media Inputs Requests
	GET_MEDIA_INPUT_STATUS: 'GetMediaInputStatus',
	SET_MEDIA_INPUT_CURSOR: 'SetMediaInputCursor',
	OFFSET_MEDIA_INPUT_CURSOR: 'OffsetMediaInputCursor',
	TRIGGER_MEDIA_INPUT_ACTION: 'TriggerMediaInputAction',

	// UI Requests
	GET_STUDIO_MODE_ENABLED: 'GetStudioModeEnabled',
	SET_STUDIO_MODE_ENABLED: 'SetStudioModeEnabled',
	OPEN_INPUT_PROPERTIES_DIALOG: 'OpenInputPropertiesDialog',
	OPEN_INPUT_FILTERS_DIALOG: 'OpenInputFiltersDialog',
	OPEN_INPUT_INTERACT_DIALOG: 'OpenInputInteractDialog',
	GET_MONITOR_LIST: 'GetMonitorList',
	OPEN_VIDEO_MIX_PROJECTOR: 'OpenVideoMixProjector',
	OPEN_SOURCE_PROJECTOR: 'OpenSourceProjector'
} as const;

const OBS_EVENT_SUB = {
	NONE: 0,
	GENERAL: 1 << 0,
	CONFIG: 1 << 1,
	SCENES: 1 << 2,
	INPUTS: 1 << 3,
	TRANSITIONS: 1 << 4,
	FILTERS: 1 << 5,
	OUTPUTS: 1 << 6,
	SCENE_ITEMS: 1 << 7,
	MEDIA_INPUTS: 1 << 8,
	VENDORS: 1 << 9,
	USER_INTERFACE: 1 << 10,
	ALL: (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 9) | (1 << 10),
	INPUT_VOLUME_METERS: 1 << 16,
	INPUT_ACTIVE_STATE_CHANGED: 1 << 17,
	INPUT_SHOW_STATE_CHANGED: 1 << 18,
	SCENE_ITEM_TRANSFORM_CHANGED: 1 << 19
};

const OBS_EXECUTION_TYPE = {
	NONE: -1,              // Not a request batch
	SERIAL_REALTIME: 0,    // Processes all requests serially, as fast as possible
	SERIAL_FRAME: 1,       // Processes all requests serially, in sync with graphics thread
	PARALLEL: 2            // Processes all requests using all available threads
} as const;

const OBS_MEDIA_INPUT_ACTION = {
	NONE: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NONE',
	PLAY: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY',
	PAUSE: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
	STOP: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
	RESTART: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
	NEXT: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT',
	PREVIOUS: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS'
} as const;

const OBS_RECONNECT_DELAY = 500;
const OBS_RESPONSE_TIMEOUT = 500;

const OBS_PREFIX = 'OBS';

const OBS_OP_CODE_TO_STR = Object.fromEntries(
	Object.entries(OBS_OP_CODE).map(([key, value]) => [value, key])
) as Record<Enum<typeof OBS_OP_CODE>, string>;

const obs_request_map = new Map();

function obs_create_auth_string(password: string, salt: string, challenge: string): string {
	const secret = createHash('sha256').update(password + salt).digest('base64');
	return createHash('sha256').update(secret + challenge).digest('base64');
}

interface MediaTimeCallback {
	timestamp: number;
	callback: Function;
	fired: boolean;
}

class MediaTracker {
	media_name: string;
	callbacks: MediaTimeCallback[] = [];
	playback_started_at: number | null = null;
	expected_position: number = 0;
	check_interval: Timer | null = null;
	obs_connection: OBSConnection;
	
	constructor(media_name: string, obs_connection: OBSConnection) {
		this.media_name = media_name;
		this.obs_connection = obs_connection;
	}
	
	add_callback(timestamp: number, callback: Function) {
		this.callbacks.push({
			timestamp,
			callback,
			fired: false
		});
		
		this.callbacks.sort((a, b) => a.timestamp - b.timestamp);
		
		return this;
	}
	
	_handle_media_start() {
		log_verbose(`media {${this.media_name}} started playback`, 'MEDIA');
		
		this.playback_started_at = Date.now();
		this.expected_position = 0;
		
		for (let cb of this.callbacks)
			cb.fired = false;
		
		this._start_checking();
	}
	
	_handle_media_stop() {
		log_info(`media {${this.media_name}} stopped playback`, 'MEDIA');
		
		if (this.check_interval) {
			log_verbose(`clearing check interval for {${this.media_name}}`, 'MEDIA');
			clearInterval(this.check_interval);
			this.check_interval = null;
		}
		
		this.playback_started_at = null;
	}
	
	_start_checking() {
		if (this.check_interval)
			clearInterval(this.check_interval);
		
		this.check_interval = setInterval(() => this._check_time(), 100);
	}
	
	_stop_checking() {
		if (this.check_interval) {
			clearInterval(this.check_interval);
			this.check_interval = null;
		}
	}
	
	async _check_time() {
		if (!this.playback_started_at)
			return;
		
		let current_position;
		
		try {
			const status = await this._get_current_media_status();
			if (status && status.mediaCursor !== null) {
				current_position = status.mediaCursor;
				this.playback_started_at = Date.now() - status.mediaCursor;
			} else {
				const elapsed = Date.now() - this.playback_started_at;
				current_position = elapsed;
			}
		} catch (e) {
			const elapsed = Date.now() - this.playback_started_at;
			current_position = elapsed;
		}
		
		this.expected_position = current_position;
		
		for (let cb of this.callbacks) {
			if (!cb.fired && current_position >= cb.timestamp) {
				log_info(`triggering media callback for {${this.media_name}} at timestamp {${current_position}ms}`, 'MEDIA');
				cb.fired = true;
				cb.callback(this.media_name, cb.timestamp);
			}
		}
	}
	
	async _get_current_media_status() {
		try {
			const response = await this.obs_connection._request(OBS_REQUEST.GET_INPUT_LIST, {});
			if (!response) return null;
			
			const inputs = response.inputs || [];
			
			for (const input of inputs) {
				if (input.inputName === this.media_name) {
					const status = await this.obs_connection._request(
						OBS_REQUEST.GET_MEDIA_INPUT_STATUS, 
						{ inputName: input.inputName }
					);
					
					return status;
				}
			}
		} catch (e) {
			// failed
		}
		
		return null;
	}
}

const media_trackers = new Map<string, MediaTracker>();

class OBSConnection {
	socket: WebSocket|undefined;
	identified: boolean = false;
	connected: boolean = false;

	obs_host: string;
	obs_port: number;
	obs_password: string;
	
	private connection_promise: Promise<OBSConnection>;
	private connection_resolver: ((connection: OBSConnection) => void) | null = null;

	constructor(obs_host: string, obs_port: number, obs_password: string) {
		this.obs_host = obs_host;
		this.obs_port = obs_port;
		this.obs_password = obs_password;
		
		this.connection_promise = new Promise<OBSConnection>(resolve => {
			this.connection_resolver = resolve;
		});
		
		this._init_socket();
	}

	get ready(): Promise<OBSConnection> {
		return this.connection_promise;
	}

	_init_socket() {
		const host_string = `ws://${this.obs_host}:${this.obs_port}`;

		this.identified = false;
		this.connected = false;

		this.socket = new WebSocket(host_string);
		this.socket.addEventListener('message', this._on_message.bind(this));
		this.socket.addEventListener('open', this._on_open.bind(this));
		this.socket.addEventListener('close', this._on_close.bind(this));
		this.socket.addEventListener('error', this._on_error.bind(this));
	}

	_send(op: number, message: OBSMessageData) {
		if (this.socket === undefined)
			return;

		const payload = { op, d: message } as OBSMessage;
		const payload_json = JSON.stringify(payload);
		const payload_size = Buffer.byteLength(payload_json);
	
		this.socket?.send(payload_json);
	
		log_verbose(`SEND {${OBS_OP_CODE_TO_STR[op]}} size {${format_bytes(payload_size)}}`, OBS_PREFIX);
	}

	_request(request_type: Enum<typeof OBS_REQUEST>, request_data: OBSMessageData = {}, timeout = OBS_RESPONSE_TIMEOUT): Promise<OBSMessageData|null> {
		return new Promise(resolve => {
			let timeout_id: Timer|null = null;
			const request_uuid = Bun.randomUUIDv7();
	
			obs_request_map.set(request_uuid, (value: OBSMessage|null) => {
				if (timeout_id !== null)
					clearTimeout(timeout_id);
	
				resolve(value);
			});
	
			log_verbose(`preparing OBS request {${request_type}} ID {${request_uuid}}`, OBS_PREFIX);
		
			this._send(OBS_OP_CODE.REQUEST, {
				requestType: request_type,
				requestId: request_uuid,
				requestData: request_data
			});
	
			if (timeout > 0) {
				timeout_id = setTimeout(() => {
					obs_request_map.delete(request_uuid);
					log_warn(`timed out waiting for {${request_type}} response from OBS (timeout: {${timeout}ms})`);
					resolve(null);
				}, timeout);
			}
		});
	}

	_on_open() {
		log_info(`connected to OBS host {${this.obs_host}} on port {${this.obs_port}}`, OBS_PREFIX);
		this.connected = true;
	}

	_on_close(event: any) {
		this.socket = undefined;
		this.identified = false;
		this.connected = false;

		log_info(`disconnected from OBS host: {${event.code}} ${event.reason}`, OBS_PREFIX);

		log_info(`reconnecting to OBS host in {${OBS_RECONNECT_DELAY}ms}`, OBS_PREFIX);
		setTimeout(() => this._init_socket(), OBS_RECONNECT_DELAY);
	}

	_on_error(error: any) {
		log_warn(`{${error.type}} raised in OBS socket: ${error.message}`);
	}

	scene(scene_name: string) {
		log_info(`{scene()} > switching to scene {${scene_name}}`, OBS_PREFIX);
		this._request(OBS_REQUEST.SET_CURRENT_PROGRAM_SCENE, {
			sceneName: scene_name
		});
	}

	create_scene(scene_name: string) {
		log_info(`{create_scene()} > creating scene {${scene_name}}`, OBS_PREFIX);
		this._request(OBS_REQUEST.CREATE_SCENE, {
			sceneName: scene_name
		});
	}

	delete_scene(scene_name: string) {
		log_info(`{delete_scene()} > deleting scene {${scene_name}}`, OBS_PREFIX);
		return this._request(OBS_REQUEST.REMOVE_SCENE, {
			sceneName: scene_name
		});
	}

	pause(media_name: string) {
		log_info(`{pause()} > pausing media {${media_name}}`, OBS_PREFIX);
		return this._request(OBS_REQUEST.TRIGGER_MEDIA_INPUT_ACTION, {
			inputName: media_name,
			mediaAction: OBS_MEDIA_INPUT_ACTION.PAUSE
		});
	}

	play(media_name: string) {
		log_info(`{play()} > playing media {${media_name}}`, OBS_PREFIX);
		return this._request(OBS_REQUEST.TRIGGER_MEDIA_INPUT_ACTION, {
			inputName: media_name,
			mediaAction: OBS_MEDIA_INPUT_ACTION.PLAY
		});
	}

	async pause_all() {
		log_info(`{pause_all()} > pausing all media in current scene`, OBS_PREFIX);
		
		try {
			const current_scene = await this._request(OBS_REQUEST.GET_CURRENT_PROGRAM_SCENE);
			if (!current_scene) {
				log_warn('{pause_all()} > failed to get current program scene');
				return;
			}
			
			const scene_items = await this._request(OBS_REQUEST.GET_SCENE_ITEM_LIST, {
				sceneName: current_scene.sceneName
			});
			
			if (!scene_items || !scene_items.sceneItems) {
				log_warn('{pause_all()} > failed to get scene items');
				return;
			}
			
			const media_pause_promises = [];
			
			for (const item of scene_items.sceneItems) {
				const input_name = item.sourceName;
				
				try {
					const input_status = await this._request(OBS_REQUEST.GET_MEDIA_INPUT_STATUS, {
						inputName: input_name
					});
					
					if (input_status && input_status.mediaState === 'OBS_MEDIA_STATE_PLAYING') {
						log_info(`{pause_all()} > pausing media {${input_name}}`, OBS_PREFIX);
						media_pause_promises.push(
							this._request(OBS_REQUEST.TRIGGER_MEDIA_INPUT_ACTION, {
								inputName: input_name,
								mediaAction: OBS_MEDIA_INPUT_ACTION.PAUSE
							})
						);
					}
				} catch (e) {
					// Not a media input, skip
				}
			}
			
			if (media_pause_promises.length > 0) {
				await Promise.all(media_pause_promises);
				log_info(`{pause_all()} > paused {${media_pause_promises.length}} media inputs`, OBS_PREFIX);
			} else {
				log_info('{pause_all()} > no playing media found in current scene', OBS_PREFIX);
			}
		} catch (error) {
			log_warn(`{pause_all()} > error: ${error}`);
		}
	}

	async play_all() {
		log_info(`{play_all()} > resuming all media in current scene`, OBS_PREFIX);
		
		try {
			const current_scene = await this._request(OBS_REQUEST.GET_CURRENT_PROGRAM_SCENE);
			if (!current_scene) {
				log_warn('{play_all()} > failed to get current program scene');
				return;
			}
			
			const scene_items = await this._request(OBS_REQUEST.GET_SCENE_ITEM_LIST, {
				sceneName: current_scene.sceneName
			});
			
			if (!scene_items || !scene_items.sceneItems) {
				log_warn('{play_all()} > failed to get scene items');
				return;
			}
			
			const media_play_promises = [];
			
			for (const item of scene_items.sceneItems) {
				const input_name = item.sourceName;
				
				try {
					const input_status = await this._request(OBS_REQUEST.GET_MEDIA_INPUT_STATUS, {
						inputName: input_name
					});
					
					if (input_status && (input_status.mediaState === 'OBS_MEDIA_STATE_PAUSED' || input_status.mediaState === 'OBS_MEDIA_STATE_STOPPED' || input_status.mediaState === 'OBS_MEDIA_STATE_ENDED')) {
						log_info(`{play_all()} > playing media {${input_name}}`, OBS_PREFIX);
						media_play_promises.push(
							this._request(OBS_REQUEST.TRIGGER_MEDIA_INPUT_ACTION, {
								inputName: input_name,
								mediaAction: OBS_MEDIA_INPUT_ACTION.PLAY
							})
						);
					}
				} catch (e) {
					// Not a media input, skip
				}
			}
			
			if (media_play_promises.length > 0) {
				await Promise.all(media_play_promises);
				log_info(`{play_all()} > started playing {${media_play_promises.length}} media inputs`, OBS_PREFIX);
			} else {
				log_info('{play_all()} > no paused/stopped media found in current scene', OBS_PREFIX);
			}
		} catch (error) {
			log_warn(`{play_all()} > error: ${error}`);
		}
	}

	async seek(media_name: string, timestamp_ms: number, loop: boolean = false) {
		log_info(`{seek()} > seeking media {${media_name}} to {${timestamp_ms}ms}`, OBS_PREFIX);
		
		let final_timestamp = timestamp_ms;
		
		if (loop) {
			try {
				const media_status = await this._request(OBS_REQUEST.GET_MEDIA_INPUT_STATUS, {
					inputName: media_name
				});
				
				if (media_status && media_status.mediaDuration && media_status.mediaDuration > 0) {
					final_timestamp = timestamp_ms % media_status.mediaDuration;
					if (final_timestamp !== timestamp_ms) {
						log_info(`{seek()} > Looped seek: {${timestamp_ms}ms} -> {${final_timestamp}ms} (duration: {${media_status.mediaDuration}ms})`, OBS_PREFIX);
					}
				}
			} catch (e) {
				log_warn(`{seek()} > failed to get media duration for looping calculation: ${e}`);
			}
		}
		
		return this._request(OBS_REQUEST.SET_MEDIA_INPUT_CURSOR, {
			inputName: media_name,
			mediaCursor: final_timestamp
		});
	}

	async seek_all(timestamp_ms: number, loop: boolean = false) {
		log_info(`{seek_all()} > Seeking all media in current scene to {${timestamp_ms}ms}`, OBS_PREFIX);
		
		try {
			const current_scene = await this._request(OBS_REQUEST.GET_CURRENT_PROGRAM_SCENE);
			if (!current_scene) {
				log_warn('{seek_all()} > failed to get current program scene');
				return;
			}
			
			const scene_items = await this._request(OBS_REQUEST.GET_SCENE_ITEM_LIST, {
				sceneName: current_scene.sceneName
			});
			
			if (!scene_items || !scene_items.sceneItems) {
				log_warn('{seek_all()} > failed to get scene items');
				return;
			}
			
			const media_seek_promises = [];
			
			for (const item of scene_items.sceneItems) {
				const input_name = item.sourceName;
				
				try {
					const input_status = await this._request(OBS_REQUEST.GET_MEDIA_INPUT_STATUS, {
						inputName: input_name
					});
					
					if (input_status && input_status.mediaDuration !== null) {
						let final_timestamp = timestamp_ms;
						
						if (loop && input_status.mediaDuration > 0) {
							final_timestamp = timestamp_ms % input_status.mediaDuration;
						}
						
						log_info(`{seek_all()} > seeking media {${input_name}} to {${final_timestamp}ms}`, OBS_PREFIX);
						media_seek_promises.push(
							this._request(OBS_REQUEST.SET_MEDIA_INPUT_CURSOR, {
								inputName: input_name,
								mediaCursor: final_timestamp
							})
						);
					}
				} catch (e) {
					// Not a media input, skip
				}
			}
			
			if (media_seek_promises.length > 0) {
				await Promise.all(media_seek_promises);
				log_info(`{seek_all()} > seeked {${media_seek_promises.length}} media inputs`, OBS_PREFIX);
			} else {
				log_info('{seek_all()} > no media found in current scene', OBS_PREFIX);
			}
		} catch (error) {
			log_warn(`{seek_all()} > error: ${error}`);
		}
	}

	async delete_all_scenes() {
		try {
			const current_program_scene = await this._request(OBS_REQUEST.GET_CURRENT_PROGRAM_SCENE);
			if (!current_program_scene) {
				log_warn('{delete_all_scenes()} > failed to get current program scene, aborting');
				return;
			}
			
			const current_scene_name = current_program_scene.sceneName;
			log_info(`{delete_all_scenes()} > current program scene {${current_scene_name}} will not be deleted`, OBS_PREFIX);
			
			const scene_list_response = await this._request(OBS_REQUEST.GET_SCENE_LIST);
			if (!scene_list_response || !scene_list_response.scenes) {
				log_warn('{delete_all_scenes()} > failed to get scene list, aborting');
				return;
			}
			
			const scenes = scene_list_response.scenes;
			const promises = [];
			for (const scene of scenes) {
				if (scene.sceneName === current_scene_name)
					continue;

				log_info(`{delete_all_scenes()} > deleting scene {${scene.sceneName}}`, OBS_PREFIX);
				promises.push(this._request(OBS_REQUEST.REMOVE_SCENE, {
					sceneName: scene.sceneName
				}));
			}
			
			if (promises.length === 0) {
				log_info('{delete_all_scenes()} > no valid scenes to delete', OBS_PREFIX);
				return;
			}
			
			await Promise.all(promises);
			
			log_info(`{delete_all_scenes()} > successfully deleted {${promises.length}} scenes`, OBS_PREFIX);
		} catch (error) {
			log_warn(`{delete_all_scenes()} > error: ${error}`);
		}
	}

	rename_scene(scene_name: string, new_name: string) {
		log_info(`{rename_scene()} > renaming scene {${scene_name}} to {${new_name}}`, OBS_PREFIX);
		return this._request(OBS_REQUEST.SET_SCENE_NAME, {
			sceneName: scene_name,
			newSceneName: new_name
		});
	}

	on_time(media_name: string, timestamp: number, callback: Function) {
		let tracker = media_trackers.get(media_name);
		if (!tracker) {
			tracker = new MediaTracker(media_name, this);
			media_trackers.set(media_name, tracker);
		}
		
		tracker.add_callback(timestamp, callback);
		
		return this;
	}

	_on_message(event: any) {
		try {
			const event_data = event.data as string;
			validate_string(event_data, 'event.data');

			const message: OBSMessage = JSON.parse(event_data);
			const message_size = Buffer.byteLength(event_data);
			
			if (message.op === OBS_OP_CODE.EVENT) {
				const event_type = message.d.eventType;
				const event_data = message.d.eventData;
	
				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} [{${event_type}}] size {${format_bytes(message_size)}}`, OBS_PREFIX);
	
				// Handle media events for registered trackers
				if (event_type === OBS_EVENT_TYPE.MEDIA_INPUT_PLAYBACK_STARTED || 
					event_type === OBS_EVENT_TYPE.MEDIA_INPUT_PLAYBACK_ENDED ||
					event_type === OBS_EVENT_TYPE.MEDIA_INPUT_ACTION_TRIGGERED) {
					
					const input_name = event_data?.inputName || '';
					
					// For action triggered events, check if it's a stop action
					const is_stop_action = event_type === OBS_EVENT_TYPE.MEDIA_INPUT_ACTION_TRIGGERED && 
						(event_data?.mediaAction === OBS_MEDIA_INPUT_ACTION.STOP || 
						 event_data?.mediaAction === OBS_MEDIA_INPUT_ACTION.PAUSE);
					
					for (const [tracker_name, tracker] of media_trackers.entries()) {
						if (input_name === tracker_name) {
							if (event_type === OBS_EVENT_TYPE.MEDIA_INPUT_PLAYBACK_STARTED) {
								tracker._handle_media_start();
							} else if (event_type === OBS_EVENT_TYPE.MEDIA_INPUT_PLAYBACK_ENDED || is_stop_action) {
								tracker._handle_media_stop();
							}
						}
					}
				}
			} else if (message.op === OBS_OP_CODE.REQUEST_BATCH_RESPONSE) {
				const request_id = message.d.requestId;
				const request_results = message.d.results;

				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} [BATCH * {${request_results.length}}] size {${format_bytes(message_size)}}`, OBS_PREFIX);

				// todo handle this response if needed?
			} else if (message.op === OBS_OP_CODE.REQUEST_RESPONSE) {
				const request_type = message.d.requestType;
				const request_id = message.d.requestId;

				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} [{${request_type}}] size {${format_bytes(message_size)}}`, OBS_PREFIX);

				const resolver = obs_request_map.get(request_id);
				if (resolver) {
					log_verbose(`received tracked {${request_type}} response [{${request_id}}]`, OBS_PREFIX);
					obs_request_map.delete(request_id);

					const request_status = message.d.requestStatus;
					if (request_status.result) {
						resolver(message.d.responseData);
					} else {
						log_verbose(`request {${request_id}} failed with code {${request_status.code}} (${request_status.comment ?? 'n/a'})`, OBS_PREFIX);
						resolver(null);
					}
				} else {
					log_verbose(`dropping non-tracked {${request_type}} response [{${request_id}}]`, OBS_PREFIX);
				}
			} else {
				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} size {${format_bytes(message_size)}}`, OBS_PREFIX);

				if (message.op === OBS_OP_CODE.HELLO) {
					const auth = message.d.authentication;
					const payload: OBSMessageData = {
						rpcVersion: message.d.rpcVersion,
						eventSubscriptions: OBS_EVENT_SUB.ALL
					};
	
					if (auth) {
						payload.authentication = obs_create_auth_string(
							this.obs_password,
							auth.salt,
							auth.challenge
						);
					}
	
					this._send(OBS_OP_CODE.IDENTIFY, payload);
				} else if (message.op === OBS_OP_CODE.IDENTIFIED) {
					this.identified = true;
					log_info(`successfully identified with OBS host {${this.obs_host}} using RPC version {${message.d.negotiatedRpcVersion}}`, OBS_PREFIX);

					if (this.connection_resolver) {
						this.connection_resolver(this);
						this.connection_resolver = null;
					}

					this._request(OBS_REQUEST.GET_VERSION).then(res => {
						log_info(`OBS host running version {${res?.obsVersion}} (${res?.platformDescription})`, OBS_PREFIX)
					});
				}
			}
		} catch (e) {
			const error = e as Error;
			log_warn(`failed to parse OBS message due to ${error.name}: ${error.message}`);
		}
	}
}

export async function connect_obs(obs_host: string, obs_port: number, obs_password: string): Promise<OBSConnection> {
	const connection = new OBSConnection(obs_host, obs_port, obs_password);
	return await connection.ready;
}
// endregion

// region etc
const ETC_PREFIX = 'ETC';
const ETC_RECONNECT_DELAY = 500;

function osc_write_int32(val: number): Uint8Array {
	const buf = new ArrayBuffer(4);
	const view = new DataView(buf);

	view.setInt32(0, val, false);

	return new Uint8Array(buf);
}

function osc_write_string(str: string): Uint8Array {
	const encoder = new TextEncoder();
	const bytes = encoder.encode(str + '\0');
	const padded_len = (bytes.length + 3) & ~0x03;
	const padded = new Uint8Array(padded_len);

	padded.set(bytes);
	
	return padded;
}

function osc_create_message(address: string, args: any[] = []): Uint8Array {
	// Build type tag string
	let type_tag = ',';
	for (const arg of args) {
		if (typeof arg === 'number')
			type_tag += 'i';
		else if (typeof arg === 'string')
			type_tag += 's';
	}

	// Encode address and type tag
	const addr_bytes = osc_write_string(address);
	const type_bytes = osc_write_string(type_tag);

	// Encode arguments
	const arg_bytes: Uint8Array[] = [];
	for (const arg of args) {
		if (typeof arg === 'number')
			arg_bytes.push(osc_write_int32(arg));
		else if (typeof arg === 'string')
			arg_bytes.push(osc_write_string(arg));
	}

	// Calculate total length
	const total_len = addr_bytes.length + type_bytes.length + arg_bytes.reduce((acc, val) => acc + val.length, 0);

	// Combine all parts with length prefix
	const len_prefix = osc_write_int32(total_len);
	const message = new Uint8Array(len_prefix.length + total_len);
	
	let offset = 0;
	message.set(len_prefix, offset);
	offset += len_prefix.length;

	message.set(addr_bytes, offset);
	offset += addr_bytes.length;

	message.set(type_bytes, offset);
	offset += type_bytes.length;

	for (const bytes of arg_bytes) {
		message.set(bytes, offset);
		offset += bytes.length;
	}

	return message;
}

class ETCConnection {
	socket: TCPSocket|null = null;
	reconnect_timer: Timer|null = null;
	connected: boolean = false;
	
	etc_host: string;
	etc_port: number;
	cue_callbacks: Map<number, Function[]> = new Map();
	
	private connection_promise: Promise<ETCConnection>;
	private connection_resolver: ((connection: ETCConnection) => void) | null = null;

	constructor(etc_host: string, etc_port: number) {
		this.etc_host = etc_host;
		this.etc_port = etc_port;
		
		this.connection_promise = new Promise<ETCConnection>(resolve => {
			this.connection_resolver = resolve;
		});
		
		this._connect();
	}
	
	get ready(): Promise<ETCConnection> {
		return this.connection_promise;
	}

	async _connect() {
		this._disconnect();

		try {
			Bun.connect({
				hostname: this.etc_host,
				port: this.etc_port,
				socket: {
					open: (socket) => {
						log_info(`connected to ETC host {${this.etc_host}}`, ETC_PREFIX);
						this.connected = true;
						this.socket = socket;

						if (this.connection_resolver) {
							this.connection_resolver(this);
							this.connection_resolver = null;
						}
					},

					data: (socket, data: any) => {
						this._handle_data(data);
					},

					error: (socket, error) => {
						log_warn(`${error.name} raised in ETC socket: ${error.message}`);
					},

					close: () => {
						this.socket = null;
						this.connected = false;

						log_info(`lost connection to ETC host`, ETC_PREFIX);

						log_info(`reconnecting to ETC host in {${ETC_RECONNECT_DELAY}ms}`, ETC_PREFIX);
						this.reconnect_timer = setTimeout(() => this._connect(), ETC_RECONNECT_DELAY);
					}
				}
			});
		} catch (e) {
			const err = e as Error;
			log_warn(`{${err.name}} raised connecting to ETC host: ${err.message}`);

			log_info(`reconnecting to ETC host in {${ETC_RECONNECT_DELAY}ms}`, ETC_PREFIX);
			this.reconnect_timer = setTimeout(() => this._connect(), ETC_RECONNECT_DELAY);
		}

		return this.ready;
	}

	_disconnect() {
		if (this.reconnect_timer !== null)
			clearTimeout(this.reconnect_timer);

		this.socket?.end();

		this.socket = null;
		this.connected = false;
		this.reconnect_timer = null;
	}

	_send_command(address: string, ...args: any[]) {
		if (!this.connected || !this.socket)
			return;

		if (!address.startsWith('/eos/')) {
			if (address.startsWith('/'))
				address = '/eos' + address;
			else
				address = '/eos/' + address;
		}

		log_verbose(`SEND {${address}} [${args.map(e => `{${e}}`).join(', ')}]`, ETC_PREFIX);

		const message = osc_create_message(address, args);
		this.socket?.write(message);
	}

	_handle_data(data: Uint8Array) {
		try {
			if (data.length < 8)
				return;
			
			const length_view = new DataView(data.buffer, data.byteOffset, 4);
			const packet_length = length_view.getInt32(0, false);
			
			if (packet_length !== data.length - 4) {
				log_warn(`OSC packet length mismatch: expected ${packet_length}, got ${data.length - 4}`);
				return;
			}
			
			if (packet_length % 4 !== 0) {
				log_warn(`OSC packet size ${packet_length} not multiple of 4`);
				return;
			}
			
			const osc_content = data.subarray(4);
			const decoder = new TextDecoder();

			let address_end = osc_content.indexOf(0);
			if (address_end === -1) {
				log_warn(`no null terminator found in OSC address`);
				return;
			}
			
			const address = decoder.decode(osc_content.subarray(0, address_end));
			const address_padded = (address_end + 4) & ~0x03; // arguments, type tags, etc
			
			log_verbose(`RECV {${address}} size {${format_bytes(data.length)}}`, ETC_PREFIX);
			
			if (address === '/eos/out/event/cue/fire' || address.startsWith('/eos/out/event/cue/')) {
				const parts = address.split('/');
				if (parts.length >= 6) {
					const cue_list = parseInt(parts[5], 10);
					const cue_number = parseFloat(parts[6]);

					if (cue_list !== 1) // fix for core busking
						return;
					
					log_verbose(`received cue fire event: list {${cue_list}} cue {${cue_number}}`, ETC_PREFIX);
					
					const callbacks = this.cue_callbacks.get(cue_number);
					if (callbacks) {
						for (const callback of callbacks)
							callback(cue_number, cue_list);
					}
				}
			}
		} catch (e) {
			const err = e as Error;
			log_warn(`error parsing OSC data: ${err.message}`);
		}
	}

	fire_cue(cue_number: number) {
		this._send_command('cue/' + cue_number + '/fire');
	}
	
	record_cue(cue_number: number, label: string = '') {
		this._send_command('/cue/record', cue_number);
		
		if (label && label.length > 0)
			this._send_command('/cue/label', cue_number, label);
	}
	
	on_cue(cue_number: number, callback: Function) {
		if (!this.cue_callbacks.has(cue_number))
			this.cue_callbacks.set(cue_number, []);
			
		this.cue_callbacks.get(cue_number)?.push(callback);
	}
}

export async function connect_etc(etc_host: string, etc_port: number): Promise<ETCConnection> {
	const connection = new ETCConnection(etc_host, etc_port);
	return await connection.ready;
}
// endregion