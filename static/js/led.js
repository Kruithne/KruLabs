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

let chase_colors = [
	{ r: 1.0, g: 0.0, b: 0.0 },
	{ r: 0.0, g: 1.0, b: 0.0 },
	{ r: 0.0, g: 0.0, b: 1.0 },
	{ r: 1.0, g: 1.0, b: 0.0 }
];
let chase_count = 2;
let chase_duration = 1000;
let chase_smooth = false;
let chase_start_time = performance.now();

let swirl_color_1 = { r: 1.0, g: 0.0, b: 0.0 };
let swirl_color_2 = { r: 0.0, g: 1.0, b: 0.0 };
let swirl_threshold = 0.5;
let swirl_speed = 1.0;
let swirl_factor = 0.0;
let swirl_clockwise = true;
let swirl_start_time = performance.now();

let voronoi_color_1 = { r: 1.0, g: 0.0, b: 0.0 };
let voronoi_color_2 = { r: 0.0, g: 1.0, b: 0.0 };
let voronoi_direction_x = 1.0;
let voronoi_direction_y = 0.0;
let voronoi_speed = 1.0;
let voronoi_threshold = 0.5;
let voronoi_distance_mode = 0; // 0=euclidean, 1=manhattan, 2=chebyshev, 3=minkowski
let voronoi_start_time = performance.now();

let rings_color_1 = { r: 1.0, g: 0.0, b: 0.0 };
let rings_color_2 = { r: 0.0, g: 1.0, b: 0.0 };
let rings_speed = 1.0;
let rings_direction = true; // true = outward, false = inward
let rings_threshold = 0.5;
let rings_start_time = performance.now();

let rain_color_1 = { r: 1.0, g: 0.0, b: 0.0 };
let rain_color_2 = { r: 0.0, g: 1.0, b: 0.0 };
let rain_speed = 1.0;
let rain_direction_x = 0.0;
let rain_direction_y = 1.0; // Default Y+ (down)
let rain_columns = 3;
let rain_start_time = performance.now();

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

const chase_fragment_shader = `
	precision mediump float;
	
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform vec3 u_chase_color_1;
	uniform vec3 u_chase_color_2;
	uniform vec3 u_chase_color_3;
	uniform vec3 u_chase_color_4;
	uniform float u_chase_time;
	uniform float u_chase_duration;
	uniform bool u_chase_smooth;
	uniform int u_chase_count;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		float cycle_time = mod(u_chase_time, u_chase_duration * float(u_chase_count));
		float color_index = cycle_time / u_chase_duration;
		
		vec3 final_color = u_chase_color_1;
		
		if (u_chase_smooth) {
			float index_fract = fract(color_index);
			int current_index = int(color_index);
			int next_index = current_index + 1;
			if (next_index >= u_chase_count) next_index = 0;
			
			vec3 current_color = u_chase_color_1;
			vec3 next_color = u_chase_color_1;
			
			if (current_index == 0) current_color = u_chase_color_1;
			else if (current_index == 1) current_color = u_chase_color_2;
			else if (current_index == 2) current_color = u_chase_color_3;
			else if (current_index == 3) current_color = u_chase_color_4;
			
			if (next_index == 0) next_color = u_chase_color_1;
			else if (next_index == 1) next_color = u_chase_color_2;
			else if (next_index == 2) next_color = u_chase_color_3;
			else if (next_index == 3) next_color = u_chase_color_4;
			
			final_color = mix(current_color, next_color, index_fract);
		} else {
			int current_index = int(color_index);
			if (current_index == 0) final_color = u_chase_color_1;
			else if (current_index == 1) final_color = u_chase_color_2;
			else if (current_index == 2) final_color = u_chase_color_3;
			else if (current_index == 3) final_color = u_chase_color_4;
		}
		
		gl_FragColor = vec4(final_color * circle * u_fade, 1.0);
	}
`;

const swirl_fragment_shader = `
	precision mediump float;
	
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform vec3 u_swirl_color_1;
	uniform vec3 u_swirl_color_2;
	uniform float u_swirl_threshold;
	uniform float u_swirl_speed;
	uniform float u_swirl_factor;
	uniform bool u_swirl_clockwise;
	uniform float u_time;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		// Calculate position relative to LED center for the swirl effect
		vec2 grid_id = floor(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 led_center = (grid_id + 0.5) / vec2(u_grid_x, u_grid_y);
		
		// Calculate UV relative to center of entire grid
		vec2 centered_uv = led_center - vec2(0.5);
		
		// Calculate angle and distance from center
		float angle = atan(centered_uv.y, centered_uv.x);
		float radius = length(centered_uv);
		
		// Apply swirl factor to create spiral effect
		float swirl_angle = angle + radius * u_swirl_factor * 20.0;
		
		// Add rotation based on time and speed
		float rotation_offset = u_time * u_swirl_speed * (u_swirl_clockwise ? 1.0 : -1.0);
		swirl_angle += rotation_offset;
		
		// Create radial pattern (sunburst effect)
		float pattern = sin(swirl_angle * 8.0) * 0.5 + 0.5;
		
		// Apply threshold for sharp transitions
		float mix_factor = pattern;
		if (pattern > u_swirl_threshold) {
			mix_factor = 1.0;
		} else {
			mix_factor = 0.0;
		}
		
		vec3 final_color = mix(u_swirl_color_1, u_swirl_color_2, mix_factor);
		
		gl_FragColor = vec4(final_color * circle * u_fade, 1.0);
	}
`;

const voronoi_fragment_shader = `
	precision mediump float;
	
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform vec3 u_voronoi_color_1;
	uniform vec3 u_voronoi_color_2;
	uniform float u_voronoi_direction_x;
	uniform float u_voronoi_direction_y;
	uniform float u_voronoi_speed;
	uniform float u_voronoi_threshold;
	uniform int u_voronoi_distance_mode;
	uniform float u_time;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	// Hash function for pseudo-random numbers
	vec2 hash(vec2 p) {
		p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
		return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
	}
	
	// Distance functions
	float euclidean_distance(vec2 a, vec2 b) {
		return length(a - b);
	}
	
	float manhattan_distance(vec2 a, vec2 b) {
		vec2 diff = abs(a - b);
		return diff.x + diff.y;
	}
	
	float chebyshev_distance(vec2 a, vec2 b) {
		vec2 diff = abs(a - b);
		return max(diff.x, diff.y);
	}
	
	float minkowski_distance(vec2 a, vec2 b) {
		vec2 diff = abs(a - b);
		return pow(pow(diff.x, 0.5) + pow(diff.y, 0.5), 1.0/0.5);
	}
	
	float get_distance(vec2 a, vec2 b, int mode) {
		if (mode == 0) return euclidean_distance(a, b);
		else if (mode == 1) return manhattan_distance(a, b);
		else if (mode == 2) return chebyshev_distance(a, b);
		else return minkowski_distance(a, b);
	}
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		vec2 grid_id = floor(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 led_center = (grid_id + 0.5) / vec2(u_grid_x, u_grid_y);
		
		vec2 offset = vec2(u_voronoi_direction_x, u_voronoi_direction_y) * u_time * u_voronoi_speed * 0.1;
		vec2 scrolled_pos = led_center + offset;
		
		vec2 voronoi_pos = scrolled_pos * 8.0;
		
		vec2 cell = floor(voronoi_pos);
		vec2 fract_pos = fract(voronoi_pos);
		
		float min_dist = 10.0;
		
		for (int j = -1; j <= 1; j++) {
			for (int i = -1; i <= 1; i++) {
				vec2 neighbor = vec2(float(i), float(j));
				vec2 neighbor_cell = cell + neighbor;
				vec2 point = neighbor + hash(neighbor_cell) * 0.5 + 0.5;
				
				float d = get_distance(fract_pos, point, u_voronoi_distance_mode);
				min_dist = min(min_dist, d);
			}
		}
		
		float pattern = min_dist;
		
		float mix_factor = pattern;
		if (pattern > u_voronoi_threshold) {
			mix_factor = 1.0;
		} else {
			mix_factor = 0.0;
		}
		
		vec3 final_color = mix(u_voronoi_color_1, u_voronoi_color_2, mix_factor);
		
		gl_FragColor = vec4(final_color * circle * u_fade, 1.0);
	}
`;

const rings_fragment_shader = `
	precision mediump float;
	
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform vec3 u_rings_color_1;
	uniform vec3 u_rings_color_2;
	uniform float u_rings_speed;
	uniform bool u_rings_direction;
	uniform float u_rings_threshold;
	uniform float u_time;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		// Calculate position relative to LED center for the rings effect
		vec2 grid_id = floor(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 led_center = (grid_id + 0.5) / vec2(u_grid_x, u_grid_y);
		
		// Calculate distance from center of entire grid
		vec2 centered_uv = led_center - vec2(0.5);
		float radius = length(centered_uv);
		
		// Create time-based offset for animation
		float time_offset = u_time * u_rings_speed * 0.5;
		
		// Apply direction - inward vs outward
		float animated_radius;
		if (u_rings_direction) {
			// Outward direction
			animated_radius = radius - time_offset;
		} else {
			// Inward direction  
			animated_radius = radius + time_offset;
		}
		
		// Create sine wave pattern for rings
		float wave_value = sin(animated_radius * 12.56637) * 0.5 + 0.5; // 12.56637 = 4*PI for ring frequency
		
		// Apply threshold for sharp cutoff
		float mix_factor;
		if (wave_value > u_rings_threshold) {
			mix_factor = 1.0;
		} else {
			mix_factor = 0.0;
		}
		
		vec3 final_color = mix(u_rings_color_1, u_rings_color_2, mix_factor);
		
		gl_FragColor = vec4(final_color * circle * u_fade, 1.0);
	}
`;

const rain_fragment_shader = `
	precision mediump float;
	
	uniform float u_grid_x;
	uniform float u_grid_y;
	uniform vec3 u_rain_color_1;
	uniform vec3 u_rain_color_2;
	uniform float u_rain_speed;
	uniform float u_rain_direction_x;
	uniform float u_rain_direction_y;
	uniform float u_rain_columns;
	uniform float u_time;
	uniform float u_fade;
	uniform float u_cell_size;
	varying vec2 v_uv;
	
	// Hash function for pseudo-random numbers based on column
	float hash(float n) {
		return fract(sin(n * 12.9898) * 43758.5453123);
	}
	
	void main() {
		vec2 grid_uv = fract(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 center = vec2(0.5);
		float dist = distance(grid_uv, center);
		float circle = step(dist, u_cell_size);
		
		// Calculate position relative to LED center
		vec2 grid_id = floor(v_uv * vec2(u_grid_x, u_grid_y));
		vec2 led_center = (grid_id + 0.5) / vec2(u_grid_x, u_grid_y);
		
		// Determine primary and secondary axes based on direction
		vec2 primary_axis = normalize(vec2(u_rain_direction_x, u_rain_direction_y));
		vec2 secondary_axis = vec2(-primary_axis.y, primary_axis.x);
		
		// Project LED position onto axes
		float primary_pos = dot(led_center, primary_axis);
		float secondary_pos = dot(led_center, secondary_axis);
		
		// Create columns along the secondary axis
		float column_width = 1.0 / u_rain_columns;
		float column_id = floor(secondary_pos / column_width);
		float column_local_pos = fract(secondary_pos / column_width);
		
		// Generate random offset for this column
		float random_offset = hash(column_id) * 2.0;
		
		// Create scrolling effect along primary axis
		float scroll_offset = u_time * u_rain_speed * 0.5;
		float gradient_pos = primary_pos + scroll_offset + random_offset;
		
		// Create repeating linear gradient (sawtooth wave)
		float gradient_value = fract(gradient_pos * 2.0); // 2.0 controls gradient frequency
		
		// Smooth the gradient transitions
		gradient_value = smoothstep(0.0, 0.3, gradient_value) * (1.0 - smoothstep(0.7, 1.0, gradient_value));
		
		vec3 final_color = mix(u_rain_color_1, u_rain_color_2, gradient_value);
		
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
const chase_program = create_program(chase_fragment_shader);
const swirl_program = create_program(swirl_fragment_shader);
const voronoi_program = create_program(voronoi_fragment_shader);
const rings_program = create_program(rings_fragment_shader);
const rain_program = create_program(rain_fragment_shader);

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

const chase_uniforms = get_uniform_locations(chase_program, [
	'u_grid_x', 'u_grid_y', 'u_chase_color_1', 'u_chase_color_2', 'u_chase_color_3', 'u_chase_color_4',
	'u_chase_time', 'u_chase_duration', 'u_chase_smooth', 'u_chase_count', 'u_fade', 'u_cell_size'
]);

const swirl_uniforms = get_uniform_locations(swirl_program, [
	'u_grid_x', 'u_grid_y', 'u_swirl_color_1', 'u_swirl_color_2', 'u_swirl_threshold',
	'u_swirl_speed', 'u_swirl_factor', 'u_swirl_clockwise', 'u_time', 'u_fade', 'u_cell_size'
]);

const voronoi_uniforms = get_uniform_locations(voronoi_program, [
	'u_grid_x', 'u_grid_y', 'u_voronoi_color_1', 'u_voronoi_color_2', 'u_voronoi_direction_x', 'u_voronoi_direction_y',
	'u_voronoi_speed', 'u_voronoi_threshold', 'u_voronoi_distance_mode', 'u_time', 'u_fade', 'u_cell_size'
]);

const rings_uniforms = get_uniform_locations(rings_program, [
	'u_grid_x', 'u_grid_y', 'u_rings_color_1', 'u_rings_color_2', 'u_rings_speed', 'u_rings_direction',
	'u_rings_threshold', 'u_time', 'u_fade', 'u_cell_size'
]);

const rain_uniforms = get_uniform_locations(rain_program, [
	'u_grid_x', 'u_grid_y', 'u_rain_color_1', 'u_rain_color_2', 
	'u_rain_speed', 'u_rain_direction_x', 'u_rain_direction_y', 
	'u_rain_columns', 'u_time', 'u_fade', 'u_cell_size'
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
	} else if (current_mode === 'chase') {
		gl.uniform1f(chase_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(chase_uniforms.u_grid_y, grid_size_y);
		gl.uniform3f(chase_uniforms.u_chase_color_1, chase_colors[0].r, chase_colors[0].g, chase_colors[0].b);
		gl.uniform3f(chase_uniforms.u_chase_color_2, chase_colors[1].r, chase_colors[1].g, chase_colors[1].b);
		gl.uniform3f(chase_uniforms.u_chase_color_3, chase_colors[2].r, chase_colors[2].g, chase_colors[2].b);
		gl.uniform3f(chase_uniforms.u_chase_color_4, chase_colors[3].r, chase_colors[3].g, chase_colors[3].b);
		gl.uniform1f(chase_uniforms.u_chase_time, (performance.now() - chase_start_time) / 1000.0);
		gl.uniform1f(chase_uniforms.u_chase_duration, chase_duration / 1000.0);
		gl.uniform1i(chase_uniforms.u_chase_smooth, chase_smooth);
		gl.uniform1i(chase_uniforms.u_chase_count, chase_count);
		gl.uniform1f(chase_uniforms.u_fade, fade_level);
		gl.uniform1f(chase_uniforms.u_cell_size, cell_size);
	} else if (current_mode === 'swirl') {
		gl.uniform1f(swirl_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(swirl_uniforms.u_grid_y, grid_size_y);
		gl.uniform3f(swirl_uniforms.u_swirl_color_1, swirl_color_1.r, swirl_color_1.g, swirl_color_1.b);
		gl.uniform3f(swirl_uniforms.u_swirl_color_2, swirl_color_2.r, swirl_color_2.g, swirl_color_2.b);
		gl.uniform1f(swirl_uniforms.u_swirl_threshold, swirl_threshold);
		gl.uniform1f(swirl_uniforms.u_swirl_speed, swirl_speed);
		gl.uniform1f(swirl_uniforms.u_swirl_factor, swirl_factor);
		gl.uniform1i(swirl_uniforms.u_swirl_clockwise, swirl_clockwise);
		gl.uniform1f(swirl_uniforms.u_time, (performance.now() - swirl_start_time) / 1000.0);
		gl.uniform1f(swirl_uniforms.u_fade, fade_level);
		gl.uniform1f(swirl_uniforms.u_cell_size, cell_size);
	} else if (current_mode === 'voronoi') {
		gl.uniform1f(voronoi_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(voronoi_uniforms.u_grid_y, grid_size_y);
		gl.uniform3f(voronoi_uniforms.u_voronoi_color_1, voronoi_color_1.r, voronoi_color_1.g, voronoi_color_1.b);
		gl.uniform3f(voronoi_uniforms.u_voronoi_color_2, voronoi_color_2.r, voronoi_color_2.g, voronoi_color_2.b);
		gl.uniform1f(voronoi_uniforms.u_voronoi_direction_x, voronoi_direction_x);
		gl.uniform1f(voronoi_uniforms.u_voronoi_direction_y, voronoi_direction_y);
		gl.uniform1f(voronoi_uniforms.u_voronoi_speed, voronoi_speed);
		gl.uniform1f(voronoi_uniforms.u_voronoi_threshold, voronoi_threshold);
		gl.uniform1i(voronoi_uniforms.u_voronoi_distance_mode, voronoi_distance_mode);
		gl.uniform1f(voronoi_uniforms.u_time, (performance.now() - voronoi_start_time) / 1000.0);
		gl.uniform1f(voronoi_uniforms.u_fade, fade_level);
		gl.uniform1f(voronoi_uniforms.u_cell_size, cell_size);
	} else if (current_mode === 'rings') {
		gl.uniform1f(rings_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(rings_uniforms.u_grid_y, grid_size_y);
		gl.uniform3f(rings_uniforms.u_rings_color_1, rings_color_1.r, rings_color_1.g, rings_color_1.b);
		gl.uniform3f(rings_uniforms.u_rings_color_2, rings_color_2.r, rings_color_2.g, rings_color_2.b);
		gl.uniform1f(rings_uniforms.u_rings_speed, rings_speed);
		gl.uniform1i(rings_uniforms.u_rings_direction, rings_direction);
		gl.uniform1f(rings_uniforms.u_rings_threshold, rings_threshold);
		gl.uniform1f(rings_uniforms.u_time, (performance.now() - rings_start_time) / 1000.0);
		gl.uniform1f(rings_uniforms.u_fade, fade_level);
		gl.uniform1f(rings_uniforms.u_cell_size, cell_size);
	} else if (current_mode === 'rain') {
		gl.uniform1f(rain_uniforms.u_grid_x, grid_size_x);
		gl.uniform1f(rain_uniforms.u_grid_y, grid_size_y);
		gl.uniform3f(rain_uniforms.u_rain_color_1, rain_color_1.r, rain_color_1.g, rain_color_1.b);
		gl.uniform3f(rain_uniforms.u_rain_color_2, rain_color_2.r, rain_color_2.g, rain_color_2.b);
		gl.uniform1f(rain_uniforms.u_rain_speed, rain_speed);
		gl.uniform1f(rain_uniforms.u_rain_direction_x, rain_direction_x);
		gl.uniform1f(rain_uniforms.u_rain_direction_y, rain_direction_y);
		gl.uniform1f(rain_uniforms.u_rain_columns, rain_columns);
		gl.uniform1f(rain_uniforms.u_time, (performance.now() - rain_start_time) / 1000.0);
		gl.uniform1f(rain_uniforms.u_fade, fade_level);
		gl.uniform1f(rain_uniforms.u_cell_size, cell_size);
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

			case 'chase':
				current_mode = 'chase';
				current_program = chase_program;
				
				if (data.colors && data.colors.length > 0) {
					for (let i = 0; i < 4; i++) {
						if (i < data.colors.length) {
							chase_colors[i].r = data.colors[i].r / 255;
							chase_colors[i].g = data.colors[i].g / 255;
							chase_colors[i].b = data.colors[i].b / 255;
						}
					}
					chase_count = Math.min(data.colors.length, 4);
				}
				
				chase_duration = data.time || 1000;
				chase_smooth = data.smooth || false;
				chase_start_time = performance.now();
				break;

			case 'swirl':
				current_mode = 'swirl';
				current_program = swirl_program;
				
				swirl_color_1.r = data.color_1.r / 255;
				swirl_color_1.g = data.color_1.g / 255;
				swirl_color_1.b = data.color_1.b / 255;
				swirl_color_2.r = data.color_2.r / 255;
				swirl_color_2.g = data.color_2.g / 255;
				swirl_color_2.b = data.color_2.b / 255;
				
				swirl_threshold = data.threshold || 0.5;
				swirl_speed = data.speed || 1.0;
				swirl_factor = data.swirl_factor || 0.0;
				swirl_clockwise = data.clockwise !== undefined ? data.clockwise : true;
				swirl_start_time = performance.now();
				break;

			case 'voronoi':
				current_mode = 'voronoi';
				current_program = voronoi_program;
				
				voronoi_color_1.r = data.color_1.r / 255;
				voronoi_color_1.g = data.color_1.g / 255;
				voronoi_color_1.b = data.color_1.b / 255;
				voronoi_color_2.r = data.color_2.r / 255;
				voronoi_color_2.g = data.color_2.g / 255;
				voronoi_color_2.b = data.color_2.b / 255;
				
				const direction = data.direction || 'X+';
				if (direction === 'X+') {
					voronoi_direction_x = 1.0;
					voronoi_direction_y = 0.0;
				} else if (direction === 'X-') {
					voronoi_direction_x = -1.0;
					voronoi_direction_y = 0.0;
				} else if (direction === 'Y+') {
					voronoi_direction_x = 0.0;
					voronoi_direction_y = 1.0;
				} else if (direction === 'Y-') {
					voronoi_direction_x = 0.0;
					voronoi_direction_y = -1.0;
				}
				
				voronoi_speed = data.speed || 1.0;
				voronoi_threshold = data.threshold || 0.5;
				
				const distance_mode = data.distance_mode || 'euclidean';
				if (distance_mode === 'euclidean') {
					voronoi_distance_mode = 0;
				} else if (distance_mode === 'manhattan') {
					voronoi_distance_mode = 1;
				} else if (distance_mode === 'chebyshev') {
					voronoi_distance_mode = 2;
				} else if (distance_mode === 'minkowski') {
					voronoi_distance_mode = 3;
				}
				
				voronoi_start_time = performance.now();
				break;

			case 'rings':
				current_mode = 'rings';
				current_program = rings_program;
				
				rings_color_1.r = data.color_1.r / 255;
				rings_color_1.g = data.color_1.g / 255;
				rings_color_1.b = data.color_1.b / 255;
				rings_color_2.r = data.color_2.r / 255;
				rings_color_2.g = data.color_2.g / 255;
				rings_color_2.b = data.color_2.b / 255;
				
				rings_speed = data.speed || 1.0;
				rings_direction = data.direction !== undefined ? data.direction : true;
				rings_threshold = data.threshold || 0.5;
				rings_start_time = performance.now();
				break;

			case 'rain':
				current_mode = 'rain';
				current_program = rain_program;
				
				rain_color_1.r = data.color_1.r / 255;
				rain_color_1.g = data.color_1.g / 255;
				rain_color_1.b = data.color_1.b / 255;
				rain_color_2.r = data.color_2.r / 255;
				rain_color_2.g = data.color_2.g / 255;
				rain_color_2.b = data.color_2.b / 255;
				
				rain_speed = data.speed || 1.0;
				rain_direction_x = data.direction_x || 1.0;
				rain_direction_y = data.direction_y || 0.0;
				rain_columns = data.columns || 10.0;
				rain_start_time = performance.now();
				break;
		}
	});

	events.publish('led:layout', { name: fixture_name });
});