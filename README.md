<!-- markdownlint-disable MD033 MD041 -->

<h1 align="center">Claude Session Launcher</h1>

<p align="center">
  <strong>Menu-bar launcher for Claude Code sessions — pick model, mode and effort, then go</strong>
</p>

<p align="center">
  <a href="https://github.com/jboho/claude-session-launcher/actions/workflows/ci.yml"><img src="https://github.com/jboho/claude-session-launcher/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/jboho/claude-session-launcher/releases/latest"><img src="https://img.shields.io/github/v/release/jboho/claude-session-launcher" alt="Latest release" /></a>
  <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black" alt="Tauri 2" /></a>
  <img src="https://img.shields.io/badge/platform-macOS-lightgrey.svg" alt="Platform: macOS" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" /></a>
</p>

<p align="center">
  <sub>In-product name: <em>Claude Launcher</em> · menu bar · presets · one-click launch</sub>
</p>

---

## Overview

**Claude Session Launcher** is a small [Tauri](https://tauri.app/) menu-bar widget that opens a `claude` CLI session in your terminal with **model**, **permission mode** and **effort** already chosen (plus output style, thinking, working directory, worktree and an initial command). Save the combinations you use as named presets and launch them in one click or one hotkey.

It writes a shell command into your terminal. It does not embed or wrap the CLI, so every session is a normal `claude` session.

| Topic            | Links                                              |
| ---------------- | -------------------------------------------------- |
| **License**      | [Apache-2.0](LICENSE)                              |
| **Install**      | [docs/INSTALL.md](docs/INSTALL.md)                 |
| **Security**     | [SECURITY.md](SECURITY.md)                         |
| **Roadmap**      | [ROADMAP.md](ROADMAP.md)                           |
| **Releases**     | [GitHub Releases](https://github.com/jboho/claude-session-launcher/releases) |

## Screenshots

| Launcher                                                                                                         | Settings                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Launcher panel with model, mode, effort, style and think dials, command field, worktree toggle and presets](docs/images/panel.png) | ![Settings screen with terminal choice, model list, working directory, Claude binary and global hotkey](docs/images/settings.png) |

The **launcher** shows the dials, a live preview of the exact command it will run (with a copy button), and your presets underneath. Click a preset to launch it immediately, or use the pencil to load it back into the dials.

The **settings** screen picks your terminal, edits the model list, and sets a default working directory, an optional `claude` binary path and the global hotkey.

## Features

- **Dials for every launch** — Model, Mode (Plan, Auto, Accept, Don't Ask), Effort (Low to Max), output Style and Think. Dials that a model doesn't support are greyed out.
- **Live command preview** — The exact `claude ...` command is shown before you launch it and can be copied. The preview comes from the same Rust code that runs the launch, so it can't drift from what actually runs.
- **Presets** — Save, edit and delete named combinations, including their working directory and command. Starter presets are seeded on first run.
- **Inline command** — Optionally pass a prompt or slash command to run as soon as the session starts.
- **Worktree launch** — Start the session in a new git worktree, named or auto-named.
- **Two ways to summon** — Global hotkey (default **Option+W**, configurable) or the menu-bar icon. The app has no Dock icon.
- **Terminals** — iTerm, Apple Terminal and Ghostty. Only terminals installed on your machine are offered.
- **Custom models** — Edit the model list in Settings; any model id is accepted, including `[1m]` context variants such as `claude-opus-4-8[1m]`.
- **Shell-safe by construction** — Mode and effort are charset-checked, and the working directory and command are quoted and separated with `--`, so a preset can't smuggle in extra arguments.
- **Portable config** — Plain JSON under `~/.config/claude-launcher/`, easy to keep in your dotfiles.

## Install (macOS)

Download the latest **`Claude.Launcher_<version>_aarch64.dmg`** (Apple Silicon) from the [Releases page](https://github.com/jboho/claude-session-launcher/releases) and drag it into Applications. Releases are signed with a Developer ID certificate and notarized by Apple, so the app opens without a Gatekeeper workaround. Full steps and the maintainer release flow are in [docs/INSTALL.md](docs/INSTALL.md).

You need the [`claude` CLI](https://docs.claude.com/en/docs/claude-code/overview) installed separately. The launcher finds it with a login-shell `command -v claude`, so it matches your terminal's own PATH.

## Requirements (to build from source)

- **[Node.js](https://nodejs.org/)** 20+
- **[pnpm](https://pnpm.io/)** 10.x
- **Rust + macOS prerequisites** for `pnpm tauri:dev` and `pnpm tauri:build` — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Quick start

```bash
git clone https://github.com/jboho/claude-session-launcher.git
cd claude-session-launcher
pnpm install
pnpm tauri:dev
```

## Project scripts

| Script                   | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `pnpm build`             | Typecheck and build the frontend (`dist/`)                 |
| `pnpm test`              | Unit tests ([Vitest](https://vitest.dev/))                 |
| `pnpm test:watch`        | Vitest watch mode                                          |
| `pnpm tauri:dev`         | Build the frontend, then run the app with hot reload       |
| `pnpm tauri:build`       | Build the `.app` and `.dmg`                                |
| `pnpm tauri:build:signed`| Developer ID signed and notarized build (see INSTALL.md)   |

Rust tests run with `cargo test --manifest-path src-tauri/Cargo.toml`. Run `pnpm build` first in a fresh checkout, because the Tauri build embeds `dist/` at compile time.

## Configuration

| File                                    | Holds                                                |
| --------------------------------------- | ---------------------------------------------------- |
| `~/.config/claude-launcher/presets.json`  | Your saved presets                                   |
| `~/.config/claude-launcher/settings.json` | Terminal, models, hotkey, binary path, defaults      |

Set `CLAUDE_LAUNCHER_CONFIG=/path/to/presets.json` to move the config (its folder also holds `settings.json`), or use `XDG_CONFIG_HOME`. Settings keys of note:

- `claudeBinary` — explicit path to `claude`. Leave blank to auto-detect.
- `models` — your own list of `{ value, label }` entries. Leave empty for the built-in defaults. Custom values are unrestricted; known families (for example Haiku) still grey out the dials they don't support.
- `hotkey` — the global summon shortcut, set with the recorder in Settings. Defaults to `Alt+W` if unset or unavailable.

## Tech stack

| Layer    | Details                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| Backend  | Rust, Tauri 2 — launch-string builder, AppleScript/terminal dispatch, tray, hotkey   |
| Frontend | TypeScript, plain DOM (no framework), shared pure-TS core                            |
| Testing  | Vitest, `cargo test`, Stryker and cargo-mutants for mutation testing                 |
| CI       | GitHub Actions — build and tests on macOS; tagged releases build the signed DMG      |

## Platform support

macOS only for now. A Windows or Linux build would need its own launch backend; see the [roadmap](ROADMAP.md).

## Security

Please report vulnerabilities privately through [GitHub's security advisory form](https://github.com/jboho/claude-session-launcher/security/advisories/new). See [SECURITY.md](SECURITY.md) for what counts.

## License

Published under the [Apache-2.0 License](LICENSE). Not affiliated with or endorsed by Anthropic; it launches the `claude` CLI, which you install and license separately.
