import package_json from './package.json';
import node_http from 'node:http';
import node_path from 'node:path';
import node_os from 'node:os';
import node_fs from 'node:fs/promises';
import { createHash } from 'crypto';
import { PACKET, get_packet_name, build_packet, parse_packet, PACKET_TYPE, PACKET_UNK } from './src/web/scripts/packet.js';
import { INTEGRATION_TYPE, INTEGRATION_LABELS } from './src/web/scripts/integration_type';

import type { WebSocketHandler, ServerWebSocket, Subprocess, TCPSocket } from 'bun';

// MARK: :constants
const PREFIX_WEBSOCKET = 'WEBSOCKET';
const PREFIX_OBS = 'OBS';
const PREFIX_ETC = 'ETC';
const PREFIX_HTTP = 'HTTP';

const ETC_RECONNECT_DELAY = 2500;

const OBS_RECONNECT_DELAY = 2500;
const OBS_RESPONSE_TIMEOUT = 5000;

const HTTP_SERVE_DIRECTORY = './src/web';

const PARTIAL_DEFAULT_CHUNK = 2 * 1024 * 1024;

const PROJECT_STATE_DIRECTORY = './state';
const PROJECT_STATE_EXT = '.json';
const PROJECT_STATE_INDEX = node_path.join(PROJECT_STATE_DIRECTORY, 'index.json');

const VOLMGR_WIN_EXE = './volmgr/bin/Release/net8.0/win-x64/publish/volmgr.exe';

const TYPE_NUMBER = 'number';
const TYPE_STRING = 'string';
const TYPE_OBJECT = 'object';

const CHAR_TAB = '\t';

const ARRAY_EMPTY = Object.freeze([]);

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

const OBS_OP_CODE_TO_STR = Object.fromEntries(
	Object.entries(OBS_OP_CODE).map(([key, value]) => [value, key])
) as Record<Enum<typeof OBS_OP_CODE>, string>;

// MARK: :errors
class AssertionError extends Error {
	constructor(message: string, key: string) {
		super('"' + key + '" ' + message);
		this.name = 'AssertionError';
	}
}

// MARK: :types
type CLIValue = string | boolean | number;

type Unbox<T> = T extends Array<infer U> ? U : T;
type Enum<T> = T[keyof T];

type ClientSocketData = { sck_id: string };
type ClientSocket = ServerWebSocket<ClientSocketData>;

type PacketTarget = ClientSocket | Iterable<ClientSocket>;
type PacketDataType = null | object | string | number;
type Packet = { id: number, data: null|object|string };

type OBSRequestBatchEntry = { requestType: Enum<typeof OBS_REQUEST>, requestData?: OBSMessageData };

type OBSMessageData = Record<string, any>;

type IntegrationEntry = {
	id: string;
	type: Enum<typeof INTEGRATION_TYPE>;
	name: string;
	enabled: boolean;
	meta: IntegrationMetaETC | IntegrationMetaOBS;
	connection: IntegrationConnectionETC;
};

type IntegrationMetaOBS = {
	obs_host: string;
	obs_port: number;
	obs_password: string;
};

type IntegrationMetaETC = {
	etc_host: string;
	etc_port: number;
};

type IntegrationConnectionETC = {
	socket: TCPSocket|null;
	reconnect_timer: Timer|null;
	connected: boolean;
};

type IntegrationConnectionOBS = {
	socket: WebSocket|null;
	reconnect_timer: Timer|null;
	connected: boolean;
	identified: boolean;
};

interface OBSMessage {
	op: number;
	d: OBSMessageData;
}

// MARK: :state
const CLI_ARGS = {
	port: 19531,
	verbose: false
} as Record<string, CLIValue>;

const socket_packet_listeners = new Map<number, ClientSocket[]>();
const socket_clients = new Set<ClientSocket>();

const active_integrations = new Map<string, IntegrationEntry>();

let next_client_id = 1;

const obs_request_map = new Map();

// MARK: :prototype
declare global {
	interface Map<K,V> {
		get_set_arr(key: K, value: Unbox<V>): V[];
	}
}

Map.prototype.get_set_arr = function(key: any, value: any) {
	let arr = this.get(key);
	if (arr)
		arr.push(value);
	else
		this.set(key, [value]);
	return arr;
}

// MARK: :log

/** Prints a message to stdout. Sections can be coloured using {curly brace} syntax. */
function log_info(message: string, prefix = 'INFO') {
	const formatted_message = (`[{${prefix}}] ` + message).replace(/\{([^}]+)\}/g, `\x1b[36m$1\x1b[0m`);
	process.stdout.write(formatted_message + '\n');
}

/** Prints a message to stdout if --verbose is enabled. Sections can be coloured using {curly brace} syntax */
function log_verbose(message: string, prefix = 'DEBUG') {
	if (!CLI_ARGS.verbose)
		return;

	log_info(message, prefix);
}

/** Prints a warning message (no formatting) to stdout. */
function log_warn(message: string) {
	process.stdout.write('\x1b[93mWARNING: \x1b[31m' + message + '\x1b[0m\n');
}

// MARK: :volmgr
let volmgr_proc: Subprocess<"pipe", "pipe", "inherit"> | null = null;

function volmgr_init() {
	if (process.platform !== 'win32')
		return log_warn(`Volume control not supported on {${process.platform}}`);

	const exe = Bun.file(VOLMGR_WIN_EXE);
	if (exe.size === 0) {
		log_warn('{volmgr} not compiled, volume control disabled');
		return;
	}

	volmgr_proc = Bun.spawn([VOLMGR_WIN_EXE], {
		stdin: "pipe",
		stdout: "pipe"
	});

	log_verbose(`{volmgr} sub-process started with PID {${volmgr_proc.pid}}`);
}

function volmgr_send(msg: object) {
	if (volmgr_proc === null)
		return;

	volmgr_proc.stdin.write(JSON.stringify(msg) + "\n");
	volmgr_proc.stdin.flush();
}

async function get_system_volume() {
	if (volmgr_proc === null)
		return 1.0;

	try {
		volmgr_send({ cmd: 'get' });

		const decoder = new TextDecoder();
		for await (const chunk of volmgr_proc.stdout)
			return JSON.parse(decoder.decode(chunk)).value;

		throw new Error('no data received from sub-process');
	} catch (e) {
		const error = e as Error;
		log_warn(`volmgr failed to get system volume due to {${error.name}}: ${error.message}`);
	}
	
	return 1.0;
}

function set_system_volume(value: number) {
	if (volmgr_proc === null)
		return;

	volmgr_send({ cmd: 'set', value });
}

// MARK: :osc
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

// MARK: :integrations
function send_integration_status(integration: IntegrationEntry) {
	send_object(PACKET.INTEGRATION_STATUS, {
		id: integration.id,
		connected: integration.connection.connected
	});
}

function get_integration_by_uuid(uuid: string) {
	return active_integrations.get(uuid);
}

// MARK: :etc
async function etc_connect(integration: IntegrationEntry) {
	const meta = integration.meta as IntegrationMetaETC;
	const connection = integration.connection as IntegrationConnectionETC;

	const reconnect_fn = () => etc_connect(integration);
	etc_disconnect(integration);

	try {
		connection.socket = await Bun.connect({
			hostname: meta.etc_host,
			port: meta.etc_port,
			socket: {
				open: (socket) => {
					log_info(`Connected to ETC host {${meta.etc_host}}`, PREFIX_ETC);

					connection.connected = true;
					send_integration_status(integration);
				},

				data: (socket, data) => {
					// todo: do we actually care about data sent to us from the board?
				},

				error: (socket, error) => {
					log_warn(`${error.name} raised in ETC socket: ${error.message}`);
				},

				close: () => {
					connection.socket = null;
					connection.connected = false;

					log_info(`Lost connection to ETC host`, PREFIX_ETC);

					if (integration.enabled) {
						log_info(`Reconnecting to ETC host in {${ETC_RECONNECT_DELAY}ms}`, PREFIX_ETC);
						connection.reconnect_timer = setTimeout(reconnect_fn, ETC_RECONNECT_DELAY);
					}

					send_integration_status(integration);
				}
			}
		});
	} catch (e) {
		const err = e as Error;
		log_warn(`${err.name} raised connecting to ETC host: ${err.message}`);

		if (integration.enabled) {
			log_info(`Reconnecting to ETC host in {${ETC_RECONNECT_DELAY}ms}`, PREFIX_ETC);
			connection.reconnect_timer = setTimeout(reconnect_fn, ETC_RECONNECT_DELAY);
		}
	}
}

function etc_disconnect(integration: IntegrationEntry) {
	const connection = integration.connection as IntegrationConnectionETC;

	if (connection.reconnect_timer !== null)
		clearTimeout(connection.reconnect_timer);

	connection.socket?.end();

	connection.socket = null;
	connection.connected = false;
	connection.reconnect_timer = null;
}

function etc_send_command(int_id: string, address: string, ...args: any[]) {
	const integration = active_integrations.get(int_id);
	if (!integration)
		return;

	const connection = integration.connection;
	if (!connection.connected)
		return;

	if (!address.startsWith('/eos/')) {
		if (address.startsWith('/'))
			address = '/eos' + address;
		else
			address = '/eos/' + address;
	}

	log_verbose(`SEND {${address}} [${args.map(e => `{${e}}`).join(', ')}]`, PREFIX_ETC);

	const message = osc_create_message(address, args);
	connection.socket?.write(message);
}

// MARK: :obs
function obs_connect(integration: IntegrationEntry) {
	const meta = integration.meta as IntegrationMetaOBS;
	const connection = integration.connection as IntegrationConnectionOBS;
	
	obs_disconnect(integration);

	const host_string = `ws://${meta.obs_host}:${meta.obs_port}`;

	connection.socket = new WebSocket(host_string);
	connection.socket.addEventListener('message', async event => {
		try {
			const event_data = event.data as string;
			validate_string(event_data, 'event.data');

			const message: OBSMessage = JSON.parse(event_data);
			const message_size = Buffer.byteLength(event_data);
			
			if (message.op === OBS_OP_CODE.EVENT) {
				const event_type = message.d.eventType;
				const event_data = message.d.eventData;

				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} [{${event_type}}] size {${format_file_size(message_size)}}`, PREFIX_OBS);

				// the following event handling has been commented out as it's designed for the controller-only
				// single-connection logic. this needs to be refactored for the new integration system.

				/*if (event_type === OBS_EVENT_TYPE.MEDIA_INPUT_PLAYBACK_STARTED) {
					send_object(PACKET.OBS_MEDIA_PLAYBACK_STARTED, event_data.inputUuid);

					const status_query = await obs_request(OBS_REQUEST.GET_MEDIA_INPUT_STATUS, {
						inputUuid: event_data.inputUuid
					});

					if (status_query) {
						send_object(PACKET.OBS_MEDIA_DURATION, {
							uuid: event_data.inputUuid,
							duration: status_query.mediaDuration
						});
					}
				} else if (event_type === OBS_EVENT_TYPE.MEDIA_INPUT_PLAYBACK_ENDED) {
					send_object(PACKET.OBS_MEDIA_PLAYBACK_ENDED, event_data.inputUuid);
				} else if (event_type === OBS_EVENT_TYPE.CURRENT_PROGRAM_SCENE_CHANGED) {
					obs_current_scene = event_data.sceneUuid;
					send_object(PACKET.OBS_SCENE_NAME, event_data.sceneName);
				} else if (event_type === OBS_EVENT_TYPE.SCENE_LIST_CHANGED) {
					send_object(PACKET.OBS_SCENE_LIST, event_data.scenes);
				}*/
			} else if (message.op === OBS_OP_CODE.REQUEST_BATCH_RESPONSE) {
				const request_id = message.d.requestId;
				const request_results = message.d.results;

				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} [BATCH * {${request_results.length}}] size {${format_file_size(message_size)}}`, PREFIX_OBS);

				const resolver = obs_request_map.get(request_id);
				if (resolver) {
					log_verbose(`Received tracked batch response [{${request_id}}]`, PREFIX_OBS);
					obs_request_map.delete(request_id);

					resolver(request_results);
				} else {
					log_verbose(`Dropping non-tracked batch response [{${request_id}}]`, PREFIX_OBS);
				}
			} else if (message.op === OBS_OP_CODE.REQUEST_RESPONSE) {
				const request_type = message.d.requestType;
				const request_id = message.d.requestId;

				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} [{${request_type}}] size {${format_file_size(message_size)}}`, PREFIX_OBS);

				const resolver = obs_request_map.get(request_id);
				if (resolver) {
					log_verbose(`Received tracked {${request_type}} response [{${request_id}}]`, PREFIX_OBS);
					obs_request_map.delete(request_id);

					const request_status = message.d.requestStatus;
					if (request_status.result) {
						resolver(message.d.responseData);
					} else {
						log_verbose(`Request {${request_id}} failed with code {${request_status.code}} (${request_status.comment ?? 'n/a'})`, PREFIX_OBS);
						resolver(null);
					}
				} else {
					log_verbose(`Dropping non-tracked {${request_type}} response [{${request_id}}]`, PREFIX_OBS);
				}
			} else {
				log_verbose(`RECV {${OBS_OP_CODE_TO_STR[message.op]}} size {${format_file_size(message_size)}}`, PREFIX_OBS);

				if (message.op === OBS_OP_CODE.HELLO) {
					const auth = message.d.authentication;
					const payload: OBSMessageData = {
						rpcVersion: message.d.rpcVersion,
						eventSubscriptions: OBS_EVENT_SUB.ALL
					};
	
					if (auth) {
						payload.authentication = obs_create_auth_string(
							meta.obs_password,
							auth.salt,
							auth.challenge
						);
					}
	
					obs_send(integration, OBS_OP_CODE.IDENTIFY, payload);
				} else if (message.op === OBS_OP_CODE.IDENTIFIED) {
					connection.identified = true;
					log_verbose(`Successfully identified with OBS host using RPC version {${message.d.negotiatedRpcVersion}}`, PREFIX_OBS);
					obs_request(integration, OBS_REQUEST.GET_VERSION).then(res => log_info(`OBS host running version {${res?.obsVersion}} (${res?.platformDescription})`, PREFIX_OBS));
				}
			}
		} catch (e) {
			const error = e as Error;
			log_warn(`Failed to parse OBS message due to ${error.name}: ${error.message}`);
		}
	});

	connection.socket.addEventListener('open', () => {
		log_info(`Connected to OBS host {${meta.obs_host}} on port {${meta.obs_port}}`, PREFIX_OBS);
		connection.connected = true;
		send_integration_status(integration);
	});

	connection.socket.addEventListener('close', event => {
		connection.socket = null;
		connection.identified = false;
		connection.connected = false;

		log_info(`Disconnected from OBS host: {${event.code}} ${event.reason}`, PREFIX_OBS);

		send_integration_status(integration);

		if (integration.enabled) {
			log_info(`Reconnecting to OBS host in {${OBS_RECONNECT_DELAY}ms}`, PREFIX_OBS);
			connection.reconnect_timer = setTimeout(() => obs_connect(integration), OBS_RECONNECT_DELAY);
		}
	});

	connection.socket.addEventListener('error', error => {
		log_warn(`${error.type} raised in OBS socket: ${error.message}`);
	});
}

function obs_disconnect(integration: IntegrationEntry) {
	const connection = integration.connection as IntegrationConnectionOBS;
	if (connection.reconnect_timer !== null)
		clearTimeout(connection.reconnect_timer);

	obs_request_map.clear();

	connection.socket?.close();

	connection.socket = null;
	connection.identified = false;
	connection.connected = false;
	connection.reconnect_timer = null;
}

async function obs_get_scene_items(integration: IntegrationEntry, scene_uuid: string) {
	const req_scene_items = await obs_request(integration, OBS_REQUEST.GET_SCENE_ITEM_LIST, { sceneUuid: scene_uuid });
	return req_scene_items?.sceneItems ?? ARRAY_EMPTY;
}

async function obs_send_batch_for_scene_items(integration: IntegrationEntry, request_type: Enum<typeof OBS_REQUEST>, batch: OBSMessageData, scene_name: string) {
	const items = await obs_get_scene_items(integration, scene_name);
	const n_items = items.length;

	if (n_items === 0)
		return;

	const request_batch = Array(n_items);

	for (let i = 0; i < n_items; i++) {
		request_batch[i] = {
			requestType: request_type,
			requestData: Object.assign({
				inputUuid: items[i].sourceUuid
			}, batch)
		};
	}

	obs_request_batch(integration, request_batch);
}

function obs_send(integration: IntegrationEntry, op: number, message: OBSMessageData) {
	const connection = integration.connection as IntegrationConnectionOBS;

	const payload = { op, d: message } as OBSMessage;
	const payload_json = JSON.stringify(payload);
	const payload_size = Buffer.byteLength(payload_json);

	connection.socket?.send(payload_json);

	log_verbose(`SEND {${OBS_OP_CODE_TO_STR[op]}} size {${format_file_size(payload_size)}}`, PREFIX_OBS);
}

async function obs_request(integration: IntegrationEntry, request_type: Enum<typeof OBS_REQUEST>, request_data: OBSMessageData = {}, timeout = OBS_RESPONSE_TIMEOUT): Promise<OBSMessageData|null> {
	return new Promise(resolve => {
		let timeout_id: Timer|null = null;
		const request_uuid = Bun.randomUUIDv7();

		obs_request_map.set(request_uuid, (value: OBSMessage|null) => {
			if (timeout_id !== null)
				clearTimeout(timeout_id);

			resolve(value);
		});

		log_verbose(`Preparing OBS request {${request_type}} ID {${request_uuid}}`, PREFIX_OBS);
	
		obs_send(integration, OBS_OP_CODE.REQUEST, {
			requestType: request_type,
			requestId: request_uuid,
			requestData: request_data
		});

		if (timeout > 0) {
			timeout_id = setTimeout(() => {
				obs_request_map.delete(request_uuid);
				log_warn(`Timed out waiting for ${request_type} response from OBS (timeout: ${timeout}ms)`);
				resolve(null);
			}, timeout);
		}
	});
}

async function obs_request_batch(integration: IntegrationEntry, batch: OBSRequestBatchEntry[], execution_type: Enum<typeof OBS_EXECUTION_TYPE> = OBS_EXECUTION_TYPE.SERIAL_REALTIME, halt_on_fail = false): Promise<OBSMessageData[]> {
	if (batch.length === 0)
		return [];

	return new Promise(resolve => {
		const batch_uuid = Bun.randomUUIDv7();
		obs_request_map.set(batch_uuid, resolve);

		log_verbose(`Preparing OBS request batch containing {${batch.length}} ID {${batch_uuid}}`, PREFIX_OBS);

		obs_send(integration, OBS_OP_CODE.REQUEST_BATCH, {
			requestId: batch_uuid,
			executionType: execution_type,
			haltOnFailure: halt_on_fail,
			requests: batch
		});
	});
}

function obs_create_auth_string(password: string, salt: string, challenge: string): string {
	const secret = createHash('sha256').update(password + salt).digest('base64');
	return createHash('sha256').update(secret + challenge).digest('base64');
}

function obs_set_scene_by_name(integration: IntegrationEntry, scene_name: string) {
	obs_request(integration, OBS_REQUEST.SET_CURRENT_PROGRAM_SCENE, {
		sceneName: scene_name
	});
}

function obs_set_scene(integration: IntegrationEntry, scene_uuid: string) {
	obs_request(integration, OBS_REQUEST.SET_CURRENT_PROGRAM_SCENE, {
		sceneUuid: scene_uuid
	});
}

// MARK: :projects
async function load_project_index() {
	const index_file = Bun.file(PROJECT_STATE_INDEX);

	if (await index_file.exists())
		return await index_file.json();

	return {};
}

async function save_project_index(index: any) {
	await Bun.write(PROJECT_STATE_INDEX, JSON.stringify(index, null, CHAR_TAB));
}

async function update_project_index(project_id: string, project_type: string, project_name: string) {
	const index = await load_project_index();
	index[project_id] = { name: project_name, last_saved: Date.now(), type: project_type };
	await save_project_index(index);

	log_verbose(`{${project_id}} updated in project index`);
}

async function delete_project_index_entry(project_id: string) {
	const index = await load_project_index();
	if (project_id in index) {
		delete index[project_id];
		await save_project_index(index);

		log_verbose(`{${project_id}} deleted from project index`);
	}
}

// MARK: :packets
function register_packet_listener(ws: ClientSocket, packets: number[]) {
	for (const packet_id of packets)
		socket_packet_listeners.get_set_arr(packet_id, ws);

	if (CLI_ARGS.verbose) {
		const packet_names = packets.map(e => '{' + get_packet_name(e) + '}').join(',');
		log_verbose(`{${ws.data.sck_id}} registered for packets [${packet_names}]`);
	}
}

function unregister_packet_listener(ws: ClientSocket, packet_id: number) {
	const listeners = socket_packet_listeners.get(packet_id);
	if (listeners !== undefined) {
		const listener_index = listeners.indexOf(ws);
		if (listener_index > -1) {
			listeners.splice(listener_index, 1);
			log_verbose(`{${ws.data.sck_id}} unregistered from {${get_packet_name(packet_id)}}`);
		}
	}
}

function remove_listeners(ws: ClientSocket) {
	let removed = 0;
	for (const listener_array of socket_packet_listeners.values()) {
		const index = listener_array.indexOf(ws);
		if (index !== -1) {
			listener_array.splice(index, 1);
			removed++;
		}
	}
	
	log_verbose(`Removed {${removed}} listeners from client {${ws.data.sck_id}}`);
}

function send_packet(ws: PacketTarget|null, packet_id: number, packet_type: number, data: PacketDataType, originator: ClientSocket|null, uid = 0) {
	const packet = build_packet(packet_id, packet_type, data, uid);
	const targets = ws === null ? get_listening_clients(packet_id) : Array.isArray(ws) ? ws : [ws];
	
	for (const socket of targets) {
		if (socket === originator)
			continue;

		socket.sendBinary(packet);
		log_verbose(`SEND {${get_packet_name(packet_id)}} [{${packet_id}}] to {${socket.data.sck_id}} size {${format_file_size(packet.byteLength)}}`, PREFIX_WEBSOCKET);
	}
}

function send_string(packet_id: number, str: string, ws: PacketTarget|null = null, originator: ClientSocket|null = null, uid = 0) {
	send_packet(ws, packet_id, PACKET_TYPE.STRING, str, originator, uid);
}

function send_object(packet_id: number, obj: object | number, ws: PacketTarget|null = null, originator: ClientSocket|null = null, uid = 0) {
	send_packet(ws, packet_id, PACKET_TYPE.OBJECT, obj, originator, uid);
}

function send_binary( packet_id: number, data: ArrayBuffer, ws: PacketTarget|null = null, originator: ClientSocket|null = null, uid = 0) {
	send_packet(ws, packet_id, PACKET_TYPE.BINARY, data, originator, uid);
}

function send_empty(packet_id: number, ws: PacketTarget|null = null, originator: ClientSocket|null = null, uid = 0) {
	send_packet(ws, packet_id, PACKET_TYPE.NONE, null, originator, uid);
}

function get_listening_clients(packet_id: number) {
	const listeners = socket_packet_listeners.get(packet_id);
	if (listeners && listeners.length > 0)
		return listeners;

	return ARRAY_EMPTY;
}

function get_all_clients() {
	return socket_clients;
}

function generate_socket_id() {
	if (next_client_id === Number.MAX_SAFE_INTEGER)
		next_client_id = 1;

	return 'SCK-' + (next_client_id++);
}

async function handle_packet(ws: ClientSocket, packet_id: number, packet_data: any, packet_type: number, uid: number) {
	if (packet_id === PACKET.REQ_REGISTER) {
		const packets = validate_typed_array<number>(packet_data?.packets, TYPE_NUMBER, 'packets');
		register_packet_listener(ws, packets);
	} else if (packet_id === PACKET.REQ_UNREGISTER) {
		const packet_id = validate_number(packet_data?.packet_id, 'packet_id');
		unregister_packet_listener(ws, packet_id);
	} else if (packet_id === PACKET.REQ_SAVE_PROJECT) {
		try {
			const project_type = validate_string(packet_data?.project_type, 'project_type');
			const project_state = validate_object(packet_data?.state, 'state');
			let project_id = packet_data?.id ?? null;

			if (typeof project_id !== TYPE_STRING)
				project_id = Bun.randomUUIDv7();

			const file_path = get_project_state_file(project_id);
			const bytes = await Bun.write(file_path, JSON.stringify(project_state, null, CHAR_TAB));

			const project_name = project_state.name ?? 'Unknown Project';
			await update_project_index(project_id, project_type, project_name);

			log_info(`Saved project {${project_id}} ({${project_name}}) with {${format_file_size(bytes)}}`);

			send_object(PACKET.ACK_SAVE_PROJECT, {
				id: project_id,
				success: true
			}, ws);
		} catch (e) {
			// this error is caught and re-thrown so we can inform the client here to prevent potential data-loss
			// other operations can simply fail to respond, but saving needs extra safety guarantees
			send_object(PACKET.ACK_SAVE_PROJECT, { success: false }, ws);
			throw e;
		}
	} else if (packet_id === PACKET.REQ_LOAD_PROJECT) {
		const project_id = validate_string(packet_data?.id, 'id');
		const project_file = Bun.file(get_project_state_file(project_id));
		
		try {
			const project_state = await project_file.json();
			send_object(PACKET.ACK_LOAD_PROJECT, { success: true, state: project_state }, ws);
		} catch (e) {
			send_object(PACKET.ACK_LOAD_PROJECT, { success: false }, ws);
			throw e;
		}
	} else if (packet_id === PACKET.REQ_DELETE_PROJECT) {
		const project_id = validate_string(packet_data?.id, 'id');
		const project_file_path = get_project_state_file(project_id);

		await node_fs.unlink(project_file_path);
		await delete_project_index_entry(project_id);

		send_empty(PACKET.ACK_DELETE_PROJECT, ws);
	} else if (packet_id === PACKET.REQ_PROJECT_LIST) {
		const project_type = validate_string(packet_data?.project_type, 'project_type');
		const index = await load_project_index();
		const project_list = [];

		for (const [id, value] of Object.entries(index)) {
			const entry = value as Record<string, any>;

			if (entry.type === project_type)
				project_list.push({ id, name: entry.name, last_saved: entry.last_saved });
		}

		send_object(PACKET.ACK_PROJECT_LIST, { projects: project_list });
	} else if (packet_id === PACKET.REQ_SERVER_ADDR) {
		send_string(PACKET.ACK_SERVER_ADDR, get_local_ipv4(), ws);
	} else if (packet_id === PACKET.SET_SYSTEM_VOLUME) {
		validate_number(packet_data, 'object');
		set_system_volume(packet_data);
	} else if (packet_id === PACKET.REQ_CLIENT_COUNT) {
		send_object(PACKET.INFO_CLIENT_COUNT, socket_clients.size);
	} else if (packet_id === PACKET.OBS_SET_SCENE) {
		validate_string(packet_data.scene_uuid, 'scene_uuid');
		validate_string(packet_data.int_uuid, 'int_uuid');

		const integration = get_integration_by_uuid(packet_data.int_uuid);
		if (integration)
			obs_set_scene(integration, packet_data.scene_uuid);
	} else if (packet_id == PACKET.OBS_SET_SCENE_BY_NAME) {
		validate_string(packet_data.scene_name, 'scene_name');
		validate_string(packet_data.int_uuid, 'int_uuid');

		const integration = get_integration_by_uuid(packet_data.int_uuid);
		if (integration)
			obs_set_scene_by_name(integration, packet_data.scene_name);
	} else if (packet_id === PACKET.REQ_OBS_SCENE_NAME) {
		validate_string(packet_data.int_uuid, 'int_uuid');

		const integration = get_integration_by_uuid(packet_data.int_uuid);
		if (!integration)
			return;

		// TODO: refactor, we need to return an integration UUID

		const res = await obs_request(integration, OBS_REQUEST.GET_CURRENT_PROGRAM_SCENE);
		send_object(PACKET.OBS_SCENE_NAME, res?.sceneName ?? 'No Scene');
	} else if (packet_id === PACKET.OBS_MEDIA_SEEK) {
		validate_number(packet_data.time, 'time');
		validate_string(packet_data.obs_scene, 'obs_scene');

		// TODO: refactor

		/*if (is_active_obs_scene(packet_data.obs_scene)) {
			await obs_send_batch_for_scene_items(OBS_REQUEST.SET_MEDIA_INPUT_CURSOR, {
				mediaCursor: packet_data.time
			});
		}*/
	} else if (packet_id === PACKET.PLAYBACK_STATE) {
		validate_number(packet_data.state, 'state');
		validate_string(packet_data.obs_scene, 'obs_scene');

		// TODO: refactor

		/*if (is_active_obs_scene(packet_data.obs_scene)) {
			await obs_send_batch_for_scene_items(OBS_REQUEST.TRIGGER_MEDIA_INPUT_ACTION, {
				mediaAction: packet_data.state ? OBS_MEDIA_INPUT_ACTION.PLAY : OBS_MEDIA_INPUT_ACTION.PAUSE
			});
		}*/
	} else if (packet_id === PACKET.OBS_MEDIA_RESTART) {
		validate_string(packet_data.obs_scene, 'obs_scene');

		// TODO: refactor

		/*
		if (is_active_obs_scene(packet_data.obs_scene)) {
			await obs_send_batch_for_scene_items(OBS_REQUEST.TRIGGER_MEDIA_INPUT_ACTION, {
				mediaAction: OBS_MEDIA_INPUT_ACTION.RESTART
			});
		}*/
	} else if (packet_id === PACKET.REQ_OBS_SCENE_LIST) {
		/*if (is_obs_connected()) {
			const res = await obs_request(OBS_REQUEST.GET_SCENE_LIST);
			send_object(PACKET.OBS_SCENE_LIST, res?.scenes ?? ARRAY_EMPTY);
		}*/
	} else if (packet_id === PACKET.ETC_SEND_COMMAND) {
		validate_string(packet_data.command, 'command');
		validate_string(packet_data.int_uuid, 'int_uuid');

		const args = Array.isArray(packet_data.args) ? packet_data.args : ARRAY_EMPTY;

		etc_send_command(packet_data.int_uuid, packet_data.command, ...args);
	} else if (packet_id === PACKET.UPDATE_INTEGRATIONS) {
		validate_typed_array(packet_data.integrations, 'object', 'integrations');

		for (const integration of packet_data.integrations) {
			const active = active_integrations.get(integration.id);

			if (integration.enabled) {
				if (active) {
					send_integration_status(active);
				} else {
					active_integrations.set(integration.id, integration);
					integration.connection = {
						socket: null,
						reconnect_timer: null,
						connected: false
					};

					log_info(`Integration {${integration.id}} [{${INTEGRATION_LABELS[integration.type]}}] enabled`);

					if (integration.type == INTEGRATION_TYPE.OBS)
						obs_connect(integration);
					else if (integration.type == INTEGRATION_TYPE.ETC)
						etc_connect(integration);
				}
			} else if (!integration.enabled && active) {
				if (integration.type == INTEGRATION_TYPE.OBS)
					obs_disconnect(active);
				else if (integration.type == INTEGRATION_TYPE.ETC)
					etc_disconnect(active);

				active_integrations.delete(integration.id);
				
				log_info(`Integration {${integration.id}} [{${INTEGRATION_LABELS[integration.type]}}] disabled`);
			}
		}
	} else {
		// dispatch all other packets to listeners
		const listeners = get_listening_clients(packet_id);
		if (packet_type === PACKET_TYPE.NONE)
			send_empty(packet_id, listeners, ws);
		else if (packet_type === PACKET_TYPE.BINARY)
			send_binary(packet_id, packet_data, listeners, ws);
		else if (packet_type === PACKET_TYPE.STRING)
			send_string(packet_id, packet_data, listeners, ws);
		else if (packet_type === PACKET_TYPE.OBJECT)
			send_object(packet_id, packet_data, listeners, ws);
	}
}

// MARK: :websocket
const websocket_handlers: WebSocketHandler<ClientSocketData> = {
	async message(ws: ClientSocket, message: string|Buffer) {
		let packet_name = PACKET_UNK;
		let packet_id = 0;

		try {
			if (!(message instanceof ArrayBuffer))
				throw new Error('Socket sent non-binary payload');

			const [packet, packet_type, uid] = parse_packet(message) as [Packet, number, number];
			packet_id = packet.id;
			packet_name = get_packet_name(packet_id);

			if (packet_name === PACKET_UNK)
				throw new Error('Unknown packet ID ' + packet_id);

			log_verbose(`RECV {${packet_name}} [{${packet_id}}] from {${ws.data.sck_id}} (uid {${uid}}) size {${format_file_size(message.byteLength)}}`, PREFIX_WEBSOCKET);
			await handle_packet(ws, packet_id, packet.data, packet_type, uid);
		} catch (e) {
			const err = e as Error;
			log_warn(`${err.name} processing ${packet_name} [${packet_id}] from ${ws.data.sck_id}: ${err.message}`);
		}
	},
	
	open(ws: ClientSocket) {
		ws.data = { sck_id: generate_socket_id() };
		ws.binaryType = 'arraybuffer';
		log_info(`socket {${ws.data.sck_id}} connected from {${ws.remoteAddress}}`, PREFIX_WEBSOCKET);
		socket_clients.add(ws);
		send_object(PACKET.INFO_CLIENT_COUNT, socket_clients.size);
	},

	close(ws: ClientSocket, code: number, reason: string) {
		log_info(`socket {${ws.data.sck_id}} disconnected {${code}} {${reason}}`, PREFIX_WEBSOCKET);
		socket_clients.delete(ws);
		remove_listeners(ws);
		send_object(PACKET.INFO_CLIENT_COUNT, socket_clients.size);
	}
}

// MARK: :http

/** Returns a plain-text Response object for the given HTTP code. */
function http_response(status: number): Response {
	return new Response(node_http.STATUS_CODES[status], { status });
}

/** Handles an error within the HTTP sserver. */
function http_error_handler(error: Error): Response {
	log_warn(`Unhandled ${error.name} in http_request_handler (${error.message})`);
	return http_response(500);
}

/** Handles an incoming Request and returns a Response. */
async function http_request_handler(req: Request): Promise<Response|undefined> {
	const url = new URL(req.url);
	let pathname = url.pathname;

	if (pathname === '/api/pipe') {
		server.upgrade(req);
		return;
	}

	if (node_path.extname(pathname) === '')
		pathname += '.html';

	const file_path = node_path.join(HTTP_SERVE_DIRECTORY, pathname);

	const file = Bun.file(file_path);
	if (!await file.exists()) {
		log_warn('Requested HTTP resource not found: ' + pathname);
		return http_response(404); // Not Found
	}

	// range requests for streamed content
	const range_header = req.headers.get('range');
	if (range_header !== null) {
		const match = range_header.match(/bytes=(\d*)-(\d*)/);

		if (match !== null) {
			const start = parseInt(match[1], 10);
			const end = match[2] ? parseInt(match[2], 10) : Math.min(start + PARTIAL_DEFAULT_CHUNK, file.size - 1);
			const chunk_size = (end - start) + 1;

			log_verbose(`{206} Partial Content {${pathname}} ({${start}}-{${end}}/{${file.size}}) {${format_file_size(chunk_size)}}`, PREFIX_HTTP);

			return new Response(file.slice(start, end + 1), { status: 206, headers: {
				'Content-Range': `bytes ${start}-${end}/${file.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': chunk_size.toString(),
				'Content-Type': file.type
			}});
		}
	}

	log_verbose(`{200} OK {${pathname}}`, PREFIX_HTTP);
	return new Response(file, { status: 200 });
}

// MARK: :assert
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

// MARK: :general
function print_service_links(...paths: string[]) {
	let longest_length = 0;
	for (const path of paths)
		longest_length = Math.max(longest_length, path.length);

	log_info('Service links:');
	for (const path of paths)
		log_info(`    {${path.padStart(longest_length, ' ')}} :: {http://localhost:${server.port}/${path}}`);
}

/** Returns file size as a human-readable string. Supports up to megabytes. */
function format_file_size(size: number): string {
	if (size < 1024)
		return `${size}b`;

	if (size < 1048576)
		return `${(size / 1024).toFixed(1)}kb`;

	return `${(size / 1048576).toFixed(1)}mb`;
 }

 function get_project_state_file(project_id: string): string {
	return node_path.join(PROJECT_STATE_DIRECTORY, project_id + PROJECT_STATE_EXT);
 }

 function get_local_ipv4(): string {
	const interfaces = node_os.networkInterfaces();
	for (const interface_name in interfaces) {
		const interface_info = interfaces[interface_name];
		const ipv4 = interface_info?.find(info => info.family === 'IPv4' && !info.internal && !info.address.startsWith('127.'));

		if (ipv4)
			return ipv4.address;
	}
	return 'IPv4 Unknown';
 }

// MARK: :init
// command line arguments
const args = process.argv.slice(2);

for (const arg of args) {
	let [key, value] = arg.split('=', 2) as [string, string];
	key = key.replace(/^-+/, '').toLowerCase();

	const default_value = CLI_ARGS[key];

	if (default_value === undefined) {
		log_warn(`Uknown command line argument ${key}`);
		continue;
	}

	if (value === undefined)
		value = 'true';

	const expected_value_type = typeof default_value;
	if (expected_value_type === 'number') {
		const float_value = parseFloat(value);

		if (!isNaN(float_value))
			CLI_ARGS[key] = float_value;
		else
			log_warn(`Invalid number value for command line argument ${key}`);
	} else if (expected_value_type === 'boolean') {
		CLI_ARGS[key] = !!value;
	} else {
		CLI_ARGS[key] = value;
	}
}

// server init
log_info(`KruLabs {v${package_json.version}} server initiated`);
log_info(`Web server running on port {${CLI_ARGS.port}}`);

if (CLI_ARGS.verbose)
	log_warn('Verbose logging enabled (--verbose)');

const server = Bun.serve({
	port: CLI_ARGS.port as number,
	development: false,
	fetch: http_request_handler,
	error: http_error_handler,
	websocket: websocket_handlers
});

print_service_links('controller', 'remote');

volmgr_init();