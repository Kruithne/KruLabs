import { EventsSocket } from './events.js';
import { createApp } from './vue.esm.prod.js';

const events = new EventsSocket();

const hex_to_rgb = (hex) => {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null;
};

const send_color_update = (fixture_name, color_hex) => {
	const rgb = hex_to_rgb(color_hex);
	if (rgb && fixture_name) {
		events.publish(`led:update#${fixture_name}`, {
			action: 'color',
			color: rgb
		});
	}
};

const send_wave_update = (fixture_name, wave_config) => {
	if (!fixture_name)
		return;
	
	const color_1 = hex_to_rgb(wave_config.color_1);
	const color_2 = hex_to_rgb(wave_config.color_2);
	
	if (color_1 && color_2) {
		events.publish(`led:update#${fixture_name}`, {
			action: 'wave',
			color_1: color_1,
			color_2: color_2,
			rotation: wave_config.rotation,
			speed: wave_config.speed,
			sharp: wave_config.sharp
		});
	}
};

const send_fade_update = (fixture_name, action, time_ms) => {
	if (!fixture_name)
		return;
	
	events.publish(`led:update#${fixture_name}`, {
		action: action,
		time: time_ms
	});
};

const send_layout_update = (fixture_name, grid_x, grid_y, cell_size) => {
	if (!fixture_name)
		return;
	
	events.publish(`led:update#${fixture_name}`, {
		action: 'layout',
		size_x: grid_x,
		size_y: grid_y,
		cell_size: cell_size
	});
};

const send_chase_update = (fixture_name, chase_config) => {
	if (!fixture_name)
		return;
	
	const colors = chase_config.colors.map(hex_to_rgb).filter(rgb => rgb !== null);
	
	events.publish(`led:update#${fixture_name}`, {
		action: 'chase',
		colors: colors,
		time: chase_config.time,
		smooth: chase_config.smooth
	});
};

const send_swirl_update = (fixture_name, swirl_config) => {
	if (!fixture_name)
		return;
	
	const color_1 = hex_to_rgb(swirl_config.color_1);
	const color_2 = hex_to_rgb(swirl_config.color_2);
	
	if (color_1 && color_2) {
		events.publish(`led:update#${fixture_name}`, {
			action: 'swirl',
			color_1: color_1,
			color_2: color_2,
			threshold: swirl_config.threshold,
			speed: swirl_config.speed,
			swirl_factor: swirl_config.swirl_factor,
			clockwise: swirl_config.clockwise
		});
	}
};

const send_voronoi_update = (fixture_name, voronoi_config) => {
	if (!fixture_name)
		return;
	
	const color_1 = hex_to_rgb(voronoi_config.color_1);
	const color_2 = hex_to_rgb(voronoi_config.color_2);
	
	if (color_1 && color_2) {
		events.publish(`led:update#${fixture_name}`, {
			action: 'voronoi',
			color_1: color_1,
			color_2: color_2,
			direction: voronoi_config.direction,
			speed: voronoi_config.speed,
			threshold: voronoi_config.threshold,
			distance_mode: voronoi_config.distance_mode
		});
	}
};

const send_rings_update = (fixture_name, rings_config) => {
	if (!fixture_name)
		return;
	
	const color_1 = hex_to_rgb(rings_config.color_1);
	const color_2 = hex_to_rgb(rings_config.color_2);
	
	if (color_1 && color_2) {
		events.publish(`led:update#${fixture_name}`, {
			action: 'rings',
			color_1: color_1,
			color_2: color_2,
			speed: rings_config.speed,
			direction: rings_config.direction,
			threshold: rings_config.threshold
		});
	}
};

const send_rain_update = (fixture_name, rain_config) => {
	if (!fixture_name)
		return;

	const color_1 = hex_to_rgb(rain_config.color_1);
	const color_2 = hex_to_rgb(rain_config.color_2);

	if (color_1 && color_2) {
		events.publish(`led:update#${fixture_name}`, {
			action: 'rain',
			color_1: color_1,
			color_2: color_2,
			speed: rain_config.speed || 1.0,
			direction_x: rain_config.direction_x || 1.0,
			direction_y: rain_config.direction_y || 0.0,
			columns: rain_config.columns || 10.0
		});
	}
};

const state = createApp({
	data() {
		return {
			fixture_name: '',
			mode: 'color',
			color: '#ff0000',

			wave: {
				color_1: '#ff0000',
				color_2: '#00ff00',
				rotation: 0,
				speed: 1.0,
				sharp: false
			},

			fade_time: 1000,

			layout: {
				grid_x: 5,
				grid_y: 5,
				cell_size: 0.4
			},

			chase: {
				colors: ['#ff0000', '#00ff00'],
				time: 1000,
				smooth: false
			},

			swirl: {
				color_1: '#ff0000',
				color_2: '#00ff00',
				threshold: 0.5,
				speed: 1.0,
				swirl_factor: 0.0,
				clockwise: true
			},

			voronoi: {
				color_1: '#ff0000',
				color_2: '#00ff00',
				direction: 'X+',
				speed: 1.0,
				threshold: 0.5,
				distance_mode: 'euclidean'
			},

			rings: {
				color_1: '#ff0000',
				color_2: '#00ff00',
				speed: 1.0,
				direction: true,
				threshold: 0.5
			},

			rain: {
				color_1: '#ff0000',
				color_2: '#00ff00',
				speed: 1.0,
				direction_x: 1.0,
				direction_y: 0.0,
				columns: 10.0
			}
		}
	},
	methods: {
		on_fixture_name_change() {
			this.send_current_update();
		},

		on_mode_change() {
			this.send_current_update();
		},

		on_color_change() {
			if (this.mode === 'color')
				send_color_update(this.fixture_name, this.color);
		},

		on_wave_change() {
			if (this.mode === 'wave')
				send_wave_update(this.fixture_name, this.wave);
		},

		on_chase_change() {
			if (this.mode === 'chase')
				send_chase_update(this.fixture_name, this.chase);
		},

		on_swirl_change() {
			if (this.mode === 'swirl')
				send_swirl_update(this.fixture_name, this.swirl);
		},

		on_voronoi_change() {
			if (this.mode === 'voronoi')
				send_voronoi_update(this.fixture_name, this.voronoi);
		},

		on_rings_change() {
			if (this.mode === 'rings')
				send_rings_update(this.fixture_name, this.rings);
		},

		on_rain_change() {
			if (this.mode === 'rain')
				send_rain_update(this.fixture_name, this.rain);
		},

		send_current_update() {
			if (this.mode === 'color') {
				send_color_update(this.fixture_name, this.color);
			} else if (this.mode === 'wave') {
				send_wave_update(this.fixture_name, this.wave);
			} else if (this.mode === 'chase') {
				send_chase_update(this.fixture_name, this.chase);
			} else if (this.mode === 'swirl') {
				send_swirl_update(this.fixture_name, this.swirl);
			} else if (this.mode === 'voronoi') {
				send_voronoi_update(this.fixture_name, this.voronoi);
			} else if (this.mode === 'rings') {
				send_rings_update(this.fixture_name, this.rings);
			} else if (this.mode === 'rain') {
				send_rain_update(this.fixture_name, this.rain);
			}
		},

		fade_out() {
			send_fade_update(this.fixture_name, 'fade_out', this.fade_time);
		},

		fade_in() {
			send_fade_update(this.fixture_name, 'fade_in', this.fade_time);
		},

		on_layout_change() {
			send_layout_update(this.fixture_name, this.layout.grid_x, this.layout.grid_y, this.layout.cell_size);
		},

		add_chase_color() {
			this.chase.colors.push('#ffffff');
			this.on_chase_change();
		},

		remove_chase_color(index) {
			if (this.chase.colors.length > 1) {
				this.chase.colors.splice(index, 1);
				this.on_chase_change();
			}
		}
	},
	computed: {
		api_code() {
			if (!this.fixture_name)
				return 'Enter fixture name to see API code';
			
			if (this.mode === 'color')
				return `led.color('${this.color}');`;
			else if (this.mode === 'wave')
				return `led.wave('${this.wave.color_1}', '${this.wave.color_2}', ${this.wave.rotation}, ${this.wave.speed}, ${this.wave.sharp});`;
			else if (this.mode === 'chase')
				return `led.chase([${this.chase.colors.map(c => `'${c}'`).join(', ')}], ${this.chase.time}, ${this.chase.smooth});`;
			else if (this.mode === 'swirl')
				return `led.swirl('${this.swirl.color_1}', '${this.swirl.color_2}', ${this.swirl.threshold}, ${this.swirl.speed}, ${this.swirl.swirl_factor}, ${this.swirl.clockwise});`;
			else if (this.mode === 'voronoi')
				return `led.voronoi('${this.voronoi.color_1}', '${this.voronoi.color_2}', '${this.voronoi.direction}', ${this.voronoi.speed}, ${this.voronoi.threshold}, '${this.voronoi.distance_mode}');`;
			else if (this.mode === 'rings')
				return `led.rings('${this.rings.color_1}', '${this.rings.color_2}', ${this.rings.speed}, ${this.rings.direction}, ${this.rings.threshold});`;
			else if (this.mode === 'rain')
				return `led.rain('${this.rain.color_1}', '${this.rain.color_2}', ${this.rain.speed}, ${this.rain.direction_x}, ${this.rain.direction_y}, ${this.rain.columns});`;
			
			return 'Enter fixture name to see API code';
		},
		layout_api_code() {
			if (!this.fixture_name)
				return 'Enter fixture name to see API code';
			
			return `led.layout(${this.layout.grid_x}, ${this.layout.grid_y}, ${this.layout.cell_size});`;
		}
	},
	template: `
		<div class="control_panel">
			<div class="section">
				<label for="fixture_name">Fixture Name:</label>
				<input 
					type="text" 
					id="fixture_name"
					v-model="fixture_name" 
					@input="on_fixture_name_change"
					placeholder="Enter fixture name"
				>
			</div>

			<div class="section">
				<label for="mode">Mode:</label>
				<select id="mode" v-model="mode" @change="on_mode_change">
					<option value="color">Color</option>
					<option value="wave">Wave</option>
					<option value="chase">Chase</option>
					<option value="swirl">Swirl</option>
					<option value="voronoi">Voronoi</option>
					<option value="rings">Rings</option>
					<option value="rain">Rain</option>
				</select>
			</div>

			<div class="section layout_section">
				<h3>Layout Settings</h3>
				<div class="layout_control">
					<label for="grid_x">Grid X:</label>
					<input 
						type="number" 
						id="grid_x"
						v-model.number="layout.grid_x"
						@input="on_layout_change"
						min="1"
						max="50"
					>
				</div>
				<div class="layout_control">
					<label for="grid_y">Grid Y:</label>
					<input 
						type="number" 
						id="grid_y"
						v-model.number="layout.grid_y"
						@input="on_layout_change"
						min="1"
						max="50"
					>
				</div>
				<div class="layout_control">
					<label for="cell_size">Cell Size:</label>
					<input 
						type="range" 
						id="cell_size"
						v-model.number="layout.cell_size"
						@input="on_layout_change"
						min="0.1"
						max="1"
						step="0.01"
					>
					<span class="value">{{ layout.cell_size.toFixed(2) }}</span>
				</div>
			</div>

			<div v-if="mode === 'color'" class="section color_section">
				<label for="color">Color:</label>
				<input 
					type="color" 
					id="color"
					v-model="color" 
					@input="on_color_change"
				>
			</div>

			<div v-if="mode === 'wave'" class="section wave_section">
				<div class="wave_control">
					<label for="wave_color_1">Color 1:</label>
					<input 
						type="color" 
						id="wave_color_1"
						v-model="wave.color_1" 
						@input="on_wave_change"
					>
				</div>

				<div class="wave_control">
					<label for="wave_color_2">Color 2:</label>
					<input 
						type="color" 
						id="wave_color_2"
						v-model="wave.color_2" 
						@input="on_wave_change"
					>
				</div>

				<div class="wave_control">
					<label for="wave_rotation">Rotation (degrees):</label>
					<input 
						type="range" 
						id="wave_rotation"
						v-model.number="wave.rotation" 
						@input="on_wave_change"
						min="0" 
						max="360" 
						step="1"
					>
					<span class="value">{{ wave.rotation }}°</span>
				</div>

				<div class="wave_control">
					<label for="wave_speed">Speed:</label>
					<input 
						type="range" 
						id="wave_speed"
						v-model.number="wave.speed" 
						@input="on_wave_change"
						min="0.1" 
						max="300.0" 
						step="0.1"
					>
					<span class="value">{{ wave.speed.toFixed(1) }}</span>
				</div>

				<div class="wave_control checkbox_control">
					<label for="wave_sharp">
						<input 
							type="checkbox" 
							id="wave_sharp"
							v-model="wave.sharp" 
							@change="on_wave_change"
						>
						Sharp transitions
					</label>
				</div>
			</div>

			<div v-if="mode === 'chase'" class="section chase_section">
				<h3>Chase Settings</h3>
				<div class="chase_control">
					<label for="chase_time">Time (ms):</label>
					<input 
						type="number" 
						id="chase_time"
						v-model.number="chase.time"
						@input="on_chase_change"
						min="100"
						step="100"
					>
				</div>
				<div class="chase_control checkbox_control">
					<label for="chase_smooth">
						<input 
							type="checkbox" 
							id="chase_smooth"
							v-model="chase.smooth" 
							@change="on_chase_change"
						>
						Smooth transitions
					</label>
				</div>
				<div class="chase_colors">
					<h4>Colors</h4>
					<div v-for="(color, index) in chase.colors" :key="index" class="chase_color_item">
						<input 
							type="color" 
							v-model="chase.colors[index]"
							@input="on_chase_change"
						>
						<button @click="remove_chase_color(index)" :disabled="chase.colors.length <= 1" class="remove_color">×</button>
					</div>
					<button @click="add_chase_color" class="add_color">Add Color</button>
				</div>
			</div>

			<div v-if="mode === 'swirl'" class="section swirl_section">
				<h3>Swirl Settings</h3>
				<div class="swirl_control">
					<label for="swirl_color_1">Color 1:</label>
					<input 
						type="color" 
						id="swirl_color_1"
						v-model="swirl.color_1" 
						@input="on_swirl_change"
					>
				</div>
				<div class="swirl_control">
					<label for="swirl_color_2">Color 2:</label>
					<input 
						type="color" 
						id="swirl_color_2"
						v-model="swirl.color_2" 
						@input="on_swirl_change"
					>
				</div>
				<div class="swirl_control">
					<label for="swirl_threshold">Threshold:</label>
					<input 
						type="range" 
						id="swirl_threshold"
						v-model.number="swirl.threshold"
						@input="on_swirl_change"
						min="0"
						max="1"
						step="0.01"
					>
					<span class="value">{{ swirl.threshold.toFixed(2) }}</span>
				</div>
				<div class="swirl_control">
					<label for="swirl_speed">Speed:</label>
					<input 
						type="range" 
						id="swirl_speed"
						v-model.number="swirl.speed"
						@input="on_swirl_change"
						min="0"
						max="5"
						step="0.1"
					>
					<span class="value">{{ swirl.speed.toFixed(1) }}</span>
				</div>
				<div class="swirl_control">
					<label for="swirl_factor">Swirl Factor:</label>
					<input 
						type="range" 
						id="swirl_factor"
						v-model.number="swirl.swirl_factor"
						@input="on_swirl_change"
						min="0"
						max="2"
						step="0.1"
					>
					<span class="value">{{ swirl.swirl_factor.toFixed(1) }}</span>
				</div>
				<div class="swirl_control checkbox_control">
					<label for="swirl_clockwise">
						<input 
							type="checkbox" 
							id="swirl_clockwise"
							v-model="swirl.clockwise" 
							@change="on_swirl_change"
						>
						Clockwise rotation
					</label>
				</div>
			</div>

			<div v-if="mode === 'voronoi'" class="section voronoi_section">
				<h3>Voronoi Settings</h3>
				<div class="voronoi_control">
					<label for="voronoi_color_1">Color 1:</label>
					<input 
						type="color" 
						id="voronoi_color_1"
						v-model="voronoi.color_1" 
						@input="on_voronoi_change"
					>
				</div>
				<div class="voronoi_control">
					<label for="voronoi_color_2">Color 2:</label>
					<input 
						type="color" 
						id="voronoi_color_2"
						v-model="voronoi.color_2" 
						@input="on_voronoi_change"
					>
				</div>
				<div class="voronoi_control">
					<label for="voronoi_direction">Direction:</label>
					<select 
						id="voronoi_direction"
						v-model="voronoi.direction"
						@change="on_voronoi_change"
					>
						<option value="X+">X+ (Left)</option>
						<option value="X-">X- (Right)</option>
						<option value="Y+">Y+ (Down)</option>
						<option value="Y-">Y- (Up)</option>
					</select>
				</div>
				<div class="voronoi_control">
					<label for="voronoi_speed">Speed:</label>
					<input 
						type="range" 
						id="voronoi_speed"
						v-model.number="voronoi.speed"
						@input="on_voronoi_change"
						min="0"
						max="5"
						step="0.1"
					>
					<span class="value">{{ voronoi.speed.toFixed(1) }}</span>
				</div>
				<div class="voronoi_control">
					<label for="voronoi_threshold">Threshold:</label>
					<input 
						type="range" 
						id="voronoi_threshold"
						v-model.number="voronoi.threshold"
						@input="on_voronoi_change"
						min="0"
						max="1"
						step="0.01"
					>
					<span class="value">{{ voronoi.threshold.toFixed(2) }}</span>
				</div>
				<div class="voronoi_control">
					<label for="voronoi_distance_mode">Distance Mode:</label>
					<select 
						id="voronoi_distance_mode"
						v-model="voronoi.distance_mode"
						@change="on_voronoi_change"
					>
						<option value="euclidean">Euclidean (Circles)</option>
						<option value="manhattan">Manhattan (Diamonds)</option>
						<option value="chebyshev">Chebyshev (Squares)</option>
						<option value="minkowski">Minkowski (Stars)</option>
					</select>
				</div>
			</div>

			<div v-if="mode === 'rings'" class="section rings_section">
				<h3>Rings Settings</h3>
				<div class="rings_control">
					<label for="rings_color_1">Color 1:</label>
					<input 
						type="color" 
						id="rings_color_1"
						v-model="rings.color_1" 
						@input="on_rings_change"
					>
				</div>
				<div class="rings_control">
					<label for="rings_color_2">Color 2:</label>
					<input 
						type="color" 
						id="rings_color_2"
						v-model="rings.color_2" 
						@input="on_rings_change"
					>
				</div>
				<div class="rings_control">
					<label for="rings_speed">Speed:</label>
					<input 
						type="range" 
						id="rings_speed"
						v-model.number="rings.speed"
						@input="on_rings_change"
						min="0"
						max="5"
						step="0.1"
					>
					<span class="value">{{ rings.speed.toFixed(1) }}</span>
				</div>
				<div class="rings_control checkbox_control">
					<label for="rings_direction">
						<input 
							type="checkbox" 
							id="rings_direction"
							v-model="rings.direction" 
							@change="on_rings_change"
						>
						Outward direction (unchecked = inward)
					</label>
				</div>
				<div class="rings_control">
					<label for="rings_threshold">Threshold:</label>
					<input 
						type="range" 
						id="rings_threshold"
						v-model.number="rings.threshold"
						@input="on_rings_change"
						min="0"
						max="1"
						step="0.01"
					>
					<span class="value">{{ rings.threshold.toFixed(2) }}</span>
				</div>
			</div>

			<div v-if="mode === 'rain'" class="section rain_section">
				<h3>Rain Settings</h3>
				<div class="rain_control">
					<label for="rain_color_1">Color 1:</label>
					<input 
						type="color" 
						id="rain_color_1"
						v-model="rain.color_1" 
						@input="on_rain_change"
					>
				</div>
				<div class="rain_control">
					<label for="rain_color_2">Color 2:</label>
					<input 
						type="color" 
						id="rain_color_2"
						v-model="rain.color_2" 
						@input="on_rain_change"
					>
				</div>
				<div class="rain_control">
					<label for="rain_speed">Speed:</label>
					<input 
						type="range" 
						id="rain_speed"
						v-model.number="rain.speed"
						@input="on_rain_change"
						min="0.1"
						max="5.0"
						step="0.1"
					>
					<span class="value">{{ rain.speed.toFixed(1) }}</span>
				</div>
				<div class="rain_control">
					<label for="rain_direction_x">Direction X:</label>
					<input 
						type="range" 
						id="rain_direction_x"
						v-model.number="rain.direction_x"
						@input="on_rain_change"
						min="-5.0"
						max="5.0"
						step="0.1"
					>
					<span class="value">{{ rain.direction_x.toFixed(1) }}</span>
				</div>
				<div class="rain_control">
					<label for="rain_direction_y">Direction Y:</label>
					<input 
						type="range" 
						id="rain_direction_y"
						v-model.number="rain.direction_y"
						@input="on_rain_change"
						min="-5.0"
						max="5.0"
						step="0.1"
					>
					<span class="value">{{ rain.direction_y.toFixed(1) }}</span>
				</div>
				<div class="rain_control">
					<label for="columns">Columns:</label>
					<input 
						type="number" 
						id="columns"
						v-model.number="rain.columns"
						@input="on_rain_change"
						min="1"
						max="100"
						step="1"
					>
					<span class="value">{{ rain.columns }}</span>
				</div>
			</div>

			<div class="section fade_section">
				<label for="fade_time">Fade Time (ms):</label>
				<input 
					type="number" 
					id="fade_time"
					v-model.number="fade_time"
					min="0"
					step="100"
				>
				<button @click="fade_out" :disabled="!fixture_name">Fade Out</button>
				<button @click="fade_in" :disabled="!fixture_name">Fade In</button>
			</div>

			<div class="section api_section">
				<label>Server API:</label>
				<div class="api_code">{{ api_code }}</div>
				<label>Layout API:</label>
				<div class="api_code">{{ layout_api_code }}</div>
			</div>
		</div>
	`
}).mount('#container');