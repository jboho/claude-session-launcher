# Claude Launcher — Roadmap

**Where we are:** working v1 on macOS — a Claude-branded menu-bar/dock widget that
launches `claude` CLI sessions with model / mode / effort (+ working dir + command)
preselected, with saved presets. **Goal:** an internal cross-platform product (macOS
first, then Windows) that anyone on the team can install and use.

---

## Done

- Button-panel UI: Model / Mode / Effort dials, live launch-string preview, presets lane, Settings overlay
- Claude branding: orange accent, sunburst mark, serif title
- Three ways to summon: **⌥W** global hotkey · menu-bar icon · Dock icon (+ tray click)
- Model-aware dials: Haiku greys out Effort + Auto
- Modes: Plan · Auto · Accept (Manual = default when none selected); Bypass removed (org-locked)
- Presets: save, delete, ✎ load-into-composer; **starter presets** seeded on first run
- Inline command/prompt field (per-launch)
- Terminals: iTerm (new tab) · Apple Terminal · Ghostty
- macOS packaging: unsigned `.app` via `pnpm dist:mac` (electron-builder)
- Portable JSON config (`~/.config/claude-launcher/`, `%APPDATA%` on Windows; `CLAUDE_LAUNCHER_CONFIG` override)
- **#3 — Make it work for anyone (generality):**
  - `claude` binary detection via a login-shell `command -v claude` probe (matches the terminal's own PATH); a "Claude not found" banner shows only when detection fails **and** no override is set; an optional "Claude binary" path field in Settings — when set, its shell-quoted value is used in the launch string in place of bare `claude`.
  - Terminal detection: only installed terminals (iTerm / Apple Terminal / Ghostty, probed via `open -Ra`) are offered in Settings; falls back to Terminal, which always ships with macOS.
  - Configurable model list: an editable Models list in Settings (value + label rows, add/remove); unknown/custom model values are unrestricted, while known families (Haiku, including dated ids like `claude-haiku-…`) still grey out Effort + Auto. Model values are validated against a shell-safe charset (`[A-Za-z0-9._-]+`) since they're written unquoted into the launch string.
  - Configurable global hotkey: a recorder control in Settings; default remains Option+W (`Alt+W`); registered from saved settings at startup with a same-key/default fallback, and re-registered live from Settings with honest feedback on which accelerator actually ended up active.
  - Starter presets carry **no hardcoded paths** (done — working dir left blank).
  - *Deferred:* no dedicated model-version-picker UI — the model list still takes free-text aliases/full dated ids, not a curated version selector. `[1m]` bracket context-variants (e.g. `opus[1m]`) are **not** supported — the model-value validator intentionally rejects brackets, since that would require the model token to be quoted in the launch string, which is unimplemented.

---

## #4 — Distribution (internal for now)

- **Internal distribution** — share the unsigned build (or push via Jamf/MDM, which can trust it); public code-signing deferred.
  - *If it goes public later:* Apple notarization (Apple Developer account, ~$99/yr) + a Windows code-signing cert. Without these, Gatekeeper/SmartScreen warn end users.
- **Auto-update** — electron-updater against a release host (GitHub Releases or an internal channel).
- **Repo + CI** — remote repo (pending — Jonathan to provide) + README + GitHub Actions building macOS + Windows artifacts on tag.
- **App icon** — `.icns` (mac) / `.ico` (win) from a 512px+ source; menu-bar icon = user-provided template PNG (~22×22 black-on-transparent + @2x).

## #2 — Windows support (LAST)

- **Terminal spawner** for Windows Terminal (`wt`) / PowerShell — plus a **Windows-safe launch string** (the current POSIX single-quote + `&&` form won't work in cmd/PowerShell; needs a per-OS quoting path). Must be built + verified on a real Windows machine.
- **Windows tray icon** — colored `.ico` (Windows tray isn't a template image) and panel positioning for the bottom-right tray.
- **Windows-appropriate default hotkey** (Alt+W is a poor default there).
- Config paths already handle `%APPDATA%`.

---

## Parked

- **Warp** — no supported way to auto-run a command on launch (no `-e`, no CLI); would only open a blank window. Dropped.
