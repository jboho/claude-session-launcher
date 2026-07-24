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
- **#4 — Distribution (internal):**
  - Real app icon (bolt → `.icns` via electron-builder) and a menu-bar bolt template PNG (`assets/trayTemplate.png` + `@2x`, replacing the old baked-in data-URL).
  - electron-builder builds an **unsigned macOS DMG** (`Claude-Launcher-<version>-<arch>.dmg`); GitHub Actions run build+test on every PR (`ci.yml`) and publish the DMG to a GitHub Release on a `v*` tag (`release.yml`).
  - `docs/INSTALL.md` covers download + the Gatekeeper bypass for the unsigned build.
  - *Deferred:* code signing + Apple notarization (removes the Gatekeeper prompt); auto-update (`electron-updater` needs macOS signing to work); Windows CI artifacts (need the Windows spawner below).

---

## #2 — Windows support (LAST) — groundwork laid; needs a real Windows machine to verify

**Groundwork done** (built + unit-tested on macOS, inert behind the `win32` platform switch so the macOS path is unaffected):

- **Windows-safe launch string** — `buildWinLaunchString` uses PowerShell semantics (`Set-Location '<wd>'; claude …`, `;`-sequenced) with `psQuote` quoting, instead of the POSIX `cd '…' && …` form; `resolveClaudeCommandWin` ps-quotes a configured binary path.
- **Windows spawner** — `spawn/windows.ts` (`buildWtArgs` + `launchWin`) targets Windows Terminal (`wt`) → PowerShell; `launchSpec` now dispatches `win32` to it.
- **Windows default hotkey** — `defaultHotkey()` returns `Control+Alt+C` on Windows (Alt+W collides with menu mnemonics there).

**Still needs a real Windows machine** (unverified / not built):

- Verify the actual `wt` / PowerShell spawn (that a visible window opens; quoting through the shell); build a no-`wt` fallback.
- **Windows tray icon** — colored `.ico` (Windows tray isn't a template image) and panel positioning for the bottom-right tray.
- Windows terminal detection in Settings (current detection is macOS `open -Ra`).
- CI Windows artifacts + an end-to-end run on Windows.
- Config paths already handle `%APPDATA%`.

---

## Parked

- **Warp** — no supported way to auto-run a command on launch (no `-e`, no CLI); would only open a blank window. Dropped.
