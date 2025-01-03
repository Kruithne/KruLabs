import package_json from './package.json';
import node_os from 'node:os';
import node_http from 'node:http';
import node_path from 'node:path';
import node_fs from 'node:fs';

import type { WebSocketHandler, ServerWebSocket } from 'bun';

// MARK: :constants
const PREFIX_WEBSOCKET = 'WEBSOCKET';
const PREFIX_HTTP = 'HTTP';

// MARK: :types
type CLIValue = string | boolean | number;

// MARK: :state
const CLI_ARGS = {
	port: 19531,
	verbose: false
} as Record<string, CLIValue>;

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

// MARK: :websocket
const websocket_handlers: WebSocketHandler = {
	message(ws: ServerWebSocket, message: string | Buffer) {

	},
	
	open(ws: ServerWebSocket) {
		log_info(`websocket connection established with {${ws.remoteAddress}}`);
		// todo: add this client to websocket maps.
	},

	close(ws: ServerWebSocket, code: number, reason: string) {
		log_info(`client websocket disconnected {${code}} {${reason}}`);
		// todo: remove this client from websocket maps.
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

	if (pathname === '/api/exchange') {
		web_server.upgrade(req);
		return;
	}

	if (node_path.extname(pathname) === '')
		pathname += '.html';

	const file_path = node_path.join('./src/web', pathname);

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
			const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
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

// MARK: :general
function print_service_links(...paths: string[]) {
	let longest_length = 0;
	for (const path of paths)
		longest_length = Math.max(longest_length, path.length);

	log_info('Service links:');
	for (const path of paths)
		log_info(`    {${path.padStart(longest_length, ' ')}} :: {http://localhost:${web_server.port}/${path}}`);
}

/** Returns file size as a human-readable string. Supports up to megabytes. */
function format_file_size(size: number): string {
	if (size < 1024)
		return `${size}b`;

	if (size < 1048576)
		return `${(size / 1024).toFixed(1)}kb`;

	return `${(size / 1048576).toFixed(1)}mb`;
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
const web_server = Bun.serve({
	port: CLI_ARGS.port as number,
	development: false,
	fetch: http_request_handler,
	error: http_error_handler,
	websocket: websocket_handlers
});

log_info(`KruLabs {v${package_json.version}} server initiated on port {${web_server.port}}`);
if (CLI_ARGS.verbose)
	log_warn('Verbose logging enabled (--verbose)');
print_service_links('controller', 'remote', 'projector');