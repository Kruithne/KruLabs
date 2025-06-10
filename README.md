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
etc.set_cue_list(2); // set cue list to use
etc.fire_cue(5);
etc.record_cue(5, 'CUE_NAME');
etc.on_cue(5, () => {
	// fires when cue 5 is triggered
});
```

#### Fixtures
```ts
etc.intensity(50, 100); // Chan 50 @ 100
etc.color(50, 'red'); // see 🎨 Colour section
etc.param(50, 'fog', 100); // Chan 50 Fog @ 100
```

#### Direct OSC

```ts
etc.command('/chan/50/param/pan/tilt', 45, 90);
// see: https://www.etcconnect.com/WorkArea/DownloadAsset.aspx?id=10737502837
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

### 📽️ VLC Integration

```ts
import { connect_vlc } from '../krulabs';
const vlc = await connect_vlc('password', 8080);
```

#### API
```ts
vlc.resume();
vlc.pause();
vlc.volume(50); // 50%

await vlc.fade(
	100, // from pct
	0, // to pct
	10000, // duration ms
	20 // steps
);

vlc.command('pl_next'); // send direct commands
// see: https://github.com/videolan/vlc/blob/master/share/lua/http/requests/README.txt
```

### 🎨 Colour

Numerous interfaces in KruLabs accept colour input. These inputs can be specified in the following formats.

```ts
example('red'); // standard CSS color names
example(0xff0000); // numbers
example('#f00'); // hex strings
example('rgb(255, 0, 0)'); // RGB strings
example('rgba(255, 0, 0, 1)'); // RGBA strings
example('hsl(0, 100%, 50%)'); // HSL strings
example('hsla(0, 100%, 50%, 1)'); // HSLA strings
example({ r: 255, g: 0, b: 0 }); // RGB objects
example({ r: 255, g: 0, b: 0, a: 1 }); // RGBA objects
example([255, 0, 0]); // RGB arrays
example([255, 0, 0, 255]); // RGBA arrays
example('lab(50% 50% 50%)'); // LAB strings
```

### 📲 Touchpad

```ts
const touchpad = create_touchpad('example');
// accessible at localhost:19531/touchpad/example

touchpad.press('Button', () => {
	// button pressed
});

touchpad.toggle('Toggle', () => {
	// button toggled on
}, () => {
	// button toggled off
});

touchpad.hold('Hold', () => {
	// button held
}, () => {
	// button released
});
```
Buttons can be optionally coloured using any supported colour input as documented in the [Colour](#-colour) section.

```ts
touchpad.add('Red Button', () => {}, 'red');
```


### 💡 LED Projector

KruLabs provides an LED projector interface system. This allows the creation and control of realtime digital LED fixtures.

These can be used directly as a full projection, or integrate as a browser source into projection software such as OBS.

```ts
const led = create_led_projection('example');
// available at localhost:19531/led/example
```
All colour inputs for LED functions are documented in the [Colour](#-colour) section.

#### LED API

```ts
led.layout(
	30, // grid_x
	30, // grid_y
	0.3 // cell_size
);

led.color('red'); // static color
led.fade_in(1000); // fade in over 1 second
led.fade_out(1000); // fade out over 1 second

led.wave(
	'red', // primary color 
	'white', // secondary color
	60, // rotation (degrees)
	90, // speed
	true // sharp
);

led.chase(
	['red', 'orange', 'yellow', 'green', 'blue'], // colour array
	1000, // interpolation or snap time
	false // if true, colours interpolate, otherwise snap
);

led.swirl(
	'black', // primary color
	'white', // secondary color
	0.5, // threshold
	1, // speed
	0.2, // swirl factor
	true // clockwise
);

led.voronoi(
	'red', // primary color
	'white', // secondary color
	'Y+', // X+, X-, Y+, Y-
	1, // speed
	0.35, // threshold
	'minkowski' // minkowski, euclidean, manhattan, chebyshev
);

led.rings(
	'red', // primary color
	'white', // secondary color
	2.6, // speed
	true, // outward
	0.5 // threshold
);

led.rain(
	'white', // primary color
	'black', // secondary color
	0.4, // speed
	0.1, // direction X
	5, // direction Y
	80 // columns
);
```
#### LED Editor

In addition to the LED fixture interface, KruLabs also exposes the an editor on `localhost:19351/led_edit/` which can be used to directly address LED fixtures created with `create_led_projection()` for rapid prototyping.

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


## 🛠️ Utility

### Track

Fires a series of callbacks sequentially with a specified delay between each.

```ts
await track([
	() => console.log('One'),
	() => console.log('Two'),
	() => console.log('Three')
], 500);

// One -> 500ms -> Two -> 500ms -> Three -> resolves
```

### Timespan

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