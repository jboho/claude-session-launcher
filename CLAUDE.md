# Project Knowledge — Claude Launcher (claude-session-launcher)

Generic engineering standards live in the global `~/.claude/CLAUDE.md`. Rewritten 2026-08-08 for the Tauri port (the Electron app was retired). Verify against actual code before relying on any detail.

**Cold detail lives in referenced docs — read on demand, not loaded every session:**
- CI, release flow, install, signing/notarization, infrastructure → [`.ai/docs/notes/deployment-and-signing.md`](.ai/docs/notes/deployment-and-signing.md)
- Runtime/build gotchas (tray, panel sizing, renderer module graph, IPC bridge, iTerm AppleScript) → [`.ai/docs/notes/operational-knowledge.md`](.ai/docs/notes/operational-knowledge.md)

## Overview

An open-source **Tauri 2 menu-bar widget** (Rust core + the system WebView) that launches
`claude` CLI sessions in a terminal with **model · permission-mode · effort** (plus working
directory and an inline command/prompt) preselected, via a button-panel UI with saved presets.
It writes a shell command into your terminal — it does not embed the CLI. macOS is the working
platform; a Windows backend is not built yet (see `ROADMAP.md`). Local dir and GitHub repo both
`claude-session-launcher` (`jboho/claude-session-launcher`; renamed from `claude-picker` on
2026-07-28). Licensed Apache-2.0.
_(Source: README.md, ROADMAP.md, package.json, src-tauri/)_

## Common commands

Typed the way I run them. Use `command pnpm` — a shell `pnpm` wrapper misbehaves non-interactively.

```bash
# One TS test file (fast loop):
command pnpm exec vitest run src/core/<file>.test.ts --reporter=dot

# All TS tests:
command pnpm test

# One Rust module's tests:
cargo test --manifest-path src-tauri/Cargo.toml <module>:: 2>&1 | tail -40

# Typecheck / build the frontend (renderer has no test harness — this is its gate):
command pnpm build
```

## Tech Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| Backend | Rust + Tauri | Tauri 2.11 | `src-tauri/` — owns everything touching the shell/filesystem; renders in the OS WebView (WKWebView on macOS), no bundled Chromium/Node |
| Frontend | TypeScript | ^5.6 | `NodeNext` ESM, `"type":"module"` — relative imports use `.js` extensions; framework-free DOM, no bundler |
| Test runners | Vitest + `cargo test` | Vitest ^2.1 | colocated `*.test.ts` (`pnpm test`) for TS core/renderer; `cargo test` for the Rust backend |
| Mutation testing | Stryker + cargo-mutants | Stryker ^9.6 | `@stryker-mutator/*` for the TS core; cargo-mutants for Rust |
| Frontend build | `tsc` + `scripts/copy-assets.mjs` | — | tsc → `dist/{core,renderer}`; copy-assets copies the renderer `index.html` + `panel.css` (the tray icon is embedded in the Rust binary, not copied) |
| Packaging | Tauri bundler | — | macOS `.app` + `.dmg`; local builds signed with Developer ID (Team `72FBK9YTA3`) + notarized via `scripts/build-signed.sh` |
| Package manager | pnpm | 10.33 | use `command pnpm` (a shell `pnpm` wrapper misbehaves non-interactively) |
| CI | GitHub Actions | — | `ci.yml` (macOS runner: frontend build + TS tests + `cargo test`), `release.yml` (tagged Tauri DMG) |

## Architecture

A Tauri app: a **Rust backend** (`src-tauri/`) behind an IPC boundary, a **framework-free
renderer** (`src/renderer/`), and a **shared pure-TS core** (`src/core/`) used by the renderer.

```
src/
  core/       Pure, unit-tested TS domain logic (no Tauri/Electron import) — used by the renderer
              types.ts (Settings/Preset/model capabilities + emptyPreset), validate.ts (model-value
              + preset validation), accelerator.ts (keydown → accelerator string).
              launch-string.ts (POSIX + PowerShell builders + quoting) and claude-binary.ts are
              kept as Windows groundwork — pure and tested, but no live consumer (the launch string
              is built in Rust now; see ROADMAP #2)
  renderer/   The button-panel UI (plain DOM, no framework)
              index.html + panel.css + panel.ts, plus bridge.ts — installs window.launcher
              over Tauri IPC (window.__TAURI_INTERNALS__.invoke)
src-tauri/    Rust backend (the equivalent of the old Electron main process)
  src/lib.rs        app setup, Tray (icon via include_bytes!), frameless panel window, global hotkey, positioning
  src/commands.rs   the #[tauri::command] surface (presets/settings IO, launch, preview, detection, hotkey)
  src/launch.rs     build_launch_string (POSIX) + shell quoting + the charset guard (is_safe_dial/is_safe_model)
  src/applescript.rs  build_mac_script (iTerm/Terminal osascript) + build_ghostty_args + launch_mac
  src/config.rs     presets.json/settings.json IO, config-dir resolution, env
  src/detect.rs     claude + terminal detection (login-shell probe, `open -Ra`)
  src/hotkey.rs     accelerator parsing/registration helpers
  src/position.rs   tray-relative panel positioning
  src/types.rs      LaunchSpec/Preset/Settings (serde, camelCase over the wire)
  src/main.rs       thin binary entry
  tauri.conf.json   window (460x640), bundle targets (dmg, app), CSP, macOS Info.plist/entitlements
  icons/            bundle icons + trayTemplate.png(@2x), embedded via include_bytes!
```

**Key pattern — pure-core + thin-wrapper**, on both sides of the IPC boundary. Anything with
real logic (launch-string assembly, quoting, the charset guard, AppleScript generation,
detection argv, tray-relative positioning, hotkey ordering) is a **pure function** — in Rust
(`src-tauri/src/*.rs`, each with `#[cfg(test)]` tests) or in TS (`src/core/`, Vitest). The impure
edges (`std::process::Command`, `TrayIconBuilder`, the global shortcut) are thin wrappers.

**Shell safety lives in Rust** (the real launch path) and is mirrored in TS (the live preview):
- `src-tauri/src/launch.rs` — `build_launch_string` builds the POSIX command; `is_safe_dial`
  guards mode/effort (charset `[A-Za-z0-9._-]`, no leading `-`), `is_safe_model` additionally
  allows `[ ]` for context-variant ids (e.g. `claude-opus-4-8[1m]`), and `shell_quote_if_needed`
  single-quotes the model token when it isn't bare-safe so brackets reach the shell literally.
  `cmd`/`wd` are single-quoted and `--`-separated (argument-injection guard).
- `src/core/validate.ts` — the model-value charset rule mirrored in TS for the settings editor's
  live validation (the launch-string *preview* is Rust-owned, via the `preview_launch_string`
  command, so it can't drift from what `launch` runs). `launch.rs` and `validate.ts` were updated
  together for `[1m]` in PR #5; keep the charset rule in sync across the two.

**Launch dispatch** (`commands.rs::launch` → `launch.rs` + `applescript.rs`): compose the launch
string, then `launch_mac` opens the terminal — iTerm/Terminal via `osascript`, Ghostty via `open`.
macOS only; there is no Windows backend yet.

**Data layer:** portable JSON only — `presets.json` + `settings.json` in
`~/.config/claude-launcher/` (`CLAUDE_LAUNCHER_CONFIG` / `XDG_CONFIG_HOME` override). No database.
Settings load merges over defaults so new fields migrate silently; the on-disk format is
byte-compatible with what the old Electron app wrote, so existing configs keep working. On first
run (no `presets.json` yet) a starter set is seeded and written — `config.rs::load_or_seed_presets`
/ `starter_presets`, behind the `get_presets` command; an existing (even empty) file is never
re-seeded.

Distribution = a macOS DMG built by the Tauri bundler; no servers. CI (`ci.yml`), tagged release (`release.yml`), local signed builds, install, and signing/notarization are all in the deployment note.

## Environment Variables (runtime)

| Variable | Purpose | Where Set |
|----------|---------|-----------|
| `CLAUDE_LAUNCHER_CONFIG` | Override the config file location (points at a `presets.json`; its dir holds `settings.json`) | user shell / dotfiles |
| `XDG_CONFIG_HOME` | Alternate base for the config dir (else `~/.config`) | user shell |
| `SHELL` | Login shell used for `claude` detection (`$SHELL -lc 'command -v claude'`, falls back to `/bin/zsh`) | OS |

Signing/notarization/CI env vars are in the deployment note.

## Key Conventions

- **TypeScript strict**; `NodeNext` ESM → relative imports carry `.js` extensions even for `.ts` sources.
- **Pure-core + thin-wrapper** on both sides (see Architecture) — put logic where it can be unit-tested; keep `std::process::Command` / `TrayIconBuilder` / `osascript` at the Rust edges, and `execFile`-free pure functions in the TS core.
- **Colocated tests** — TS: `foo.ts` + `foo.test.ts` (Vitest); Rust: `#[cfg(test)] mod tests` in each module (`cargo test`). The renderer (`src/renderer/*`) has no test harness — its logic is pushed into tested `core/` modules; renderer changes are verified by `pnpm build` (tsc) + manual GUI.
- **Shell safety:** mode/effort go **unquoted** (charset-guarded); the model is quoted only when not bare-safe (allows `[1m]`); wd/cmd are quoted and `--`-separated. Enforced in Rust (`launch.rs`) and mirrored in TS (`core/launch-string.ts`, `core/validate.ts`).
- **Git:** feature branch → PR → merge; never commit directly to `main`. Conventional-commit-style titles. Built via brainstorm → spec (`docs/specs/`) → write-plan (`docs/plans/`) → run-plan (per-task spec+quality review) → whole-branch review.
- Use `command pnpm` (not bare `pnpm`).

## Active Development Areas

Roadmap in `ROADMAP.md`.
- **Tauri port** — complete; the Electron app (`src/main/`, `src/preload/`, electron-builder) was
  removed on 2026-08-08. The Rust backend owns the shell/filesystem edges.
- **#2 Windows** — **not built.** The Tauri backend is macOS-only; the old Electron Windows
  groundwork was retired. A Windows port means a Rust Windows launch backend (the PowerShell
  launch-string builder still lives, unused, in `src/core/`).

Contributors: Jonathan Boho (sole author). Release cadence: none yet (no tags; `0.1.0` unreleased).

Runtime/build gotchas (tray, panel sizing, renderer module graph, IPC bridge, iTerm AppleScript, the Claude Code launch-flag surface that drives the dials) are in the operational-knowledge note.

## Cross-Project Relationships

- **Standalone** — no internal package dependencies; the only external "contract" is the `claude`
  CLI's flag surface (above), which the launch string targets.
- Sibling personal macOS tool: a Claude usage widget (separate repo).
