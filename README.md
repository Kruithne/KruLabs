# ⚙️ KruLabs &middot; ![typescript](https://img.shields.io/badge/language-typescript-0176c6) ![bun](https://img.shields.io/badge/runtime-bun-fbf0df) [![license badge](https://img.shields.io/github/license/Kruithne/krulabs?color=blue)](LICENSE)

KruLabs is a bespoke automation system for theatre production.

## ⚠️ Disclaimer

KruLabs is purpose built. It is not intended for general-purpose use and is not supported for such. This project is open-sourced for educational and research purposes. It is not recommended to use this software.

Neither the author nor the contributor of this software are responsible for any damages caused by the use of this software. This software is provided as-is, with no warranty or guarantee of any kind. By using this software you understand the potential risks and assume all responsibility.

## 🛠️ Installation

```bash
# install bun (if not already installed)
powershell -c "irm bun.sh/install.ps1 | iex" # windows
curl -fsSL https://bun.sh/install | bash # linux & macOS

# clone the repository
git clone https://github.com/Kruithne/KruLabs.git
```

### 💡 ETC Integration

```ts
import { connect_etc } from '../krulabs';

const etc = await connect_etc('localhost', 3037);
etc.fire_cue(5);
```

#### Cue Management

```ts
etc.fire_cue(5);
etc.record_cue(5, 'CUE_NAME');
etc.on_cue(5, () => {
	// fires when cue 5 is triggered
});
```

### 🎬 OBS Integration

```ts
import { connect_obs } from '../krulabs';

const obs = await connect_obs('localhost', 4456, 'password');
obs.create_scene('SCENE_A');
```

#### Scene Management

```ts
obs.scene('SCENE_NAME'); // goto
obs.get_current_scene(); // returns scene name
obs.create_scene('SCENE_NAME');
obs.delete_scene('SCENE_NAME');
obs.delete_all_scenes(); // does not delete current scene
obs.rename_scene('OLD_SCENE_NAME', 'NEW_SCENE_NAME');

```

#### Media Playback

```ts
obs.play('SOME_MEDIA.mp4');
obs.play_all();
obs.pause('SOME_MEDIA.mp4');
obs.seek('SOME_MEDIA.mp4', 5000);
obs.seek('SOME_MEDIA.mp4', 5000, true) // modulo seek
obs.seek_all(5000);
obs.seek_all(5000, true); // modulo seek

obs.on_time('SOME_MEDIA.mp4', 5000, () => {
	// fires when SOME_MEDIA.mp4 reaches 5 seconds
});
```
### 📲 Touchpad

```ts
const touchpad = create_touchpad('example');
// accessible at localhost:19531/touchpad/example

touchpad.add('Example Button', () => {
	// triggered on touch
});
```

### 📃 Event Subscription Network

KruLabs exposes a high-speed WebSocket server which acts as a pub-sub event network. This is used by KruLabs interfaces, such as Touchpad and LED Projector, but can also be used for custom or external uses.

```ts
ws_publish('custom:example', {
	// data must be a non-null object or undefined
	pigs: false,
	sheep: ['Barry', 'Bill', 'Ben']
});

ws_subscribe('custom:example', (data, sender) => {
	// all events must use the namespace:event format

	// use ws_send for direct response
	ws_send(sender, 'custom:response', {});
});
```

The server listens on the default KruLabs port (19531) and automatically upgrades connections. A client-side implementation can be found in `/static/js/events.js` for creating custom client-side interfaces.

```js
// always re-subscribe when connecting
events.subscribe('connected', () => {
	events.publish('touchpad:load', { layout: touchpad_name });

	events.subscribe('touchpad:layout', data => {
		state.buttons = data.buttons;
	});
});
```


### 🛠️ Utility

#### Timespan

Returns the given time string in milliseconds, useful for quickly mapping cues using different time formats.

**Basic Usage**

```ts
timespan('30s');     // > 30000
timespan('5m');      // > 300000
timespan('2h');      // > 7200000
```

**Flexible Ordering**

```ts
timespan('1m 30s');  // > 90000
timespan('30s 1m');  // > 90000
```

**Colon Notation**

```ts
timespan('1:30');    // > 90000 (1 minute 30 seconds)
timespan('1:15:45'); // > 4545000 (1 hour 15 minutes 45 seconds)
timespan('5');       // > 300000 (defaults to minutes)
```

**Word Variations**

```ts
timespan('1 minute 30 seconds'); // > 90000
timespan('2min 45sec');          // > 165000
```

**Decimal Support**

```ts
timespan('1.5m');    // > 90000
timespan('2.5h');    // > 9000000
timespan('0.5s');    // > 500
```

**Flexible Separators**

```ts
timespan('1m30s');   // > 90000
timespan('1m:30s');  // > 90000
timespan('1m   30s'); // > 90000
```