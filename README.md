# ⚙️ KruLabs &middot; ![typescript](https://img.shields.io/badge/language-typescript-0176c6) ![bun](https://img.shields.io/badge/runtime-bun-fbf0df) [![license badge](https://img.shields.io/github/license/Kruithne/krulabs?color=blue)](LICENSE)

KruLabs is a bespoke automation system for theatre production.

## Disclaimer
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

```bash
bun run krulabs
```

## Configuration

Configuration must be defined in `config.json` in the root of the project. If the file does not exist, it will be created with default values when running KruLabs.

If the configuration file fails to pass, contains unknown entries, or existing entries are not of the expected type, KruLabs will substitute the invalid entries with default values, but will not correct the file itself.

Below is a complete overview of available configuration with the internal defaults.

```json
// NOTE: comments here are for documentation and are not valid JSON
{
	"web_server": {
		"port": 0 // if set to 0, a random port will be selected
	}
}
```

## License
This project is licensed under the MIT license. For more information, please refer to the [LICENSE](LICENSE) file.