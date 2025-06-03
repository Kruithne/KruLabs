import { EventsSocket } from './events.js';

const fixture_name = location.pathname.split('/').pop();
document.title += ' :: ' + fixture_name;

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');

let color = { r: 1.0, g: 0.0, b: 0.0 };
let grid_size_x = 5;
let grid_size_y = 5;
let wave_active = false;
let wave_color_1 = { r: 1.0, g: 0.0, b: 0.0 };
let wave_color_2 = { r: 0.0, g: 1.0, b: 0.0 };
let wave_rotation = 0.0;
let wave_speed = 1.0;
let wave_sharp = false;
let start_time = performance.now();

const vertex_shader_source = `
	attribute vec2 a_position;
	varying vec2 v_uv;
	
	void main() {
		gl_Position = vec4(a_position, 0.0, 1.0);
		v_uv = (a_position + 1.0) * 0.5;
	}
`;

const fragment_shader_source = `
	precision mediump float;
	
	uniform vec3 u_color;
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform bool u_wave_active;
	uniform vec3 u_wave_color_1;
	uniform vec3 u_wave_color_2;
	uniform float u_wave_rotation;
	uniform float u_time;
	uniform float u_wave_speed;
	uniform bool u_wave_sharp;
	varying vec2 v_uv;
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, 0.4);
		
		vec2 grid_id = floor(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 led_center = (grid_id + 0.5) / vec2(u_grid_x, u_grid_y);
		
		vec3 final_color = u_color;
		
		if (u_wave_active) {
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
			
			final_color = mix(u_wave_color_1, u_wave_color_2, wave_value);
		}
		
		gl_FragColor = vec4(final_color * circle, 1.0);
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

const create_program = () => {
	const vertex_shader = create_shader(gl.VERTEX_SHADER, vertex_shader_source);
	const fragment_shader = create_shader(gl.FRAGMENT_SHADER, fragment_shader_source);
	
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

const program = create_program();
const position_attribute = gl.getAttribLocation(program, 'a_position');
const color_uniform = gl.getUniformLocation(program, 'u_color');
const grid_x_uniform = gl.getUniformLocation(program, 'u_grid_x');
const grid_y_uniform = gl.getUniformLocation(program, 'u_grid_y');
const wave_active_uniform = gl.getUniformLocation(program, 'u_wave_active');
const wave_color_1_uniform = gl.getUniformLocation(program, 'u_wave_color_1');
const wave_color_2_uniform = gl.getUniformLocation(program, 'u_wave_color_2');
const wave_rotation_uniform = gl.getUniformLocation(program, 'u_wave_rotation');
const time_uniform = gl.getUniformLocation(program, 'u_time');
const wave_speed_uniform = gl.getUniformLocation(program, 'u_wave_speed');
const wave_sharp_uniform = gl.getUniformLocation(program, 'u_wave_sharp');

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

const render = () => {
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	gl.useProgram(program);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
	gl.enableVertexAttribArray(position_attribute);
	gl.vertexAttribPointer(position_attribute, 2, gl.FLOAT, false, 0, 0);
	
	gl.uniform3f(color_uniform, color.r, color.g, color.b);
	gl.uniform1f(grid_x_uniform, grid_size_x);
	gl.uniform1f(grid_y_uniform, grid_size_y);
	gl.uniform1i(wave_active_uniform, wave_active);
	gl.uniform3f(wave_color_1_uniform, wave_color_1.r, wave_color_1.g, wave_color_1.b);
	gl.uniform3f(wave_color_2_uniform, wave_color_2.r, wave_color_2.g, wave_color_2.b);
	gl.uniform1f(wave_rotation_uniform, wave_rotation);
	gl.uniform1f(time_uniform, (performance.now() - start_time) / 1000.0);
	gl.uniform1f(wave_speed_uniform, wave_speed);
	gl.uniform1i(wave_sharp_uniform, wave_sharp);
	
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
				wave_active = false;
				color.r = data.color.r / 255;
				color.g = data.color.g / 255;
				color.b = data.color.b / 255;
				break;

			case 'layout':
				grid_size_x = data.size_x;
				grid_size_y = data.size_y;
				break;

			case 'wave':
				wave_active = true;
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
		}
	});

	events.publish('led:layout', { name: fixture_name });
});