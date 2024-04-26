import { document_ready } from './util.js';

document_ready().then(() => {
	document.getElementById('test').innerHTML = 'Hello, controller!';
});