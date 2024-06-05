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

def operator_error(self, error_message):
    self.report({'ERROR'}, error_message)
    return {'CANCELLED'}

class KruLabsProperties(bpy.types.PropertyGroup):
	markers_bounded: bpy.props.BoolProperty(name='Within Bounds', default=True) # type: ignore
	markers_export_path: bpy.props.StringProperty( # type: ignore
		name='File',
		default='',
		subtype='FILE_PATH'
	)

class KruLabsMarkerPanel(bpy.types.Panel):
	bl_label = 'Markers'
	bl_idname = 'SEQUENCE_EDITOR_PT_colour_panel'
	bl_space_type = 'SEQUENCE_EDITOR'
	bl_region_type = 'UI'
	bl_category = 'KruLabs'

	def draw(self, context):
		layout = self.layout
		scene = context.scene

		layout.prop(scene.krulabs_properties, 'markers_relative_to_start_frame')
		layout.prop(scene.krulabs_properties, 'markers_export_path')
		layout.operator('sequencer.krulabs_export_markers', text='Export Markers')

class KruLabsTestOperator(bpy.types.Operator):
	bl_idname = 'sequencer.krulabs_export_markers'
	bl_label = 'KruLabs: Export Markers'

	def execute(self, context):
		scene = context.scene

		export_path = scene.krulabs_properties.markers_export_path
		is_bounded = scene.krulabs_properties.markers_bounded

		if len(export_path) == 0:
			return operator_error(self, 'No valid export path entered')

		if not export_path.lower().endswith('.json'):
			export_path += '.json'

		frame_start = scene.frame_start
		frame_end = scene.frame_end
		fps = scene.render.fps

		markers = []

		for marker in scene.timeline_markers:
			if is_bounded and (marker.frame < frame_start or marker.frame > frame_end):
				continue

			marker_position = marker.frame
			if is_bounded:
				marker_position = marker_position - frame_start

			markers.append({
				'label': marker.name,
				'position_ms': (marker.frame * 1000) / fps
			})

		data = {
			'markers': markers
		}

		with open(export_path, 'w') as file:
			json.dump(data, file, indent=4)

		return {'FINISHED'}

classes = (
	KruLabsProperties,
	KruLabsMarkerPanel,
	KruLabsTestOperator
)

def register():
	for cls in classes:
		bpy.utils.register_class(cls)

	bpy.types.Scene.krulabs_properties = bpy.props.PointerProperty(type=KruLabsProperties)

def unregister():
	for cls in reversed(classes):
		bpy.utils.unregister_class(cls)

	del bpy.types.Scene.krulabs_properties

if __name__ == '__main__':
	register()
