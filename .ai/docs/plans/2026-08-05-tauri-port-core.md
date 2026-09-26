# Tauri Port — Plan 1: Rust Core + Working App

> **Execution:** hand off to the `run-plan` skill to implement this task-by-task (fresh subagent per task + spec/quality review). Steps use `- [ ]` checkboxes for tracking.

**Goal:** A Tauri 2 build of Claude Launcher that launches a real `claude` session from the menu bar — tray, hotkey, panel positioning, presets — with the shell-safety layer living in Rust behind the IPC boundary, running side-by-side with the existing Electron app.

**Architecture:** Add `src-tauri/` alongside the untouched Electron `src/main`, `src/preload`. The Rust side owns everything that touches the shell or the filesystem: config IO, launch-string assembly, the charset guard, AppleScript generation, tray-relative positioning, and hotkey registration. Each of those is a pure function in its own module with `#[cfg(test)]` tests, wrapped by a thin `#[tauri::command]` or event handler — the same pure-core/thin-wrapper split the TypeScript already uses. The renderer keeps its DOM/CSS but swaps `window.launcher`'s implementation from `ipcRenderer.invoke` to Tauri's `invoke`; because the launch string is now built in Rust, the preview comes back from a command instead of being rebuilt in the webview, which removes the duplicate-builder drift risk.

**Tech stack:** Tauri 2.11, Rust 2021, `tauri-plugin-global-shortcut` 2.3, `tauri-plugin-opener` 2, serde/serde_json, existing TypeScript renderer built by `tsc` + `scripts/copy-assets.mjs`.

**Worktree:** `/path/to/worktree`, branch `feat/tauri-port`. All paths below are relative to it.

---

## Verified API facts

These were confirmed against the vendored crate source at
`~/.cargo/registry/src/index.crates.io-*/tauri-2.11.3/` and `docs.rs`, not from memory. Do not
"fix" them to something that looks more familiar.

| Fact | Source |
|---|---|
| `TrayIconEvent::Click { id, position: PhysicalPosition<f64>, rect: Rect, button, button_state }` | `tauri-2.11.3/src/tray/mod.rs:74` |
| `Rect { position: dpi::Position, size: dpi::Size }` | `tauri-runtime-2.11.3/src/dpi.rs:10` |
| `Monitor::work_area(&self) -> &PhysicalRect<i32, u32>` — the menu-bar-excluded area, equivalent to Electron's `screen.getPrimaryDisplay().workArea` | `tauri-2.11.3/src/window/mod.rs:96` |
| `WebviewWindow::{outer_size, set_position, current_monitor, primary_monitor}` | `tauri-2.11.3/src/webview/webview_window.rs:1724,2255,1812,1819` |
| `WindowEvent::Focused(bool)` | `tauri-runtime-2.11.3/src/window.rs:45` |
| `AppHandle::set_activation_policy(ActivationPolicy) -> Result<()>` | `tauri-2.11.3/src/app.rs:640` |
| `GlobalShortcut::on_shortcut<S, F>(&self, shortcut: S, handler: F) -> Result<()>` where `F: Fn(&AppHandle<R>, &Shortcut, ShortcutEvent) + Send + Sync + 'static` | docs.rs `tauri-plugin-global-shortcut` 2.3.2 source |
| `GlobalShortcut::is_registered<S>(&self, shortcut: S) -> bool` | same |

**Unverified, and Task 8 exists to pin it:** whether Tauri's `Shortcut` string parser accepts the
Electron-style accelerators this app already stores (`"Alt+W"`, `"Control+Alt+C"`). Tauri may
require `Code`-style names (`"Alt+KeyW"`). Task 8 asserts the real behavior in a test before any
code depends on it.

## Reference implementation

`/path/to/koll/src-tauri/` is a working Tauri 2 menu-bar app by the same author. Copy its
patterns for: `TrayIconBuilder` + `icon_as_template(true)` + click debounce (`lib.rs:831-871`),
`#[tauri::command]` + serde config structs (`lib.rs:213-230`), and `bundle.macOS.signingIdentity`
in `tauri.conf.json`. It does **not** solve tray-relative positioning, global shortcuts, dock
hiding, or blur-to-hide — those are new here.

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `src-tauri/Cargo.toml` | Crate manifest, deps |
| `src-tauri/build.rs` | `tauri_build::build()` |
| `src-tauri/tauri.conf.json` | Window, bundle, CSP, signing |
| `src-tauri/capabilities/default.json` | Permission set for the panel window |
| `src-tauri/entitlements.plist` | Apple Events entitlement (hardened runtime) |
| `src-tauri/src/main.rs` | Binary entry; delegates to `lib.rs` |
| `src-tauri/src/lib.rs` | App setup: tray, panel window, hotkey, activation policy, event wiring |
| `src-tauri/src/types.rs` | `Preset`, `Settings`, `LaunchSpec` serde structs + lenient string coercion |
| `src-tauri/src/config.rs` | Config paths + presets/settings load/save |
| `src-tauri/src/launch.rs` | `SAFE_DIAL` guard, `shell_quote`, `build_launch_string` |
| `src-tauri/src/applescript.rs` | `osa_quote`, `build_mac_script`, `build_ghostty_args`, spawn |
| `src-tauri/src/position.rs` | Tray-relative panel position + work-area clamp |
| `src-tauri/src/hotkey.rs` | Default hotkey, candidate ordering, Tauri shortcut translation |
| `src-tauri/src/detect.rs` | `claude` detection + installed-terminal probe |
| `src-tauri/src/commands.rs` | `#[tauri::command]` handlers |
| `src/renderer/bridge.ts` | `window.launcher` implemented over Tauri `invoke` |

**Modified:** `src/renderer/panel.ts` (preview via command, import the bridge), `package.json`
(Tauri scripts + `@tauri-apps/api`), `.gitignore` (`src-tauri/target/`).

**Untouched in this plan:** everything under `src/main/`, `src/preload/`, and the Electron build.
The Electron app must still run at the end of Plan 1. Deleting it is Plan 2.

**Deleted in this plan:** nothing.

---

### Task 1: Scaffold the Tauri crate

Non-testable scaffolding — no test steps. Verification is that it compiles.

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Modify: `.gitignore`

- [ ] **Step 1: Confirm the Rust toolchain exists**

Run: `cargo --version && rustc --version`
Expected: both print versions. If not: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

- [ ] **Step 2: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "claude-launcher"
version = "0.1.0"
description = "Launch Claude Code CLI sessions from the menu bar"
authors = ["Jonathan Boho"]
license = "Apache-2.0"
edition = "2021"
rust-version = "1.77"

[lib]
name = "claude_launcher_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2.11", features = ["tray-icon"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 3: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Create `src-tauri/src/main.rs`**

```rust
// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claude_launcher_lib::run()
}
```

- [ ] **Step 5: Create a minimal `src-tauri/src/lib.rs`**

```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Add `src-tauri/target/` to `.gitignore`**

Append to `.gitignore`:

```
src-tauri/target/
```

- [ ] **Step 7: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: `Finished` — it will fail on a missing `tauri.conf.json`; that is Task 2. If the error is
anything else, fix it before continuing.

- [ ] **Step 8: Commit**

```bash
git add src-tauri .gitignore
git commit -m "feat(tauri): scaffold the Rust crate"
```

---

### Task 2: Tauri config, capabilities, and entitlements

Non-testable config — no test steps.

**Files:**
- Create: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/entitlements.plist`

- [ ] **Step 1: Create `src-tauri/tauri.conf.json`**

`frontendDist` points at the existing `dist/` that `tsc` + `copy-assets.mjs` already produce, so no
Vite is introduced. `visible: false` because the panel is shown by the tray/hotkey, positioned
first. The CSP mirrors the one already verified in the Electron renderer, plus the `ipc:` origins
Tauri needs for `invoke`.

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "Claude Launcher",
  "version": "0.1.0",
  "identifier": "com.jboho.claude-launcher",
  "build": {
    "frontendDist": "../dist/renderer",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "label": "panel",
        "title": "Claude Launcher",
        "width": 460,
        "height": 620,
        "resizable": false,
        "decorations": false,
        "visible": false,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src ipc: http://ipc.localhost; base-uri 'none'; form-action 'none'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns"],
    "macOS": {
      "entitlements": "entitlements.plist",
      "signingIdentity": "Developer ID Application: Jonathan Boho (72FBK9YTA3)",
      "minimumSystemVersion": "10.15"
    }
  }
}
```

- [ ] **Step 2: Create `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Panel window permissions",
  "windows": ["panel"],
  "permissions": [
    "core:default",
    "opener:allow-open-url",
    "global-shortcut:default"
  ]
}
```

- [ ] **Step 3: Create `src-tauri/entitlements.plist`**

Carried over from `build/entitlements.mac.plist`. Without the Apple Events entitlement under the
hardened runtime, `osascript` is blocked outright and the consent prompt never appears — this was
learned the hard way on the Electron build (see `CLAUDE.md`, "Why signing mattered here").

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
</plist>
```

- [ ] **Step 4: Add the usage description**

`NSAppleEventsUsageDescription` must be in the bundled Info.plist or macOS kills the Apple Event
without prompting. Add to `tauri.conf.json` under `bundle.macOS`:

```json
      "infoPlist": {
        "LSUIElement": true,
        "NSAppleEventsUsageDescription": "Claude Launcher opens your terminal to start a Claude session."
      }
```

- [ ] **Step 5: Copy the icons**

```bash
mkdir -p src-tauri/icons
cp build/icon.png src-tauri/icons/icon.png
cp assets/trayTemplate.png src-tauri/icons/trayTemplate.png
cp assets/trayTemplate@2x.png src-tauri/icons/trayTemplate@2x.png
pnpm dlx @tauri-apps/cli icon src-tauri/icons/icon.png --output src-tauri/icons
```

Expected: generates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`.

- [ ] **Step 6: Verify**

Run: `cd src-tauri && cargo check`
Expected: `Finished`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri
git commit -m "feat(tauri): app config, capabilities, and Apple Events entitlement"
```

---

### Task 3: Types with lenient string coercion

The TypeScript `normalizeSettings` tolerates a hand-edited config where a field is the wrong JSON
type — it coerces to blank rather than throwing, because `presets.json` is documented as
dotfile-synced. Plain `#[serde(default)]` does **not** do this: serde errors on a type mismatch and
the whole file fails to load. The `lenient_string` deserializer preserves today's behavior.

**Files:**
- Create: `src-tauri/src/types.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/types.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_string_fields_coerce_to_blank_instead_of_failing_the_load() {
        let s: Settings = serde_json::from_str(r#"{"claudeBinary": 42, "terminal": "Ghostty"}"#).unwrap();
        assert_eq!(s.claude_binary, "");
        assert_eq!(s.terminal, "Ghostty");
    }

    #[test]
    fn missing_fields_take_defaults() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.terminal, "iTerm");
        assert_eq!(s.models.len(), 0);
        assert_eq!(s.hotkey, "");
    }

    #[test]
    fn unknown_keys_are_ignored() {
        let s: Settings = serde_json::from_str(r#"{"evil": "payload", "wd": "~/Code"}"#).unwrap();
        assert_eq!(s.wd, "~/Code");
    }

    #[test]
    fn preset_fields_coerce_the_same_way() {
        let p: Preset = serde_json::from_str(r#"{"name": 42, "model": null, "id": "a"}"#).unwrap();
        assert_eq!(p.name, "");
        assert_eq!(p.model, "");
        assert_eq!(p.id, "a");
    }

    #[test]
    fn model_entries_survive_a_round_trip() {
        let s: Settings = serde_json::from_str(r#"{"models":[{"value":"opus","label":"Opus"}]}"#).unwrap();
        assert_eq!(s.models[0].value, "opus");
        assert_eq!(s.models[0].label, "Opus");
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test types::`
Expected: FAIL — `cannot find type Settings in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/types.rs`:

```rust
use serde::{Deserialize, Deserializer, Serialize};

/// Deserialize a string, coercing any other JSON type to "" instead of erroring.
/// presets.json/settings.json are hand-editable and dotfile-synced, so one bad field
/// must not take the whole file down.
fn lenient_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(match value {
        serde_json::Value::String(s) => s,
        _ => String::new(),
    })
}

fn default_terminal() -> String {
    "iTerm".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelOption {
    #[serde(default, deserialize_with = "lenient_string")]
    pub value: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_terminal", deserialize_with = "lenient_string")]
    pub terminal: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub claude_binary: String,
    #[serde(default)]
    pub models: Vec<ModelOption>,
    #[serde(default, deserialize_with = "lenient_string")]
    pub hotkey: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            terminal: default_terminal(),
            wd: String::new(),
            cmd: String::new(),
            claude_binary: String::new(),
            models: Vec::new(),
            hotkey: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Preset {
    #[serde(default, deserialize_with = "lenient_string")]
    pub id: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub name: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub model: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub mode: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub effort: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LaunchSpec {
    #[serde(default, deserialize_with = "lenient_string")]
    pub model: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub mode: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub effort: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub wd: String,
    #[serde(default, deserialize_with = "lenient_string")]
    pub cmd: String,
}
```

Note: `#[serde(rename_all = "camelCase")]` on `Settings` keeps the on-disk key `claudeBinary`
byte-identical to what the Electron app writes, so an existing config keeps working.

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`, add above `pub fn run()`:

```rust
pub mod types;
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test types::`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): config types with lenient string coercion"
```

---

### Task 4: The launch-string builder and charset guard

This is the security boundary. Port `src/core/launch-string.ts` and the `SAFE_DIAL` guard from
`src/main/spawn/index.ts:17` verbatim in behavior. The dials go into the shell string **unquoted**,
so the charset guard is the only thing standing between a hand-edited `presets.json` and shell
metacharacters.

**Files:**
- Create: `src-tauri/src/launch.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/launch.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::LaunchSpec;

    fn spec(model: &str, mode: &str, effort: &str, wd: &str, cmd: &str) -> LaunchSpec {
        LaunchSpec {
            model: model.into(), mode: mode.into(), effort: effort.into(),
            wd: wd.into(), cmd: cmd.into(),
        }
    }

    #[test]
    fn single_quotes_inside_a_value_are_escaped() {
        // The POSIX idiom: close, escaped literal quote, reopen.
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn metacharacters_are_inert_inside_single_quotes() {
        assert_eq!(shell_quote("a; rm -rf /"), "'a; rm -rf /'");
        assert_eq!(shell_quote("$(whoami)"), "'$(whoami)'");
        assert_eq!(shell_quote("`id`"), "'`id`'");
    }

    #[test]
    fn builds_the_full_invocation() {
        let s = spec("opus", "auto", "high", "~/Code", "/wrap");
        assert_eq!(
            build_launch_string(&s, "claude").unwrap(),
            "cd '~/Code' && claude --model opus --permission-mode auto --effort high '/wrap'"
        );
    }

    #[test]
    fn blank_dials_omit_their_flags() {
        let s = spec("opus", "", "", "", "");
        assert_eq!(build_launch_string(&s, "claude").unwrap(), "claude --model opus");
    }

    #[test]
    fn a_dial_with_shell_metacharacters_is_refused() {
        let s = spec("opus; rm -rf /", "", "", "", "");
        let err = build_launch_string(&s, "claude").unwrap_err();
        assert!(err.contains("model"), "error should name the offending dial: {err}");
    }

    #[test]
    fn every_dial_is_guarded_not_just_the_model() {
        assert!(build_launch_string(&spec("opus", "auto`id`", "", "", ""), "claude").is_err());
        assert!(build_launch_string(&spec("opus", "", "high$(id)", "", ""), "claude").is_err());
    }

    #[test]
    fn dial_charset_matches_the_typescript_guard() {
        assert!(is_safe_dial(""));
        assert!(is_safe_dial("claude-opus-5"));
        assert!(is_safe_dial("opus_1.5"));
        assert!(!is_safe_dial("opus[1m]"));
        assert!(!is_safe_dial("a b"));
        assert!(!is_safe_dial("a\nb"));
    }

    #[test]
    fn an_explicit_binary_path_is_quoted_but_a_blank_one_is_bare() {
        assert_eq!(resolve_claude_command(""), "claude");
        assert_eq!(resolve_claude_command("/opt/my claude/claude"), "'/opt/my claude/claude'");
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test launch::`
Expected: FAIL — `cannot find function shell_quote in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/launch.rs`:

```rust
use crate::types::LaunchSpec;

/// POSIX single-quote so the receiving shell treats the value literally.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// model/mode/effort are written UNQUOTED into the shell command, so they are restricted
/// to a charset that cannot express a metacharacter. Mirrors SAFE_DIAL in the TypeScript
/// dispatcher. wd/cmd are intentionally unrestricted — they are quoted instead.
pub fn is_safe_dial(value: &str) -> bool {
    value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn assert_safe_dial(name: &str, value: &str) -> Result<(), String> {
    if is_safe_dial(value) {
        Ok(())
    } else {
        Err(format!(
            "Unsafe {name} value: {value:?} — only letters, digits, '.', '-', '_' are allowed."
        ))
    }
}

/// The token that stands in for `claude`: a quoted explicit path, or the bare command.
pub fn resolve_claude_command(binary: &str) -> String {
    let b = binary.trim();
    if b.is_empty() {
        "claude".to_string()
    } else {
        shell_quote(b)
    }
}

pub fn build_launch_string(spec: &LaunchSpec, claude_cmd: &str) -> Result<String, String> {
    assert_safe_dial("model", spec.model.trim())?;
    assert_safe_dial("mode", spec.mode.trim())?;
    assert_safe_dial("effort", spec.effort.trim())?;

    let mut parts = vec![claude_cmd.to_string()];
    if !spec.model.trim().is_empty() {
        parts.push(format!("--model {}", spec.model.trim()));
    }
    if !spec.mode.trim().is_empty() {
        parts.push(format!("--permission-mode {}", spec.mode.trim()));
    }
    if !spec.effort.trim().is_empty() {
        parts.push(format!("--effort {}", spec.effort.trim()));
    }
    if !spec.cmd.trim().is_empty() {
        parts.push(shell_quote(spec.cmd.trim()));
    }
    let invocation = parts.join(" ");

    Ok(if spec.wd.trim().is_empty() {
        invocation
    } else {
        format!("cd {} && {}", shell_quote(spec.wd.trim()), invocation)
    })
}
```

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`: `pub mod launch;`

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test launch::`
Expected: PASS — 8 tests.

- [ ] **Step 6: Cross-check against the TypeScript it replaces**

Run: `cd .. && pnpm vitest run src/core/launch-string.test.ts`
Read each TypeScript assertion and confirm an equivalent Rust test exists above. Any case in the TS
suite without a Rust counterpart is a regression — add it now.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): port the launch-string builder and dial charset guard to Rust"
```

---

### Task 5: AppleScript generation

Port `src/main/spawn/macos.ts`. The iTerm script is not obvious code — it works around two
verified iTerm behaviors documented at `src/main/spawn/macos.ts:18-26`. Preserve the structure
exactly; do not "simplify" it.

**Files:**
- Create: `src-tauri/src/applescript.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/applescript.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn double_quotes_and_backslashes_are_escaped_for_an_applescript_literal() {
        assert_eq!(osa_quote(r#"say "hi""#), r#""say \"hi\"""#);
        assert_eq!(osa_quote(r"C:\path"), r#""C:\\path""#);
    }

    #[test]
    fn a_backslash_before_a_quote_does_not_let_the_quote_escape() {
        // Backslashes must be doubled BEFORE quotes are escaped, or `\"` re-opens the literal.
        assert_eq!(osa_quote(r#"a\"b"#), r#""a\\\"b""#);
    }

    #[test]
    fn terminal_uses_do_script() {
        let lines = build_mac_script("claude --model opus", "Terminal");
        assert_eq!(lines[0], r#"tell application "Terminal""#);
        assert!(lines.iter().any(|l| l.contains("do script")));
        assert_eq!(lines.last().unwrap(), "end tell");
    }

    #[test]
    fn iterm_keeps_the_created_window_reference_instead_of_re_deriving_it() {
        // iTerm's `current window` is `missing value` on a cold start, so the script must
        // use what `create ...` returned. A script that re-reads `current window` after
        // creating is the bug this guards.
        let lines = build_mac_script("claude", "iTerm");
        let script = lines.join("\n");
        assert!(script.contains("set targetSession to missing value"));
        assert!(script.contains("create tab with default profile"));
        assert!(script.contains("create window with default profile"));
        assert!(script.contains("write text"));
        let after_create = script.split("create window with default profile").nth(1).unwrap();
        assert!(
            !after_create.contains("current window"),
            "must not re-derive `current window` after creating one"
        );
    }

    #[test]
    fn ghostty_runs_through_open_with_a_login_shell() {
        assert_eq!(
            build_ghostty_args("claude --model opus"),
            vec!["-na", "Ghostty", "--args", "-e", "/bin/zsh", "-lc", "claude --model opus"]
        );
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test applescript::`
Expected: FAIL — `cannot find function osa_quote in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/applescript.rs`:

```rust
use std::process::Command;

/// Escape for an AppleScript double-quoted literal. Backslashes first — otherwise the
/// backslash added for a quote would itself be re-escaped and the quote would break out.
pub fn osa_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// The AppleScript, one `-e` line per element, that opens a terminal running the command.
///
/// Two iTerm quirks make the obvious script unreliable, both verified against iTerm 3.x:
///  1. `current window` is `missing value` when iTerm has no key window (cold start, or
///     coming forward right after `activate`) — reading it fails with -1728. So never
///     re-derive it after creating; use what `create ...` returned.
///  2. `create tab with default profile` returns `missing value` (it does not error) when
///     the target window is hidden or minimized.
/// Hence: attempt the tab, and treat anything that does not yield a session as "open a
/// new window" rather than trusting either reference.
pub fn build_mac_script(launch_string: &str, terminal_app: &str) -> Vec<String> {
    if terminal_app == "Terminal" {
        return vec![
            r#"tell application "Terminal""#.to_string(),
            "  activate".to_string(),
            format!("  do script {}", osa_quote(launch_string)),
            "end tell".to_string(),
        ];
    }
    vec![
        r#"tell application "iTerm""#.to_string(),
        "  activate".to_string(),
        "  set targetSession to missing value".to_string(),
        "  try".to_string(),
        "    set targetWindow to current window".to_string(),
        "    if targetWindow is not missing value then".to_string(),
        "      tell targetWindow to set newTab to (create tab with default profile)".to_string(),
        "      if newTab is not missing value then set targetSession to current session of newTab".to_string(),
        "    end if".to_string(),
        "  end try".to_string(),
        "  if targetSession is missing value then".to_string(),
        "    set newWindow to (create window with default profile)".to_string(),
        r#"    if newWindow is missing value then error "iTerm could not open a new window.""#.to_string(),
        "    set targetSession to current session of newWindow".to_string(),
        "  end if".to_string(),
        format!("  tell targetSession to write text {}", osa_quote(launch_string)),
        "end tell".to_string(),
    ]
}

/// Ghostty has no AppleScript surface; it takes the command as CLI args via `open`.
pub fn build_ghostty_args(launch_string: &str) -> Vec<String> {
    vec![
        "-na".into(), "Ghostty".into(), "--args".into(),
        "-e".into(), "/bin/zsh".into(), "-lc".into(), launch_string.into(),
    ]
}

/// Thin impure wrapper — argv only, never a shell.
pub fn launch_mac(launch_string: &str, terminal_app: &str) -> Result<(), String> {
    let output = if terminal_app == "Ghostty" {
        Command::new("open")
            .args(build_ghostty_args(launch_string))
            .output()
    } else {
        let mut args: Vec<String> = Vec::new();
        for line in build_mac_script(launch_string, terminal_app) {
            args.push("-e".to_string());
            args.push(line);
        }
        Command::new("osascript").args(args).output()
    }
    .map_err(|e| format!("Failed to start the terminal: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
```

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`: `pub mod applescript;`

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test applescript::`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): port AppleScript generation with the iTerm cold-start workarounds"
```

---

### Task 6: Tray-relative panel positioning

New test coverage — the Electron version of this logic lives untested in `main.ts:63-86`. Extract
it as a pure function over plain rectangles so it can be tested without a screen.

**Files:**
- Create: `src-tauri/src/position.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/position.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect { x: 0, y: 25, w: 1440, h: 875 };

    #[test]
    fn centers_under_the_tray_icon() {
        let tray = Rect { x: 700, y: 0, w: 30, h: 24 };
        // centered on the icon: 700 + 15 - 230 = 485; below it: 0 + 24 + 4 = 28
        assert_eq!(panel_position(Some(tray), WORK, 460, 620), (485, 28));
    }

    #[test]
    fn falls_back_to_top_center_when_the_tray_icon_is_hidden() {
        // A status item hidden behind the notch reports height 0; trusting it would push
        // the panel off-screen.
        let hidden = Rect { x: 0, y: 0, w: 0, h: 0 };
        assert_eq!(panel_position(Some(hidden), WORK, 460, 620), ((1440 - 460) / 2, 25 + 60));
    }

    #[test]
    fn falls_back_when_there_is_no_tray_rect_at_all() {
        assert_eq!(panel_position(None, WORK, 460, 620), ((1440 - 460) / 2, 25 + 60));
    }

    #[test]
    fn clamps_to_the_right_edge() {
        let tray = Rect { x: 1430, y: 0, w: 30, h: 24 };
        let (x, _) = panel_position(Some(tray), WORK, 460, 620);
        assert_eq!(x, 1440 - 460);
    }

    #[test]
    fn clamps_to_the_left_edge() {
        let tray = Rect { x: 0, y: 0, w: 20, h: 24 };
        let (x, _) = panel_position(Some(tray), WORK, 460, 620);
        assert_eq!(x, 0);
    }

    #[test]
    fn clamps_to_the_bottom_when_the_panel_is_taller_than_the_space_below() {
        let tray = Rect { x: 700, y: 0, w: 30, h: 24 };
        let short = Rect { x: 0, y: 25, w: 1440, h: 400 };
        let (_, y) = panel_position(Some(tray), short, 460, 620);
        // Cannot go below the work area; clamped, and never above its top.
        assert_eq!(y, 25);
    }

    #[test]
    fn respects_a_non_zero_work_area_origin_for_a_second_display() {
        let right = Rect { x: 1440, y: 25, w: 1920, h: 1055 };
        let (x, y) = panel_position(None, right, 460, 620);
        assert_eq!(x, 1440 + (1920 - 460) / 2);
        assert_eq!(y, 25 + 60);
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test position::`
Expected: FAIL — `cannot find type Rect in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/position.rs`:

```rust
/// A plain physical-pixel rectangle, so this logic is testable without a real screen.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Where to put the panel: centered under the tray icon when it is really on screen,
/// otherwise top-center of the work area — then clamped fully inside the work area.
///
/// A tray icon hidden by the notch or a menu-bar manager reports height 0. Trusting that
/// rect would place the panel off-screen, so it is treated as "no tray icon".
pub fn panel_position(
    tray: Option<Rect>,
    work_area: Rect,
    panel_w: i32,
    panel_h: i32,
) -> (i32, i32) {
    let (mut x, mut y) = match tray {
        Some(t) if t.h > 0 => (t.x + t.w / 2 - panel_w / 2, t.y + t.h + 4),
        _ => (
            work_area.x + (work_area.w - panel_w) / 2,
            work_area.y + 60,
        ),
    };

    x = x.clamp(work_area.x, (work_area.x + work_area.w - panel_w).max(work_area.x));
    y = y.clamp(work_area.y, (work_area.y + work_area.h - panel_h).max(work_area.y));
    (x, y)
}
```

Note the `.max(work_area.x)` guards: when the panel is larger than the work area the upper clamp
bound falls below the lower one, and `i32::clamp` **panics** if `min > max`. The Electron original
used nested `Math.max`/`Math.min`, which silently produced a bad-but-not-fatal value. Test
`clamps_to_the_bottom_when_the_panel_is_taller_than_the_space_below` covers exactly this.

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`: `pub mod position;`

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test position::`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): tray-relative panel positioning, now unit-tested"
```

---

### Task 7: Config paths and IO

Port `src/core/presets-store.ts` and `src/core/settings.ts`. The on-disk locations must match the
Electron app byte-for-byte so an existing install keeps its presets.

**Files:**
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/config.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn defaults_to_xdg_config_under_home() {
        let dir = config_dir(&env(&[]), "/Users/x");
        assert_eq!(dir, PathBuf::from("/Users/x/.config/claude-launcher"));
    }

    #[test]
    fn xdg_config_home_wins_over_the_default() {
        let dir = config_dir(&env(&[("XDG_CONFIG_HOME", "/tmp/cfg")]), "/Users/x");
        assert_eq!(dir, PathBuf::from("/tmp/cfg/claude-launcher"));
    }

    #[test]
    fn the_explicit_override_points_at_the_presets_file_and_its_dir_holds_settings() {
        let e = env(&[("CLAUDE_LAUNCHER_CONFIG", "/tmp/p/presets.json")]);
        assert_eq!(presets_path(&e, "/Users/x"), PathBuf::from("/tmp/p/presets.json"));
        assert_eq!(settings_path(&e, "/Users/x"), PathBuf::from("/tmp/p/settings.json"));
    }

    #[test]
    fn a_missing_presets_file_is_an_empty_list_not_an_error() {
        let dir = tempdir();
        let presets = load_presets(&dir.join("nope.json")).unwrap();
        assert!(presets.is_empty());
    }

    #[test]
    fn presets_round_trip_through_disk() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        let p = Preset { id: "a".into(), name: "Plan".into(), model: "opus".into(),
                         mode: "plan".into(), effort: String::new(), wd: String::new(), cmd: String::new() };
        save_presets(&[p], &file).unwrap();
        let loaded = load_presets(&file).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "Plan");
    }

    #[test]
    fn an_entry_with_no_id_gets_one_assigned_on_load() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, r#"[{"name":"X"}]"#).unwrap();
        let loaded = load_presets(&file).unwrap();
        assert!(!loaded[0].id.is_empty(), "load must backfill a missing id");
    }

    #[test]
    fn a_presets_file_that_is_not_an_array_is_a_clear_error_not_a_silent_empty_list() {
        let dir = tempdir();
        let file = dir.join("presets.json");
        std::fs::write(&file, r#"{"name":"X"}"#).unwrap();
        let err = load_presets(&file).unwrap_err();
        assert!(err.contains("array"), "error should say what is wrong: {err}");
    }

    #[test]
    fn a_missing_settings_file_yields_the_defaults() {
        let dir = tempdir();
        let s = load_settings(&dir.join("nope.json")).unwrap();
        assert_eq!(s.terminal, "iTerm");
    }

    /// A unique temp dir without pulling in a dev-dependency.
    fn tempdir() -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "csl-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&base).unwrap();
        base
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test config::`
Expected: FAIL — `cannot find function config_dir in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/config.rs`:

```rust
use crate::types::{Preset, Settings};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Env is passed in rather than read, so path resolution is testable.
pub type Env = HashMap<String, String>;

pub fn current_env() -> Env {
    std::env::vars().collect()
}

pub fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".to_string())
}

pub fn config_dir(env: &Env, home: &str) -> PathBuf {
    if let Some(explicit) = env.get("CLAUDE_LAUNCHER_CONFIG") {
        return Path::new(explicit)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("/"));
    }
    match env.get("XDG_CONFIG_HOME") {
        Some(xdg) => Path::new(xdg).join("claude-launcher"),
        None => Path::new(home).join(".config").join("claude-launcher"),
    }
}

pub fn presets_path(env: &Env, home: &str) -> PathBuf {
    match env.get("CLAUDE_LAUNCHER_CONFIG") {
        Some(explicit) => PathBuf::from(explicit),
        None => config_dir(env, home).join("presets.json"),
    }
}

pub fn settings_path(env: &Env, home: &str) -> PathBuf {
    config_dir(env, home).join("settings.json")
}

pub fn load_presets(file: &Path) -> Result<Vec<Preset>, String> {
    let raw = match std::fs::read_to_string(file) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Could not read {}: {e}", file.display())),
    };
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Presets file {} is not valid JSON: {e}", file.display()))?;
    let items = parsed
        .as_array()
        .ok_or_else(|| format!("Presets file {} must be a JSON array of presets.", file.display()))?;

    Ok(items
        .iter()
        .map(|raw| {
            let mut p: Preset = serde_json::from_value(raw.clone()).unwrap_or_default();
            if p.id.is_empty() {
                p.id = uuid::Uuid::new_v4().to_string();
            }
            p
        })
        .collect())
}

pub fn save_presets(presets: &[Preset], file: &Path) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(presets).map_err(|e| e.to_string())?;
    // Write-then-rename so an interrupted save cannot truncate the real file.
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, file).map_err(|e| format!("Could not replace {}: {e}", file.display()))
}

pub fn load_settings(file: &Path) -> Result<Settings, String> {
    let raw = match std::fs::read_to_string(file) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Settings::default()),
        Err(e) => return Err(format!("Could not read {}: {e}", file.display())),
    };
    serde_json::from_str(&raw)
        .map_err(|e| format!("Settings file {} is not valid JSON: {e}", file.display()))
}

pub fn save_settings(settings: &Settings, file: &Path) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| format!("Could not write {}: {e}", file.display()))
}

pub fn directory_exists(dir: &str) -> bool {
    !dir.trim().is_empty() && Path::new(dir).is_dir()
}
```

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`: `pub mod config;`

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test config::`
Expected: PASS — 8 tests.

- [ ] **Step 6: Confirm compatibility with the real config on disk**

Run:

```bash
cd src-tauri && cargo test config:: -- --nocapture
cat ~/.config/claude-launcher/presets.json | head -20
```

Confirm the field names in the real file (`id`, `name`, `model`, `mode`, `effort`, `wd`, `cmd`) and
in `settings.json` (`terminal`, `wd`, `cmd`, `claudeBinary`, `models`, `hotkey`) match what the
serde structs expect. A mismatch silently blanks a user's config.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): portable JSON config IO in Rust"
```

---

### Task 8: Hotkey candidates and Tauri shortcut translation

The stored hotkey format is an Electron accelerator (`"Alt+W"`). Whether Tauri's parser accepts it
is **unverified** — this task establishes the truth in a test before anything depends on it.

**Files:**
- Create: `src-tauri/src/hotkey.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the probe test that pins the real parser behavior**

Create `src-tauri/src/hotkey.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn tauri_parses_the_accelerator_format_this_app_already_stores() {
        // Pins reality. If this fails, Tauri needs Code-style names and to_tauri_shortcut
        // must translate — see the note in the module doc comment.
        for stored in ["Alt+W", "Control+Alt+C", "Command+Shift+K"] {
            assert!(
                Shortcut::from_str(&to_tauri_shortcut(stored)).is_ok(),
                "Tauri rejected {stored:?} (translated: {:?})",
                to_tauri_shortcut(stored)
            );
        }
    }

    #[test]
    fn the_default_is_option_w_on_macos() {
        assert_eq!(default_hotkey("macos"), "Alt+W");
    }

    #[test]
    fn windows_avoids_bare_alt_because_it_triggers_menu_mnemonics() {
        assert_eq!(default_hotkey("windows"), "Control+Alt+C");
    }

    #[test]
    fn candidates_are_preferred_then_current_then_default() {
        assert_eq!(
            hotkey_candidates("Alt+J", "Alt+K", "macos"),
            vec!["Alt+J", "Alt+K", "Alt+W"]
        );
    }

    #[test]
    fn blanks_are_dropped_and_duplicates_collapsed() {
        assert_eq!(hotkey_candidates("", "Alt+W", "macos"), vec!["Alt+W"]);
        assert_eq!(hotkey_candidates("  ", "", "macos"), vec!["Alt+W"]);
    }

    #[test]
    fn the_current_binding_is_kept_as_a_fallback_so_a_failed_change_does_not_lose_it() {
        let c = hotkey_candidates("Alt+W", "Alt+Q", "macos");
        assert!(c.contains(&"Alt+Q".to_string()));
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test hotkey::`
Expected: FAIL — `cannot find function default_hotkey in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/hotkey.rs`:

```rust
pub const DEFAULT_HOTKEY: &str = "Alt+W"; // Option+W on macOS
/// Alt+<letter> triggers menu-bar mnemonics on Windows, so use a Ctrl+Alt combo there.
pub const DEFAULT_HOTKEY_WIN: &str = "Control+Alt+C";

pub fn default_hotkey(platform: &str) -> String {
    if platform == "windows" { DEFAULT_HOTKEY_WIN } else { DEFAULT_HOTKEY }.to_string()
}

/// Registration order: preferred, then the currently-active binding (so a failed change
/// keeps the old one working), then the platform default. Blanks dropped, de-duplicated.
pub fn hotkey_candidates(preferred: &str, current: &str, platform: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for candidate in [preferred.trim(), current.trim(), &default_hotkey(platform)] {
        if !candidate.is_empty() && !out.iter().any(|e| e == candidate) {
            out.push(candidate.to_string());
        }
    }
    out
}

/// Translate a stored Electron-style accelerator into whatever Tauri's parser wants.
/// Task 8's first test pins which forms Tauri accepts; if it accepts the stored format
/// unchanged this stays an identity function, and the test is the proof.
pub fn to_tauri_shortcut(accelerator: &str) -> String {
    accelerator.replace("Command", "Super").replace("CommandOrControl", "CmdOrCtrl")
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd src-tauri && cargo test hotkey::`
Expected: PASS — 6 tests.

**If `tauri_parses_the_accelerator_format_this_app_already_stores` fails:** Tauri wants `Code`
names. Extend `to_tauri_shortcut` to map a trailing single letter `X` to `KeyX` and a digit `N` to
`DigitN`, add a test for each mapping, and re-run. Do not skip the test.

- [ ] **Step 5: Register the module**

In `src-tauri/src/lib.rs`: `pub mod hotkey;`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): hotkey candidates and shortcut translation"
```

---

### Task 9: claude / terminal detection

Port `src/main/detect.ts`.

**Files:**
- Create: `src-tauri/src/detect.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/detect.rs` with only the test module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detection_uses_a_login_shell_so_it_sees_the_terminals_path() {
        // A non-login shell misses nvm/mise shims, which is the whole point.
        assert_eq!(
            build_detect_argv(Some("/bin/fish")),
            vec!["/bin/fish", "-lc", "command -v claude"]
        );
    }

    #[test]
    fn falls_back_to_zsh_when_shell_is_unset_or_blank() {
        assert_eq!(build_detect_argv(None)[0], "/bin/zsh");
        assert_eq!(build_detect_argv(Some("   "))[0], "/bin/zsh");
    }

    #[test]
    fn only_the_first_line_of_output_is_taken_as_the_path() {
        assert_eq!(first_path("/usr/local/bin/claude\n/other/claude\n"), "/usr/local/bin/claude");
        assert_eq!(first_path("  \n"), "");
    }

    #[test]
    fn apple_terminal_is_always_offered() {
        assert!(TERMINAL_CANDIDATES.contains(&"Terminal"));
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test detect::`
Expected: FAIL — `cannot find function build_detect_argv in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/detect.rs`:

```rust
use std::process::Command;

pub const TERMINAL_CANDIDATES: [&str; 3] = ["iTerm", "Terminal", "Ghostty"];

/// Login-shell argv that reports the claude path if present — matches the terminal's PATH.
pub fn build_detect_argv(shell: Option<&str>) -> Vec<String> {
    let sh = match shell.map(str::trim) {
        Some(s) if !s.is_empty() => s,
        _ => "/bin/zsh",
    };
    vec![sh.to_string(), "-lc".to_string(), "command -v claude".to_string()]
}

pub fn first_path(stdout: &str) -> String {
    stdout.lines().next().unwrap_or("").trim().to_string()
}

/// Never fails: "not found" is a normal answer, not an error.
pub fn detect_claude() -> Option<String> {
    let argv = build_detect_argv(std::env::var("SHELL").ok().as_deref());
    let out = Command::new(&argv[0]).args(&argv[1..]).output().ok()?;
    let path = first_path(&String::from_utf8_lossy(&out.stdout));
    if path.is_empty() { None } else { Some(path) }
}

/// The installed subset, probed with `open -Ra`. Apple Terminal ships with the OS.
pub fn detect_terminals() -> Vec<String> {
    TERMINAL_CANDIDATES
        .iter()
        .filter(|name| {
            **name == "Terminal"
                || Command::new("open")
                    .args(["-Ra", name])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
        })
        .map(|s| s.to_string())
        .collect()
}
```

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`: `pub mod detect;`

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test detect::`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): claude and terminal detection"
```

---

### Task 10: Tauri commands

The IPC surface. Every command is a thin wrapper over an already-tested pure function.

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/commands.rs` with only the test module. The commands themselves are thin,
so the test covers the one place they add logic: composing settings + spec into a launch string.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{LaunchSpec, Settings};

    fn spec() -> LaunchSpec {
        LaunchSpec { model: "opus".into(), mode: "auto".into(), effort: "high".into(),
                     wd: String::new(), cmd: String::new() }
    }

    #[test]
    fn the_preview_is_the_exact_string_that_would_be_run() {
        let settings = Settings::default();
        assert_eq!(
            compose_launch_string(&spec(), &settings).unwrap(),
            "claude --model opus --permission-mode auto --effort high"
        );
    }

    #[test]
    fn an_explicit_binary_replaces_the_bare_command_in_the_preview_too() {
        let settings = Settings { claude_binary: "/opt/claude".into(), ..Settings::default() };
        assert!(compose_launch_string(&spec(), &settings).unwrap().starts_with("'/opt/claude'"));
    }

    #[test]
    fn an_unsafe_dial_is_refused_before_anything_reaches_a_shell() {
        let bad = LaunchSpec { model: "opus;id".into(), ..spec() };
        assert!(compose_launch_string(&bad, &Settings::default()).is_err());
    }
}
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd src-tauri && cargo test commands::`
Expected: FAIL — `cannot find function compose_launch_string in this scope`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/commands.rs`:

```rust
use crate::applescript::launch_mac;
use crate::config::{
    config_dir, current_env, directory_exists, home_dir, load_presets, load_settings, presets_path,
    save_presets, save_settings, settings_path,
};
use crate::detect::{detect_claude, detect_terminals};
use crate::launch::{build_launch_string, resolve_claude_command};
use crate::types::{LaunchSpec, Preset, Settings};

/// Single source of truth for "what will actually run" — used by both launch and preview,
/// so the preview can never drift from the command.
pub fn compose_launch_string(spec: &LaunchSpec, settings: &Settings) -> Result<String, String> {
    build_launch_string(spec, &resolve_claude_command(&settings.claude_binary))
}

fn presets_file() -> std::path::PathBuf {
    presets_path(&current_env(), &home_dir())
}

fn settings_file() -> std::path::PathBuf {
    settings_path(&current_env(), &home_dir())
}

#[tauri::command]
pub fn get_presets() -> Result<Vec<Preset>, String> {
    load_presets(&presets_file())
}

#[tauri::command]
pub fn upsert_preset(preset: Preset) -> Result<Vec<Preset>, String> {
    let mut presets = load_presets(&presets_file())?;
    let mut preset = preset;
    if preset.id.is_empty() {
        preset.id = uuid::Uuid::new_v4().to_string();
    }
    match presets.iter().position(|p| p.id == preset.id) {
        Some(i) => presets[i] = preset,
        None => presets.push(preset),
    }
    save_presets(&presets, &presets_file())?;
    Ok(presets)
}

#[tauri::command]
pub fn remove_preset(id: String) -> Result<Vec<Preset>, String> {
    let mut presets = load_presets(&presets_file())?;
    presets.retain(|p| p.id != id);
    save_presets(&presets, &presets_file())?;
    Ok(presets)
}

#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    load_settings(&settings_file())
}

#[tauri::command]
pub fn save_settings_cmd(settings: Settings) -> Result<Settings, String> {
    save_settings(&settings, &settings_file())?;
    Ok(settings)
}

/// Build the launch string for display. No side effects — safe to call on every keystroke.
#[tauri::command]
pub fn preview_launch_string(spec: LaunchSpec) -> Result<String, String> {
    let settings = load_settings(&settings_file())?;
    compose_launch_string(&spec, &settings)
}

#[tauri::command]
pub fn launch(spec: LaunchSpec) -> Result<(), String> {
    let settings = load_settings(&settings_file())?;
    let launch_string = compose_launch_string(&spec, &settings)?;
    launch_mac(&launch_string, &settings.terminal)
}

#[tauri::command]
pub fn validate_workdir(dir: String) -> bool {
    directory_exists(&dir)
}

#[tauri::command]
pub fn claude_detect() -> serde_json::Value {
    match detect_claude() {
        Some(path) => serde_json::json!({ "found": true, "path": path }),
        None => serde_json::json!({ "found": false }),
    }
}

#[tauri::command]
pub fn terminals_detect() -> Vec<String> {
    detect_terminals()
}

#[tauri::command]
pub fn ensure_config_dir() -> Result<String, String> {
    let dir = config_dir(&current_env(), &home_dir());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}
```

- [ ] **Step 4: Register the module**

In `src-tauri/src/lib.rs`: `pub mod commands;`

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd src-tauri && cargo test commands::`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): command surface over the tested core"
```

---

### Task 11: App setup — tray, panel, hotkey, blur-to-hide, dock hiding

Wiring, not logic — the logic is already tested. Verification is running the app.

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the full `src-tauri/src/lib.rs`**

```rust
pub mod applescript;
pub mod commands;
pub mod config;
pub mod detect;
pub mod hotkey;
pub mod launch;
pub mod position;
pub mod types;

use crate::hotkey::{hotkey_candidates, to_tauri_shortcut};
use crate::position::{panel_position, Rect};
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{
    image::Image,
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, Manager, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

/// The tray icon's last known rect, captured from the click event — the only place Tauri
/// exposes it. Positioning needs it before showing the panel.
#[derive(Default)]
struct TrayRect(Mutex<Option<Rect>>);

/// Registered hotkey, so a failed re-registration can fall back to it.
#[derive(Default)]
struct ActiveHotkey(Mutex<String>);

fn position_and_show(window: &WebviewWindow, tray: Option<Rect>) {
    let monitor = window
        .primary_monitor()
        .ok()
        .flatten();
    let Some(monitor) = monitor else {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    };
    let area = monitor.work_area();
    let work = Rect { x: area.position.x, y: area.position.y,
                      w: area.size.width as i32, h: area.size.height as i32 };
    let size = window.outer_size().unwrap_or_default();
    let (x, y) = panel_position(tray, work, size.width as i32, size.height as i32);
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
}

fn toggle_panel(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("panel") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let tray = app.state::<TrayRect>().0.lock().unwrap().clone();
    position_and_show(&window, tray);
}

/// Register the first hotkey candidate that is not already taken. Returns what took.
fn register_hotkey(app: &tauri::AppHandle, preferred: &str) -> String {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let current = app.state::<ActiveHotkey>().0.lock().unwrap().clone();
    let shortcuts = app.global_shortcut();

    if !current.is_empty() {
        if let Ok(s) = Shortcut::from_str(&to_tauri_shortcut(&current)) {
            let _ = shortcuts.unregister(s);
        }
    }

    for candidate in hotkey_candidates(preferred, &current, "macos") {
        let Ok(parsed) = Shortcut::from_str(&to_tauri_shortcut(&candidate)) else { continue };
        if shortcuts.is_registered(parsed) {
            continue;
        }
        let ok = shortcuts
            .on_shortcut(parsed, |app, _shortcut, event| {
                // Fires for press AND release; without this filter the panel toggles twice.
                if event.state() == ShortcutState::Pressed {
                    toggle_panel(app);
                }
            })
            .is_ok();
        if ok {
            *app.state::<ActiveHotkey>().0.lock().unwrap() = candidate.clone();
            return candidate;
        }
    }
    *app.state::<ActiveHotkey>().0.lock().unwrap() = String::new();
    String::new()
}

#[tauri::command]
fn set_hotkey(app: tauri::AppHandle, accelerator: String) -> String {
    register_hotkey(&app, &accelerator)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(TrayRect::default())
        .manage(ActiveHotkey::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_presets,
            commands::upsert_preset,
            commands::remove_preset,
            commands::get_settings,
            commands::save_settings_cmd,
            commands::preview_launch_string,
            commands::launch,
            commands::validate_workdir,
            commands::claude_detect,
            commands::terminals_detect,
            commands::ensure_config_dir,
            set_hotkey,
        ])
        .setup(|app| {
            // Menu-bar only: no Dock icon, no app switcher entry.
            #[cfg(target_os = "macos")]
            app.handle().set_activation_policy(ActivationPolicy::Accessory)?;

            let icon = Image::from_bytes(include_bytes!("../icons/trayTemplate.png"))?;
            TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true) // macOS tints it for light/dark menu bars
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, rect, .. } = event {
                        let app = tray.app_handle();
                        let pos = rect.position.to_physical::<i32>(1.0);
                        let size = rect.size.to_physical::<u32>(1.0);
                        *app.state::<TrayRect>().0.lock().unwrap() = Some(Rect {
                            x: pos.x, y: pos.y,
                            w: size.width as i32, h: size.height as i32,
                        });
                        toggle_panel(app);
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("panel") {
                // Click-away dismiss, matching the Electron panel's blur handler.
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = w.hide();
                    }
                });
            }

            let settings = config::load_settings(&config::settings_path(
                &config::current_env(),
                &config::home_dir(),
            ))
            .unwrap_or_default();
            let active = register_hotkey(app.handle(), &settings.hotkey);
            println!("[launcher] global hotkey: {}", if active.is_empty() { "NONE" } else { &active });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify it compiles and the tests still pass**

Run: `cd src-tauri && cargo test`
Expected: all module tests PASS, zero compile errors.

- [ ] **Step 3: Run the app**

Run: `pnpm build && cd src-tauri && cargo run`
Expected: a menu-bar icon appears, no Dock icon. Clicking it shows the panel under the icon.
Clicking away hides it. ⌥W toggles it.

If the panel is blank: `frontendDist` must point at the directory containing `index.html`
(`../dist/renderer`). Check that `pnpm build` produced `dist/renderer/index.html`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src
git commit -m "feat(tauri): tray, panel positioning, hotkey, blur-to-hide, dock hiding"
```

---

### Task 12: Point the renderer at Tauri

Swap the `window.launcher` implementation. `panel.ts` keeps its structure; only the bridge and the
preview change.

**Files:**
- Create: `src/renderer/bridge.ts`
- Modify: `src/renderer/panel.ts`, `package.json`

- [ ] **Step 1: Add the Tauri API package**

Run: `command pnpm add @tauri-apps/api`
Expected: added to `dependencies`.

- [ ] **Step 2: Create `src/renderer/bridge.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { LaunchSpec, Preset, Settings } from "../core/types.js";

/**
 * The same shape the Electron preload exposed, so panel.ts does not care which shell it
 * runs in. Command names match the Rust #[tauri::command] fn names.
 */
export const launcher = {
  getPresets: (): Promise<Preset[]> => invoke("get_presets"),
  upsertPreset: (preset: Preset): Promise<Preset[]> => invoke("upsert_preset", { preset }),
  removePreset: (id: string): Promise<Preset[]> => invoke("remove_preset", { id }),
  getSettings: (): Promise<Settings> => invoke("get_settings"),
  saveSettings: (settings: Settings): Promise<Settings> => invoke("save_settings_cmd", { settings }),
  launch: (spec: LaunchSpec): Promise<void> => invoke("launch", { spec }),
  previewLaunchString: (spec: LaunchSpec): Promise<string> => invoke("preview_launch_string", { spec }),
  validateWorkdir: (dir: string): Promise<boolean> => invoke("validate_workdir", { dir }),
  detectClaude: (): Promise<{ found: boolean; path?: string }> => invoke("claude_detect"),
  detectTerminals: (): Promise<string[]> => invoke("terminals_detect"),
  setHotkey: (accelerator: string): Promise<string> => invoke("set_hotkey", { accelerator }),
};

window.launcher = launcher;
```

- [ ] **Step 3: Import the bridge and make the preview async**

In `src/renderer/panel.ts`, add at the top of the imports:

```ts
import "./bridge.js";
```

Extend the `Window["launcher"]` interface declaration with:

```ts
      previewLaunchString(spec: LaunchSpec): Promise<string>;
```

Replace the preview line (currently `panel.ts:97`):

```ts
  $("preview").textContent = buildLaunchString(composed(), resolveClaudeCommand(settings.claudeBinary));
```

with:

```ts
  // The preview comes from the same Rust function that runs the command, so the two
  // cannot drift. An unsafe dial surfaces here as the guard's own message.
  void window.launcher
    .previewLaunchString(composed())
    .then((s) => { $("preview").textContent = s; })
    .catch((err: unknown) => { $("preview").textContent = String(err); });
```

Then delete the now-unused imports of `buildLaunchString` and `resolveClaudeCommand` from
`panel.ts`. Leave `src/core/launch-string.ts` and `src/core/claude-binary.ts` on disk — Electron
still uses them until Plan 2.

- [ ] **Step 4: Verify the build**

Run: `command pnpm build`
Expected: `tsc` clean, no unused-import errors.

- [ ] **Step 5: Run the app and exercise every path**

Run: `cd src-tauri && cargo run`

Check each, and fix before moving on:
- Panel appears under the tray icon.
- Dial buttons toggle; the preview updates and matches the dials.
- Haiku greys out Effort and Auto.
- A preset launches a real `claude` session in the configured terminal.
- Save a preset; it appears in the lane and survives a restart.
- Settings: terminal segment, model editor, working dir, binary path, hotkey recorder.
- ⌥W toggles the panel; clicking away hides it.

- [ ] **Step 6: Commit**

```bash
git add src/renderer package.json pnpm-lock.yaml
git commit -m "feat(tauri): point the renderer at the Tauri command surface"
```

---

### Task 13: Re-verify panel sizing in WKWebView

The 460×620 sizing was measured in Chromium with classic scrollbars forced. WKWebView lays out
differently and defaults to overlay scrollbars, so the numbers must be re-confirmed rather than
assumed — this is the exact class of bug the sizing work fixed.

**Files:**
- Modify: `src-tauri/tauri.conf.json`, `src/renderer/panel.css` (only if measurement says so)

- [ ] **Step 1: Measure the real content in the running app**

Run the app (`cd src-tauri && cargo run`), open the panel, right-click → Inspect Element (enable
first with `defaults write com.jboho.claude-launcher WebKitDeveloperExtras -bool true` if the menu
is absent), and in the console:

```js
const win = document.querySelector('.win');
({ vScroll: win.scrollHeight - win.clientHeight,
   hScroll: win.scrollWidth - win.clientWidth,
   cardW: win.offsetWidth, cardH: win.offsetHeight,
   viewport: [innerWidth, innerHeight] })
```

Expected: `vScroll: 0`, `hScroll: 0`.

- [ ] **Step 2: Repeat for the states that add a row**

In the same console:

```js
document.getElementById('claude-banner').classList.add('show');
const w = document.querySelector('.win');
({ banner: w.scrollHeight - w.clientHeight });
document.getElementById('claude-banner').classList.remove('show');
document.getElementById('save-row').classList.add('open');
({ saveRow: w.scrollHeight - w.clientHeight });
```

Expected: both `0`.

- [ ] **Step 3: Adjust only if measured**

If any value is non-zero, raise `app.windows[0].height` in `tauri.conf.json` by exactly the largest
overflow, rebuild, and re-measure. Record the final numbers in the commit message. Do not guess.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src/renderer/panel.css
git commit -m "fix(tauri): confirm panel sizing under WKWebView"
```

---

### Task 14: Package, sign, and smoke-test the bundle

- [ ] **Step 1: Add the Tauri scripts to `package.json`**

```json
    "tauri": "tauri",
    "tauri:dev": "pnpm build && tauri dev",
    "tauri:build": "tauri build"
```

And add `@tauri-apps/cli` to devDependencies:

Run: `command pnpm add -D @tauri-apps/cli`

- [ ] **Step 2: Build the bundle**

Run: `command pnpm tauri:build`
Expected: a `.app` and `.dmg` under `src-tauri/target/release/bundle/`.

- [ ] **Step 3: Verify the signature and entitlements**

```bash
APP="src-tauri/target/release/bundle/macos/Claude Launcher.app"
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E "Authority|flags"
codesign -d --entitlements - "$APP" 2>&1 | grep -A1 apple-events
```

Expected: `Authority=Developer ID Application: Jonathan Boho (72FBK9YTA3)`, `flags=0x10000(runtime)`,
and the `com.apple.security.automation.apple-events` key present. A missing entitlement means
`osascript` will be blocked with no prompt.

- [ ] **Step 4: Install and smoke-test from /Applications**

```bash
cp -R "src-tauri/target/release/bundle/macos/Claude Launcher.app" /Applications/
open "/Applications/Claude Launcher.app"
```

Expected: tray icon appears, macOS prompts once to control iTerm, a launch opens a real session.
Compare the DMG size against the Electron one (`ls -lh release/*.dmg`) and note both in the commit.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(tauri): bundle scripts and signed .app verification"
```

---

## Out of scope — follow-on plans

**Plan 2 — retire Electron.** Delete `src/main/`, `src/preload/`, `build/entitlements.mac.plist`,
`scripts/notarize-dmg.mjs`, `scripts/verify-mac-build.mjs`, and the electron/electron-builder
devDependencies. Delete the TypeScript modules whose logic now lives in Rust
(`core/launch-string.ts`, `core/claude-binary.ts`, `core/validate.ts`'s model regex,
`core/normalize.ts`, `core/settings.ts`, `core/presets-store.ts`) and their tests, keeping
`core/types.ts` and `core/accelerator.ts` for the renderer. Rewrite `.github/workflows/release.yml`
for `tauri build`, port notarization (`tauri.conf.json` → `bundle.macOS.notarize` plus
`APPLE_KEYCHAIN_PROFILE`), and rewrite `CLAUDE.md` + `README.md` + `docs/INSTALL.md`. This closes
the Electron 33 EOL finding by deleting the runtime.

**Plan 3 — Windows.** `spawn/windows.ts` (PowerShell quoting, `wt`) has no Rust equivalent in this
plan; the Tauri app is macOS-only until then. `build_launch_string` currently emits POSIX only.

---

## Self-review

**Spec coverage.** Shell-safety layer behind IPC → Tasks 4, 5, 10. Renderer ported → Task 12.
Sizing re-verified in WKWebView → Task 13. iTerm quirks preserved → Task 5 (with a test asserting
the script does not re-derive `current window`). Apple Events entitlement +
`NSAppleEventsUsageDescription` → Task 2 steps 3–4, verified in Task 14 step 3. Portable JSON
config → Task 7. Hotkey with fallback candidates → Tasks 8, 11. Tray-relative positioning with
work-area clamping → Tasks 6, 11. Blur-to-hide → Task 11. Dock hiding → Task 11
(`ActivationPolicy::Accessory`).

**Gap found and closed:** the plan originally left the preview builder duplicated in TypeScript,
which would drift from the Rust builder. Task 10 adds `preview_launch_string` and Task 12 consumes
it, leaving one source of truth.

**Known risk carried deliberately:** Task 8's first test may fail, because Tauri's accelerator
parsing is the one API this plan could not verify locally. The task states the fallback (map `W` →
`KeyW`) rather than assuming success.

**Type consistency:** `LaunchSpec`/`Preset`/`Settings` are defined in Task 3 and used unchanged in
Tasks 4, 7, 10. `Rect` is defined in Task 6 and used in Task 11. `compose_launch_string` is defined
in Task 10 and used by both `launch` and `preview_launch_string`. Command names in `bridge.ts`
(Task 12) match the `#[tauri::command]` fn names in Tasks 10 and 11 — note `save_settings_cmd`,
renamed to avoid colliding with `config::save_settings`.
