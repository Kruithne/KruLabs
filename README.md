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

## 📔 Usage

### ETC Integration

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

---

### OBS Integration

```ts
import { connect_obs } from '../krulabs';

const obs = await connect_obs('localhost', 4456, 'password');
obs.create_scene('SCENE_A');
```

#### Scene Management

```ts
obs.scene('SCENE_NAME'); // goto
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