import package_json from './package.json';
import node_os from 'node:os';

const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_ORANGE = '\x1b[33m';

const CONFIG_FILE_PATH = './config.json';

const configuration = {
	web_server: {
		port: 4000
	}
};

function log(message: string, color: string, prefix: string): void {
	const formatted_message = (`[{${prefix}}] ` + message).replace(/\{([^}]+)\}/g, `${color}$1\x1b[0m`);
	process.stdout.write(formatted_message + '\n');
}

function log_error(message: string): void {
	log(message, ANSI_RED, 'ERROR');
}

function log_info(message: string): void {
	log(message, ANSI_CYAN, 'INFO');
}

function log_ok(message: string): void {
	log(message, ANSI_GREEN, 'OK');
}

function log_warn(message: string): void {
	log(message, ANSI_ORANGE, 'WARN');
}

function print_ipv4_addresses(): void {
	const interfaces = node_os.networkInterfaces();
	const entries = Object.entries(interfaces);

	log_ok(`found {${entries.length}} network interfaces`);

	for (const [interface_name, addresses] of entries) {
		if (addresses === undefined)
			continue;

		for (const address of addresses) {
			if (!address.internal && address.family === 'IPv4')
				log_info(`{${interface_name}} has IPv4 address {${address.address}}`);
		}
	}
}

function generate_controller_pin(): number {
	return Math.floor(Math.random() * 9000) + 1000;
}

function init_local_server(): void {
	const acp_key = crypto.randomUUID();
	const controller_pin = generate_controller_pin();

	const server = Bun.serve({
		development: false,
		port: configuration.web_server.port,
		fetch(req) {
			const url = new URL(req.url);
			return new Response('Hello world', { status: 200 });
		},

		error(error) {
			log_error('internal error occurred while processing an incoming web request');
			log_error(`{${error.name}} ${error.message}`);

			return new Response('An error occurred while processing the request.', { status: 500 });
		}
	});

	log_ok('local server initiated');
	log_info(`{admin control panel} available at {http://localhost:${server.port}/admin/${acp_key}`);
	log_info(`{production controller} available at {http://localhost:${server.port}/controller/${controller_pin}`);
	log_info(`{production observer} available at {http://localhost:${server.port}/observer}`);

	print_ipv4_addresses();
}

function resolve_object_entry(object: Record<string, any>, key: string): any {
	const keys = key.split('.');

	for (const key of keys) {
		if (object === undefined)
			return undefined;

		object = object[key];
	}

	return object;
}

function set_object_entry(object: Record<string, any>, key: string, value: any): void {
	const keys = key.split('.');

	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];

		if (object[key] === undefined)
			object[key] = {};

		object = object[key];
	}

	object[keys[keys.length - 1]] = value;
}

function get_object_type(object: any): string {
	if (object === null)
		return 'null';

	if (Array.isArray(object))
		return 'array';

	return typeof object;
}

function parse_config(config: Record<string, any>, parent_key: string = ''): void {
	for (const [key, value] of Object.entries(config)) {
		const full_key = parent_key === '' ? key : `${parent_key}.${key}`;
		const target_value = resolve_object_entry(configuration, full_key);

		if (target_value === undefined) {
			log_warn(`unknown configuration entry {${full_key}}; ignoring entry`);
		} else {
			const value_type = get_object_type(value);
			const target_type = get_object_type(target_value);

			if (value_type !== target_type) {
				log_warn(`invalid configuration entry {${full_key}}, expected {${target_type}} but got {${value_type}}; using default`);
			} else if (value_type === 'object') {
				parse_config(value, full_key);
			} else {
				set_object_entry(configuration, full_key, value);
			}
		}
	}
}

async function init_config(): Promise<void> {
	const config_file = Bun.file(CONFIG_FILE_PATH);
	if (!await config_file.exists()) {
		log_warn(`configuration file not found at {${CONFIG_FILE_PATH}}; writing default configuration`);

		try {
			await Bun.write(CONFIG_FILE_PATH, JSON.stringify(configuration, null, 4));
		} catch (e) {
			log_error(`failed to write default configuration to {${CONFIG_FILE_PATH}}; using default configuration`);
		}
	}

	try {
		const user_configuration = await config_file.json();
		parse_config(user_configuration);
	} catch (e) {
		log_error(`failed to parse configuration file at {${CONFIG_FILE_PATH}}; using default configuration`);
	}

	log_ok(`configuration loaded from {${CONFIG_FILE_PATH}}`);
}

(async function main() {
	log_info(`KruLabs {v${package_json.version}}`);
	await init_config();
	init_local_server();
})();