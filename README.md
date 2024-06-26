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

```bash
bun run krulabs
```

## Port

By default, the KruLabs interface is hosted on port `19531`. A different port can be specified by setting the `--port` argument.

```bash
bun run krulabs --port=4040
```

## License
This project is licensed under the MIT license. For more information, please refer to the [LICENSE](LICENSE) file.