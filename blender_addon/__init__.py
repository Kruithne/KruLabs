bl_info = {
	'name': 'KruLabs',
	'author': 'Kruithne',
	'version': (1, 0),
	'blender': (4, 0, 0),
	'location': 'Sequencer > Sidebar > KruLabs',
	'description': 'Part of the KruLabs theatre automation software',
	'category': 'Sequencer',
}

import bpy # type: ignore
import os
import json
import sys
import threading
import queue

# Add the bundled libraries to the module search path.
sys.path.append(os.path.dirname(__file__))

from ws4py.client.threadedclient import WebSocketClient

WS_STATE_DISCONNECTED = 0
WS_STATE_CONNECTING = 1
WS_STATE_CONNECTED = 2
WS_STATE_FAILED = 3

STRIP_PROP_TYPE = 'KL_STRIP_TYPE'
MARKER_PROP_TYPE = 'KL_MARKER_TYPE'

ws_message_queue = queue.Queue()
ws_connection_state = WS_STATE_DISCONNECTED
ws_client = None

class WebSocketClientApp(WebSocketClient):
	def opened(self):
		global ws_connection_state
		ws_connection_state = WS_STATE_CONNECTED
		bpy.app.timers.register(ws_process_queue)
		
	def closed(self, code, reason=None):
		global ws_connection_state
		ws_connection_state = WS_STATE_DISCONNECTED

		if bpy.app.timers.is_registered(ws_process_queue):
			bpy.app.timers.unregister(ws_process_queue)
		
	def received_message(self, message):
		json_msg = json.loads(message.data.decode(message.encoding))
		ws_message_queue.put(json_msg)

	def connect(self):
		global ws_connection_state
		ws_connection_state = WS_STATE_CONNECTING

		try:
			super().connect()
		except Exception:
			ws_connection_state = WS_STATE_FAILED

def ws_connect(addr, port):
	global ws_client

	server_url = 'ws://' + addr + ':' + str(port) + '/pipe'

	ws_client = WebSocketClientApp(server_url)
	client_thread = threading.Thread(target=ws_client.connect)
	client_thread.daemon = True
	client_thread.start()

def ws_disconnect():
	global ws_client

	try:
		ws_client.close()
	except Exception:
		pass

	ws_client = None

def ws_process_queue():
	while not ws_message_queue.empty():
		message = ws_message_queue.get()
		op = message['op']
		
		if op == 'SMSG_DOWNLOAD_SCENES':
			process_downloaded_scenes(message['scenes'])
	
	return 0.1

def ws_connection_state_text():
	global ws_connection_state
	if ws_connection_state == WS_STATE_CONNECTED:
		return 'Connected'
	
	if ws_connection_state == WS_STATE_CONNECTING:
		return 'Connecting'
	
	if ws_connection_state == WS_STATE_FAILED:
		return 'Failed to Connect'
	
	return 'Disconnected'

def ws_send_packet(opcode, payload=None):
	global ws_connection_state

	if ws_connection_state != WS_STATE_CONNECTED:
		return
	
	base_payload = {'op': opcode}
	if payload:
		base_payload = {**base_payload, **payload}

	ws_client.send(json.dumps(base_payload))

def ws_is_connected():
	global ws_connection_state
	return ws_connection_state == WS_STATE_CONNECTED

def operator_error(self, error_message):
    self.report({'ERROR'}, error_message)
    return {'CANCELLED'}

def is_scene_strip(strip):
	if strip.type != 'COLOR':
		return False
	
	return STRIP_PROP_TYPE in strip and strip[STRIP_PROP_TYPE] == 'SCENE'

def is_cue_marker(marker):
	return MARKER_PROP_TYPE in marker and marker[MARKER_PROP_TYPE] == 'CUE'

def get_marker_prefix(marker):
	if marker.name[0].isdigit():
		return float(marker.name.split(' ')[0])
	
	return 0

def get_best_scene_channel():
	strips = bpy.context.scene.sequence_editor.sequences
	highest_channel = 1

	for strip in strips:
		if strip.channel > highest_channel:
			highest_channel = strip.channel

		if is_scene_strip(strip):
			return strip.channel
		
	return highest_channel

def create_scene(name, channel, start, duration=14400):
	scene = bpy.context.scene

	strip = scene.sequence_editor.sequences.new_effect(
		name=name,
		type='COLOR',
		channel=channel,
		frame_start=start,
		frame_end=start + duration
	)

	strip.name = name
	strip.frame_final_duration = duration
	strip.color = (1, 0.5625, 0)
	strip[STRIP_PROP_TYPE] = 'SCENE'

	return strip

def process_downloaded_scenes(scenes):
	scene = bpy.context.scene
	scene_channel = get_best_scene_channel()
	
	for strip in scene.sequence_editor.sequences:
		if is_scene_strip(strip):
			scene.sequence_editor.sequences.remove(strip)

	for new_scene in scenes:
		print(new_scene)
		create_scene(new_scene['name'], scene_channel, new_scene['frame_start'], new_scene['frame_final_duration'])

def apply_props(operator, properties):
    for key, value in properties.items():
        setattr(operator, key, value)

class KruLabsProperties(bpy.types.PropertyGroup):
	ws_server_addr: bpy.props.StringProperty(name='Server IP', default='127.0.0.1') # type: ignore
	ws_server_port: bpy.props.IntProperty(name='Server Port', default=19531, min=1024, max=65535) # type: ignore

class KruLabsServerPanel(bpy.types.Panel):
	bl_label = 'Master Server'
	bl_idname = 'SEQUENCE_EDITOR_PT_krulabs_server_panel'
	bl_space_type = 'SEQUENCE_EDITOR'
	bl_region_type = 'UI'
	bl_category = 'KruLabs'

	def draw(self, context):
		global ws_connection_state
		layout = self.layout

		properties = context.scene.krulabs_properties
		layout.prop(properties, 'ws_server_addr')
		layout.prop(properties, 'ws_server_port')

		row = layout.row()
		row.label(text = ws_connection_state_text())

		if ws_is_connected():
			row.operator(KruLabsDisconnectMasterServerOperator.bl_idname, text='Disconnect')
		else:
			row.operator(KruLabsConnectMasterServerOperator.bl_idname, text='Connect')

class KruLabsScenesPanel(bpy.types.Panel):
	bl_label = 'Scenes'
	bl_idname = 'SEQUENCE_EDITOR_PT_krulabs_scenes_panel'
	bl_space_type = 'SEQUENCE_EDITOR'
	bl_region_type = 'UI'
	bl_category = 'KruLabs'

	def draw(self, context):
		layout = self.layout
		layout.operator(KruLabsAddSceneOperator.bl_idname, text='Add Scene')

		row = layout.row()
		row.operator(KruLabsDownloadScenesOperator.bl_idname, text='Download')
		row.operator(KruLabsUploadScenesOperator.bl_idname, text='Upload')

class KruLabsMarkersPanel(bpy.types.Panel):
	bl_label = 'Markers'
	bl_idname = 'SEQUENCE_EDITOR_PT_krulabs_markers_panel'
	bl_space_type = 'SEQUENCE_EDITOR'
	bl_region_type = 'UI'
	bl_category = 'KruLabs'
	
	def draw(self, context):
		layout = self.layout

		row = layout.row()
		row.operator(KruLabsAddCueMarkerOperator.bl_idname, text='Add Cue')
		apply_props(row.operator(KruLabsDeleteMarkersOperator.bl_idname, text='Clear Scene'), {'marker_type': 'CUE', 'scene_only': True})
		row.operator(KruLabsDeleteMarkersOperator.bl_idname, text='Clear All').marker_type = 'CUE'

		layout.operator(KruLabsSelectSceneMarkersOperator.bl_idname, text='Select Scene Markers')

class KruLabsDebugPanel(bpy.types.Panel):
	bl_label = 'Debug'
	bl_idname = 'SEQUENCE_EDITOR_PT_krulabs_debug_panel'
	bl_space_type = 'SEQUENCE_EDITOR'
	bl_region_type = 'UI'
	bl_category = 'KruLabs'

	def draw(self, context):
		layout = self.layout
		layout.operator(KrulabsReloadAddonOperator.bl_idname, text='Reload Add-on')

class KruLabsAddSceneOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_add_scene'
	bl_label = 'KruLabs: Add Scene'

	scene_name: bpy.props.StringProperty(name = 'Scene Name') # type: ignore

	def execute(self, context):
		scene = context.scene
		create_scene(self.scene_name, get_best_scene_channel(), scene.frame_current)

		return {'FINISHED'}
	
	def invoke(self, context, window):
		return context.window_manager.invoke_props_dialog(self)
	
class KruLabsUploadScenesOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_upload_scenes'
	bl_label = 'KruLabs: Upload Scenes'

	def execute(self, context):
		if not ws_is_connected():
			return operator_error(self, 'Not connected to server')
		
		
		scene = context.scene
		scenes_arr = []

		fps = scene.render.fps

		for strip in scene.sequence_editor.sequences:
			if is_scene_strip(strip):
				start_frame = strip.frame_start
				end_frame = start_frame + strip.frame_final_duration

				markers = []
				for marker in scene.timeline_markers:
					if marker.frame >= start_frame and marker.frame <= end_frame:
						markers.append({
							'name': marker.name,
							'type': MARKER_PROP_TYPE in marker and marker[MARKER_PROP_TYPE] or 'UNKNOWN',
							'position': (marker.frame - start_frame) * (1000 / fps)
						})

				scenes_arr.append({
					'name': strip.name,
					'frame_start': start_frame,
					'frame_final_duration': strip.frame_final_duration,
					'markers': markers
				})

		ws_send_packet('CMSG_UPLOAD_SCENES', {
			'scenes': scenes_arr
		})

		return {'FINISHED'}
	
class KruLabsDownloadScenesOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_download_scenes'
	bl_label = 'KruLabs: Download Scenes'

	def execute(self, context):
		if not ws_is_connected():
			return operator_error(self, 'Not connected to server')
		
		ws_send_packet('CMSG_DOWNLOAD_SCENES')
		return {'FINISHED'}
	
class KruLabsAddCueMarkerOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_add_cue_marker'
	bl_label = 'KruLabs: Add Cue Marker'

	auto_prefix: bpy.props.BoolProperty(name = 'Auto Prefix', default=True) # type: ignore
	marker_name: bpy.props.StringProperty(name = 'Cue Name') # type: ignore

	def execute(self, context):
		scene = context.scene

		marker_name = 'CUE ' + self.marker_name
		timeline_markers = scene.timeline_markers

		current_frame = scene.frame_current

		if self.auto_prefix:
			last_cue = None

			for marker in timeline_markers:
				marker.select = False
				if marker.frame < current_frame and (last_cue is None or last_cue.frame < marker.frame) and is_cue_marker(marker):
					last_cue = marker

			marker_prefix = 1.0
			if last_cue:
				marker_prefix = round(get_marker_prefix(last_cue)) + 1.0
			
			marker_name = str(marker_prefix) + ' ' + marker_name

		marker = timeline_markers.new(marker_name, frame=scene.frame_current)
		marker[MARKER_PROP_TYPE] = 'CUE'
		marker.select = True

		return {'FINISHED'}
		
	def invoke(self, context, window):
		return context.window_manager.invoke_props_dialog(self)

class KruLabsDeleteMarkersOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_delete_markers'
	bl_label = 'KruLabs: Delete Markers'
	bl_description = 'Delete markers from the timeline'

	marker_type: bpy.props.StringProperty(name='Marker Type') # type: ignore
	scene_only: bpy.props.BoolProperty(name='Scene Only', default=False) # type: ignore

	def execute(self, context):
		scene = context.scene
		timeline_markers = context.scene.timeline_markers
		filtered_markers = [marker for marker in timeline_markers if MARKER_PROP_TYPE in marker and marker[MARKER_PROP_TYPE] == self.marker_type]

		if self.scene_only:
			for strip in scene.sequence_editor.sequences:
				if is_scene_strip(strip) and strip.select:
					start_frame = strip.frame_start
					end_frame = strip.frame_start + strip.frame_final_duration

					for marker in filtered_markers:
						if marker.frame >= start_frame and marker.frame <= end_frame:
							timeline_markers.remove(marker)
		else:
			for marker in filtered_markers:
				timeline_markers.remove(marker)

		return {'FINISHED'}
	
class KruLabsSelectSceneMarkersOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_select_scene_markers'
	bl_label = 'KruLabs: Select Scene Markers'
	bl_description = 'Select markers for the selected scenes'

	def execute(self, context):
		scene = context.scene

		for marker in scene.timeline_markers:
			marker.select = False

		for strip in scene.sequence_editor.sequences:
			if is_scene_strip(strip) and strip.select:
				start_frame = strip.frame_start
				end_frame = start_frame + strip.frame_final_duration

				for marker in scene.timeline_markers:
					if marker.frame >= start_frame and marker.frame <= end_frame:
						marker.select = True

		return {'FINISHED'}

class KruLabsConnectMasterServerOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_connect_master_server'
	bl_label = 'KruLabs: Connect to Master Server'
	bl_description = 'Connect to the master server'

	def execute(self, context):
		properties = context.scene.krulabs_properties
		ws_disconnect()
		ws_connect(properties.ws_server_addr, properties.ws_server_port)
		return {'FINISHED'}

class KruLabsDisconnectMasterServerOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_disconnect_master_server'
	bl_label = 'KruLabs: Disconnect Master Server'
	bl_description = 'Disconnect from the master server'

	def execute(self, context):
		ws_disconnect()
		return {'FINISHED'}
	
class KrulabsReloadAddonOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_reload_addon'
	bl_label = 'KruLabs: Reload Add-on'
	bl_description = 'Reload the KruLabs add-on'

	def execute(self, context):
		bpy.ops.preferences.addon_disable(module="krulabs")
		bpy.ops.preferences.addon_enable(module="krulabs")
		return {'FINISHED'}

classes = (
	KruLabsProperties,

	# Panels
	KruLabsServerPanel,
	KruLabsScenesPanel,
	KruLabsMarkersPanel,
	KruLabsDebugPanel,

	# Scene Operators
	KruLabsAddSceneOperator,
	KruLabsUploadScenesOperator,
	KruLabsDownloadScenesOperator,
	
	# Server Operators
	KruLabsConnectMasterServerOperator,
	KruLabsDisconnectMasterServerOperator,

	# Markers Operators
	KruLabsAddCueMarkerOperator,
	KruLabsDeleteMarkersOperator,
	KruLabsSelectSceneMarkersOperator,

	# Debug Operators
	KrulabsReloadAddonOperator,
)

def register():
	for cls in classes:
		bpy.utils.register_class(cls)

	bpy.types.Scene.krulabs_properties = bpy.props.PointerProperty(type=KruLabsProperties)

def unregister():
	ws_disconnect() # todo: clone this to a manual operation

	for cls in reversed(classes):
		bpy.utils.unregister_class(cls)

	del bpy.types.Scene.krulabs_properties

if __name__ == '__main__':
	register()
