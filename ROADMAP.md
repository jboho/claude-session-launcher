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

---

## #3 — Make it work for anyone (generality)

- **Detect `claude` on PATH**; add a Settings field for the claude binary path; friendly "Claude Code not found — install it" guidance when missing.
- **Detect installed terminals** per-OS and show only those (don't offer iTerm on a machine without it).
- **Configurable model list** — not hardcoded `opus`/`sonnet`/`haiku`; allow `fable` / full model IDs.
- **Configurable global hotkey** in Settings (⌥W is the default).
- Starter presets carry **no hardcoded paths** (done — working dir left blank).

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
