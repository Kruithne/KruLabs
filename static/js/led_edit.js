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
	if (!fixture_name) return;
	
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
			if (this.mode === 'color') {
				send_color_update(this.fixture_name, this.color);
			}
		},
		on_wave_change() {
			if (this.mode === 'wave') {
				send_wave_update(this.fixture_name, this.wave);
			}
		},
		send_current_update() {
			if (this.mode === 'color') {
				send_color_update(this.fixture_name, this.color);
			} else if (this.mode === 'wave') {
				send_wave_update(this.fixture_name, this.wave);
			}
		}
	},
	computed: {
		api_code() {
			if (!this.fixture_name) return 'Enter fixture name to see API code';
			
			if (this.mode === 'color') {
				return `led.color('${this.color}');`;
			} else {
				return `led.wave('${this.wave.color_1}', '${this.wave.color_2}', ${this.wave.rotation}, ${this.wave.speed}, ${this.wave.sharp});`;
			}
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
				</select>
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

			<div class="section api_section">
				<label>Server API:</label>
				<div class="api_code">{{ api_code }}</div>
			</div>
		</div>
	`
}).mount('#container');