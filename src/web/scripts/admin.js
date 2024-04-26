import { document_ready } from './util.js';
import { createApp } from './vue.js';

document_ready().then(() => {
	document.getElementById('test').innerHTML = 'Hello, admin!';
});