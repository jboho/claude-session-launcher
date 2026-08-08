//! Tauri command surface — the equivalent of `src/main/ipc.ts`. Every `#[tauri::command]`
//! here is a thin wrapper over the already-tested pure core (`config`, `launch`, `detect`,
//! `applescript`); nothing here should carry real logic of its own.

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

fn presets_file() -> std::path::PathBuf { presets_path(&current_env(), &home_dir()) }
fn settings_file() -> std::path::PathBuf { settings_path(&current_env(), &home_dir()) }

#[tauri::command]
pub fn get_presets() -> Result<Vec<Preset>, String> { load_presets(&presets_file()) }

#[tauri::command]
pub fn upsert_preset(preset: Preset) -> Result<Vec<Preset>, String> {
    let mut presets = load_presets(&presets_file())?;
    let mut preset = preset;
    if preset.id.is_empty() { preset.id = uuid::Uuid::new_v4().to_string(); }
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
pub fn get_settings() -> Result<Settings, String> { load_settings(&settings_file()) }

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
pub fn launch(app: tauri::AppHandle, spec: LaunchSpec) -> Result<(), String> {
    use tauri::Manager;
    let settings = load_settings(&settings_file())?;
    let launch_string = compose_launch_string(&spec, &settings)?;
    launch_mac(&launch_string, &settings.terminal)?;
    // Dismiss the panel once the session is on its way. Done explicitly rather
    // than leaning on the terminal stealing focus to blur-hide it — the panel is
    // otherwise a persistent toggle (shown/hidden only by the tray or hotkey).
    if let Some(panel) = app.get_webview_window("panel") {
        let _ = panel.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn validate_workdir(dir: String) -> bool { directory_exists(&dir) }

/// Typed mirror of the renderer's `{found, path?}` contract — `path` is omitted from the
/// JSON entirely when absent (via `skip_serializing_if`), matching what `detectClaude()`
/// sends over the wire in the Electron IPC (`{ found: false }`, no `path` key at all).
#[derive(Debug, Clone, serde::Serialize)]
pub struct ClaudeDetection {
    pub found: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

#[tauri::command]
pub fn claude_detect() -> ClaudeDetection {
    match detect_claude() {
        Some(path) => ClaudeDetection { found: true, path: Some(path) },
        None => ClaudeDetection { found: false, path: None },
    }
}

#[tauri::command]
pub fn terminals_detect() -> Vec<String> { detect_terminals() }

#[tauri::command]
pub fn ensure_config_dir() -> Result<String, String> {
    let dir = config_dir(&current_env(), &home_dir());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

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

    // --- ClaudeDetection serialization: path must be OMITTED (not null) when absent,
    // matching what the Electron IPC channel `claude:detect` sends for `{ found: false }`.

    #[test]
    fn found_true_serializes_with_the_path_key_present() {
        let json = serde_json::to_string(&ClaudeDetection { found: true, path: Some("/usr/local/bin/claude".into()) }).unwrap();
        assert_eq!(json, r#"{"found":true,"path":"/usr/local/bin/claude"}"#);
    }

    #[test]
    fn found_false_omits_the_path_key_entirely() {
        let json = serde_json::to_string(&ClaudeDetection { found: false, path: None }).unwrap();
        assert_eq!(json, r#"{"found":false}"#);
        assert!(!json.contains("path"));
    }
}
