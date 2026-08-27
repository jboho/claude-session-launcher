# Project Knowledge — Claude Launcher (claude-session-launcher)

> Bootstrapped by knowledge-bootstrap on 2026-07-24; rewritten 2026-08-08 for the Tauri
> port (the Electron app was retired). Verify against actual code before relying on any detail.

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

`cargo test` needs `dist/` to exist first — `tauri::generate_context!` embeds `frontendDist`
(`../dist`) at compile time, so run `command pnpm build` before `cargo test` in a fresh
checkout/worktree (else it fails with "frontendDist … doesn't exist", not a test failure).

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

## Deployment Pipeline

Distribution = a **macOS DMG built by the Tauri bundler**. No servers.

- **`ci.yml`** — on PRs + pushes to `main`: macOS runner (required — the Rust core uses
  macOS-only tray/window APIs and won't compile on Linux), pnpm 10.33 / Node 20 + Rust
  toolchain, `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm test` → `cargo test
  --manifest-path src-tauri/Cargo.toml`. The merge gate, covering both the TS core and the
  Rust backend that owns launch-argument safety.
- **`release.yml`** — on a `v*` git tag: macOS runner → Rust toolchain → **signed + notarized**
  via `scripts/build-signed.sh` when the repo's signing secrets are set (imports the Developer
  ID cert into a throwaway keychain + decodes the App Store Connect API key; see
  `docs/INSTALL.md` "Releasing (maintainers)" for the exact secret names), else falls back to
  an unsigned `pnpm tauri:build`. DMG attached to the GitHub Release
  (`softprops/action-gh-release`, `contents: write`).
- **Local signed build:** `pnpm tauri:build:signed` (`scripts/build-signed.sh`) — signs with the
  Developer ID auto-discovered from the keychain and, if `.env.signing` holds notary credentials,
  notarizes + staples both the `.app` and the `.dmg`, then verifies. Artifacts land under
  `src-tauri/target/release/bundle/{macos,dmg}/`.

**Release flow:** bump `version` in **both** `package.json` and `src-tauri/tauri.conf.json` →
commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → CI publishes the unsigned DMG. For a signed
+ notarized artifact, build locally with `tauri:build:signed` and upload that DMG. (No release cut
yet; version `0.1.0`.)

**Install:** download the DMG → drag to Applications. See `docs/INSTALL.md`. A notarized DMG opens
cleanly; an unsigned one trips Gatekeeper (right-click → Open, or `xattr -dr com.apple.quarantine`).
A locally-built `.app` carries no quarantine flag.

**Code signing / notarization.** Local builds sign via keychain auto-discovery of the `Developer
ID Application: Jonathan Boho (72FBK9YTA3)` cert (valid to 2027-02-01); Tauri applies the hardened
runtime automatically. Entitlements: `src-tauri/entitlements.plist` (minimal — only
`com.apple.security.automation.apple-events`, for the terminal integration). Notary credentials
live in a gitignored `.env.signing` (see `.env.signing.example`).

**Why signing matters here:** the app's Automation (Apple Events) TCC grant is keyed to the code
signature. A stable Developer ID makes the "control iTerm" grant persist across rebuilds/upgrades;
an unstable identity re-prompts every install.

## Infrastructure

None — this is a desktop app. The only hosted surface is **GitHub Releases** (artifact host) and
**GitHub Actions** (CI/release). No cloud accounts, databases, or services.

## Environment Variables

| Variable | Purpose | Where Set |
|----------|---------|-----------|
| `CLAUDE_LAUNCHER_CONFIG` | Override the config file location (points at a `presets.json`; its dir holds `settings.json`) | user shell / dotfiles |
| `XDG_CONFIG_HOME` | Alternate base for the config dir (else `~/.config`) | user shell |
| `SHELL` | Login shell used for `claude` detection (`$SHELL -lc 'command -v claude'`, falls back to `/bin/zsh`) | OS |
| `APPLE_SIGNING_IDENTITY` | Override the auto-detected Developer ID identity for `build-signed.sh` | shell / `.env.signing` |
| `APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH` | App Store Connect API-key notarization (preferred) | gitignored `.env.signing` |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | App-specific-password notarization (fallback) | gitignored `.env.signing` |
| `GITHUB_TOKEN` | `softprops/action-gh-release` upload | `release.yml` (Actions-provided) |

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

## Operational Knowledge

- **Tray icon is embedded in the binary** — `lib.rs` loads it via `include_bytes!("../icons/trayTemplate.png")` and `icon_as_template(true)` (macOS tints a template image). The app is menu-bar-only (`LSUIElement` in `src-tauri/Info.plist`) — if a notch/menu-bar manager hides the tray icon, the global hotkey (⌥W default) is the only fallback to reopen the panel.
- **Panel size was measured inside the real WKWebView** — the window is 460x640 (`src-tauri/tauri.conf.json`); the settings sheet caps at `max-height:96vh` so its ~595px of content fits without a scrollbar (PR #5). Re-measure in-webview (or against the built renderer at 460x640) before changing either.
- **Tauri serves the whole `dist/` tree** (`frontendDist: "../dist"`) so the renderer's native-ESM module graph (`renderer/panel.js` → `../core/*.js`) resolves. Don't flatten the output.
- **`bridge.ts` calls `window.__TAURI_INTERNALS__.invoke` directly** rather than importing from `@tauri-apps/api/core`: the renderer has no bundler and loads native ES modules, which can't resolve the bare `@tauri-apps/api/core` specifier. The direct call is the same passthrough. Command names + arg keys must match the `#[tauri::command]` signatures in `commands.rs`/`lib.rs`.
- **iTerm AppleScript has two traps** (see `src-tauri/src/applescript.rs`): `current window` is `missing value` when there is no key window (cold start right after `activate`) — reading it fails with `-1728`; and `create tab with default profile` returns `missing value` (does not error) when the target window is hidden/minimized. Never re-derive `current window` after creating — hold what `create …` returned, and treat "no session" as "open a new window".
- **Notarize the DMG separately** — Tauri notarizes + staples the `.app`, then builds the DMG *around* it, so the DMG itself gets no ticket and a *downloaded* DMG trips Gatekeeper. `build-signed.sh` submits + staples the DMG on its own after the Tauri build.
- **This dev environment:** `gh`'s API can time out reaching `api.github.com` → use the GitHub MCP for PRs; SSH `git push` needs the sandbox disabled.
- **Claude Code launch surface** (drives the dials): `claude --model <alias|id> --permission-mode <plan|auto|acceptEdits|dontAsk|manual> --effort <low|medium|high|xhigh|max> [--worktree [name]] [--settings '{"outputStyle":"…"}']`, plus `MAX_THINKING_TOKENS` / `CLAUDE_CODE_FORK_SUBAGENT` as env prefixes on the command. Model aliases include `fable` (`claude-fable-5`). **Haiku 4.5** now accepts `--effort` and `auto` (verified against the installed CLI — the old gating is removed); **Fable** ignores `MAX_THINKING_TOKENS` (drops `budget_tokens` for an explicit think param), so the thinking-budget dial greys out for it. Output style is NOT a flag (`--output-style` does not exist) — it is carried per session via `--settings` inline JSON, and set at rest by the `outputStyle` settings field. `bypassPermissions` is org-locked (MDM) and removed from the UI. No `--fast` launch flag (fast is the in-session `/fast` toggle).

## Cross-Project Relationships

- **Standalone** — no internal package dependencies; the only external "contract" is the `claude`
  CLI's flag surface (above), which the launch string targets.
- Sibling personal macOS tool: a Claude usage widget (separate repo).
