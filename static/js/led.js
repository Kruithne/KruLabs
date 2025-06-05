import { EventsSocket } from './events.js';

const fixture_name = location.pathname.split('/').pop();
document.title += ' :: ' + fixture_name;

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');

let color = { r: 1.0, g: 0.0, b: 0.0 };
let grid_size_x = 5;
let grid_size_y = 5;
let cell_size = 0.4;
let wave_color_1 = { r: 1.0, g: 0.0, b: 0.0 };
let wave_color_2 = { r: 0.0, g: 1.0, b: 0.0 };
let wave_rotation = 0.0;
let wave_speed = 1.0;
let wave_sharp = false;
let start_time = performance.now();

let fade_level = 1.0;
let fade_start_time = 0;
let fade_start_level = 1.0;
let fade_target_level = 1.0;
let fade_duration = 0;
let is_fading = false;

const vertex_shader_source = `
	attribute vec2 a_position;
	varying vec2 v_uv;
	
	void main() {
		gl_Position = vec4(a_position, 0.0, 1.0);
		v_uv = (a_position + 1.0) * 0.5;
	}
`;

const solid_fragment_shader = `
	precision mediump float;
	
	uniform vec3 u_color;
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		gl_FragColor = vec4(u_color * circle * u_fade, 1.0);
	}
`;

const wave_fragment_shader = `
	precision mediump float;
	
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform vec3 u_wave_color_1;
	uniform vec3 u_wave_color_2;
	uniform float u_wave_rotation;
	uniform float u_time;
	uniform float u_wave_speed;
	uniform bool u_wave_sharp;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		vec2 grid_id = floor(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 led_center = (grid_id + 0.5) / vec2(u_grid_x, u_grid_y);
		
		float cos_rot = cos(radians(u_wave_rotation));
		float sin_rot = sin(radians(u_wave_rotation));
		
		vec2 rotated_center = vec2(
			led_center.x * cos_rot - led_center.y * sin_rot,
			led_center.x * sin_rot + led_center.y * cos_rot
		);
		
		float wave_offset = rotated_center.x + u_time * u_wave_speed * 0.01;
		float wave_value = sin(wave_offset * 6.28318) * 0.5 + 0.5;
		
		if (u_wave_sharp) {
			wave_value = step(0.5, wave_value);
		}
		
		vec3 final_color = mix(u_wave_color_1, u_wave_color_2, wave_value);
		
		gl_FragColor = vec4(final_color * circle * u_fade, 1.0);
	}
`;

const create_shader = (type, source) => {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error('Shader compile error:', gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	
	return shader;
};

const create_program = (fragment_source) => {
	const vertex_shader = create_shader(gl.VERTEX_SHADER, vertex_shader_source);
	const fragment_shader = create_shader(gl.FRAGMENT_SHADER, fragment_source);
	
	const program = gl.createProgram();
	gl.attachShader(program, vertex_shader);
	gl.attachShader(program, fragment_shader);
	gl.linkProgram(program);
	
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error('Program link error:', gl.getProgramInfoLog(program));
		return null;
	}
	
	return program;
};

const solid_program = create_program(solid_fragment_shader);
const wave_program = create_program(wave_fragment_shader);

let current_mode = 'solid';
let current_program = solid_program;

const get_uniform_locations = (program, uniforms) => {
	const locations = {};
	uniforms.forEach(name => {
		locations[name] = gl.getUniformLocation(program, name);
	});
	return locations;
};

const solid_uniforms = get_uniform_locations(solid_program, [
	'u_color', 'u_grid_x', 'u_grid_y', 'u_fade', 'u_cell_size'
]);

const wave_uniforms = get_uniform_locations(wave_program, [
	'u_grid_x', 'u_grid_y', 'u_wave_color_1', 'u_wave_color_2', 
	'u_wave_rotation', 'u_time', 'u_wave_speed', 'u_wave_sharp', 'u_fade', 'u_cell_size'
]);

const get_position_attribute = (program) => {
	return gl.getAttribLocation(program, 'a_position');
};

const vertices = new Float32Array([
	-1, -1,
	 1, -1,
	-1,  1,
	 1,  1
]);

const vertex_buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

const resize_canvas = () => {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	gl.viewport(0, 0, canvas.width, canvas.height);
};

const update_fade = () => {
	if (is_fading) {
		const elapsed = performance.now() - fade_start_time;
		const progress = Math.min(elapsed / fade_duration, 1.0);
		
		fade_level = fade_start_level + (fade_target_level - fade_start_level) * progress;
		
		if (progress >= 1.0) {
			is_fading = false;
			fade_level = fade_target_level;
		}
	}
};

const render = () => {
	update_fade();
	
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	gl.useProgram(current_program);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
	const position_attribute = get_position_attribute(current_program);
	gl.enableVertexAttribArray(position_attribute);
	gl.vertexAttribPointer(position_attribute, 2, gl.FLOAT, false, 0, 0);
	
	if (current_mode === 'solid') {
		gl.uniform3f(solid_uniforms.u_color, color.r, color.g, color.b);
		gl.uniform1f(solid_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(solid_uniforms.u_grid_y, grid_size_y);
		gl.uniform1f(solid_uniforms.u_fade, fade_level);
		gl.uniform1f(solid_uniforms.u_cell_size, cell_size);
	} else if (current_mode === 'wave') {
		gl.uniform1f(wave_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(wave_uniforms.u_grid_y, grid_size_y);
		gl.uniform3f(wave_uniforms.u_wave_color_1, wave_color_1.r, wave_color_1.g, wave_color_1.b);
		gl.uniform3f(wave_uniforms.u_wave_color_2, wave_color_2.r, wave_color_2.g, wave_color_2.b);
		gl.uniform1f(wave_uniforms.u_wave_rotation, wave_rotation);
		gl.uniform1f(wave_uniforms.u_time, (performance.now() - start_time) / 1000.0);
		gl.uniform1f(wave_uniforms.u_wave_speed, wave_speed);
		gl.uniform1i(wave_uniforms.u_wave_sharp, wave_sharp);
		gl.uniform1f(wave_uniforms.u_fade, fade_level);
		gl.uniform1f(wave_uniforms.u_cell_size, cell_size);
	}
	
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
};

const animate = () => {
	render();
	requestAnimationFrame(animate);
};

resize_canvas();
window.addEventListener('resize', resize_canvas);
animate();

const events = new EventsSocket();

events.subscribe('connected', () => {
	events.subscribe('led:update#' + fixture_name, data => {
		switch (data.action) {
			case 'color':
				current_mode = 'solid';
				current_program = solid_program;
				color.r = data.color.r / 255;
				color.g = data.color.g / 255;
				color.b = data.color.b / 255;
				break;

			case 'layout':
				grid_size_x = data.size_x;
				grid_size_y = data.size_y;
				if (data.cell_size !== undefined) {
					cell_size = data.cell_size;
				}
				break;

			case 'wave':
				current_mode = 'wave';
				current_program = wave_program;
				wave_color_1.r = data.color_1.r / 255;
				wave_color_1.g = data.color_1.g / 255;
				wave_color_1.b = data.color_1.b / 255;
				wave_color_2.r = data.color_2.r / 255;
				wave_color_2.g = data.color_2.g / 255;
				wave_color_2.b = data.color_2.b / 255;
				wave_rotation = data.rotation || 0;
				wave_speed = data.speed || 1.0;
				wave_sharp = data.sharp || false;
				start_time = performance.now();
				break;

			case 'fade_out':
				fade_start_time = performance.now();
				fade_start_level = fade_level;
				fade_target_level = 0.0;
				fade_duration = data.time || 1000;
				is_fading = true;
				break;

			case 'fade_in':
				fade_start_time = performance.now();
				fade_start_level = fade_level;
				fade_target_level = 1.0;
				fade_duration = data.time || 1000;
				is_fading = true;
				break;
		}
	});

	events.publish('led:layout', { name: fixture_name });
});