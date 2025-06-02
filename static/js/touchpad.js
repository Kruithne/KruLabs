import { SocketInterface } from './socket.js'

const socket = new SocketInterface('touchpad');
socket.on('load', data => {
	console.log({ data });
});