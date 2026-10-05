# Claude Launcher — Roadmap

**Where we are:** working v1 on macOS — a Claude-branded menu-bar/dock widget that
launches `claude` CLI sessions with model / mode / effort (+ working dir + command)
preselected, with saved presets. **Goal:** an internal cross-platform product (macOS
first, then Windows) that anyone on the team can install and use.

---

## Done

- Button-panel UI: Model / Mode / Effort dials, live launch-string preview, presets lane, Settings overlay
- Claude branding: orange accent, sunburst mark, serif title
- Two ways to summon: **⌥W** global hotkey · menu-bar icon (+ tray click); no Dock icon (Accessory activation policy)
- Model-aware dials: Haiku greys out Effort + Auto
- Modes: Plan · Auto · Accept (Manual = default when none selected); Bypass removed (org-locked)
- Presets: save, delete, ✎ load-into-composer; **starter presets** seeded on first run
- Inline command/prompt field (per-launch)
- Terminals: iTerm (new tab) · Apple Terminal · Ghostty
- macOS packaging: signed + notarized `.app`/`.dmg` via `pnpm tauri:build:signed` (Tauri bundler)
- Portable JSON config (`~/.config/claude-launcher/`, `%APPDATA%` on Windows; `CLAUDE_LAUNCHER_CONFIG` override)
- **#3 — Make it work for anyone (generality):**
  - `claude` binary detection via a login-shell `command -v claude` probe (matches the terminal's own PATH); a "Claude not found" banner shows only when detection fails **and** no override is set; an optional "Claude binary" path field in Settings — when set, its shell-quoted value is used in the launch string in place of bare `claude`.
  - Terminal detection: only installed terminals (iTerm / Apple Terminal / Ghostty, probed via `open -Ra`) are offered in Settings; falls back to Terminal, which always ships with macOS.
  - Configurable model list: an editable Models list in Settings (value + label rows, add/remove); unknown/custom model values are unrestricted, while known families (Haiku, including dated ids like `claude-haiku-…`) still grey out Effort + Auto. Model values are validated against a shell-safe charset (`[A-Za-z0-9._-]+`) since they're written unquoted into the launch string.
  - Configurable global hotkey: a recorder control in Settings; default remains Option+W (`Alt+W`); registered from saved settings at startup with a same-key/default fallback, and re-registered live from Settings with honest feedback on which accelerator actually ended up active.
  - Starter presets carry **no hardcoded paths** (done — working dir left blank).
  - `[1m]` bracket context-variants (e.g. `claude-opus-4-8[1m]`) **are** supported (PR #5): the model-value charset allows `[`/`]` and the launch-string builders (TypeScript preview + Rust launch backend) single-quote the model token when it isn't a bare-safe id, so the brackets reach the shell literally instead of glob-expanding.
  - *Deferred:* no dedicated model-version-picker UI — the model list still takes free-text aliases/full dated ids, not a curated version selector.
- **#4 — Distribution (internal):**
  - Real app icon (bolt → `.icns`) and a menu-bar bolt template PNG, embedded in the Rust binary (`src-tauri/icons/`, via `include_bytes!`).
  - The **Tauri bundler** builds the macOS `.app` + `.dmg`. Local builds are **signed with a Developer ID and notarized + stapled** via `scripts/build-signed.sh` (`pnpm tauri:build:signed`, credentials in a gitignored `.env.signing`). GitHub Actions run build+test on every PR (`ci.yml`) and, on a `v*` tag, build a **signed + notarized** Tauri DMG and attach it to a GitHub Release (`release.yml`; falls back to unsigned if the signing secrets are empty, so spctl-check every release).
  - `docs/INSTALL.md` covers download, the Gatekeeper story (notarized opens cleanly; unsigned needs the quarantine bypass), and local/CI release.
  - *Deferred:* auto-update; Windows CI artifacts (need a Tauri Windows backend — see below).

- **#5 — Public release (v1.0.0, 2026-10-05):** repo scrubbed and recreated (old history kept in a private archive), v1.0.0 signed + notarized in CI, repo public with secret scanning, push protection, CodeQL, Dependabot and a squash-only ruleset. README restructured (#9); CodeQL alert fixed (#8).

---

## Follow-ups

- [ ] Close Dependabot alert #5 (`qs`) with a pnpm `overrides: qs: ^6.16.0` entry in `pnpm-workspace.yaml`; blocked by the safe-pnpm age gate until after 2026-10-06 09:45 UTC

---

## #2 — Windows support (LAST) — needs a Tauri Windows backend + a real Windows machine

The Tauri migration retired the Electron app, and with it the Electron-side Windows
groundwork (`src/main/spawn/windows.ts` and the `win32` branch of the launch dispatcher,
the Windows `defaultHotkey()` default). A Windows port now means adding a **Windows backend
in `src-tauri/`** (the Rust launch path is macOS-only today).

**What survives** (pure, still unit-tested in `src/core/`, no consumer yet):

- **Windows-safe launch string** — `buildWinLaunchString` uses PowerShell semantics
  (`Set-Location -LiteralPath '<wd>'; claude …`, `;`-sequenced) with `psQuote`/`psQuoteIfNeeded`
  quoting instead of the POSIX `cd -- '…' && …` form; `resolveClaudeCommandWin` ps-quotes a
  configured binary path. Whichever backend runs Windows can port this logic to Rust (as the
  macOS launch string was) or call into it.

**Still needed:**

- A Rust Windows launch backend: spawn Windows Terminal (`wt`) → PowerShell (plus a no-`wt`
  fallback), a Windows default hotkey, and Windows terminal detection (macOS detection is `open -Ra`).
- **Windows tray icon** — colored `.ico` (Windows tray isn't a template image) and panel
  positioning for the bottom-right tray.
- CI Windows artifacts + an end-to-end run on a real Windows machine.
- Config paths already handle `%APPDATA%`.

---

## Parked

- **Warp** — no supported way to auto-run a command on launch (no `-e`, no CLI); would only open a blank window. Dropped.
