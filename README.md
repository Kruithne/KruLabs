# ⚙️ KruLabs &middot; ![typescript](https://img.shields.io/badge/language-typescript-0176c6) ![bun](https://img.shields.io/badge/runtime-bun-fbf0df) [![license badge](https://img.shields.io/github/license/Kruithne/krulabs?color=blue)](LICENSE)

KruLabs is a bespoke automation system for theatre production.

## Disclaimer

KruLabs is purpose built. It is not intended for general-purpose use and is not supported for such. This project is open-sourced for educational and research purposes. It is not recommended to use this software.

## Responsibility
Neither the author nor the contributor of this software are responsible for any damages caused by the use of this software. This software is provided as-is, with no warranty or guarantee of any kind. By using this software you understand the potential risks and assume all responsibility.

## Installation

```bash
# install bun (if not already installed)
powershell -c "irm bun.sh/install.ps1 | iex" # windows
curl -fsSL https://bun.sh/install | bash # linux & macOS

# clone the repository
git clone https://github.com/Kruithne/KruLabs.git
```

## Usage

### ETC Integration

```ts
import { connect_etc } from '../krulabs';

const etc = await connect_etc('localhost', 3037);
etc.fire_cue(5);
```

#### Fire Cue

```ts
etc.fire_cue(5);
```

#### Record Cue

```ts
etc.record_cue(5, 'CUE_NAME');
```

#### Trigger On Cue

```ts
etc.on_cue(5, () => {
	// fires when cue 5 is triggered on the board
});
```

### OBS Integration

```ts
import { connect_obs } from '../krulabs';

const obs = await connect_obs('localhost', 4456, 'password');
obs.create_scene('SCENE_A');
```

#### Scene Creation

```ts
obs.create_scene('SCENE_NAME');
```

#### Trigger Scene Change

```ts
obs.scene('SCENE_NAME');
```

#### Trigger On Media Timestamp

> [!WARN]
> This feature is still experimental.

```ts
obs.on_time('SOME_MEDIA.mp4', 5000, () => {
	// fires when SOME_MEDIA.mp4 reaches 5s
});
```

####

## License
This project is licensed under the MIT license. For more information, please refer to the [LICENSE](LICENSE) file.