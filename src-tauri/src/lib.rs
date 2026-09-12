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
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    ActivationPolicy, Manager, WebviewWindow,
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
    let Some(monitor) = window.primary_monitor().ok().flatten() else {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    };
    let area = monitor.work_area();
    let work = Rect {
        x: area.position.x,
        y: area.position.y,
        w: area.size.width as i32,
        h: area.size.height as i32,
    };
    let size = window.outer_size().unwrap_or_default();
    let (x, y) = panel_position(tray, work, size.width as i32, size.height as i32);
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
}

fn toggle_panel(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("panel") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let tray = *app.state::<TrayRect>().0.lock().unwrap();
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

    for candidate in hotkey_candidates(preferred, &current, std::env::consts::OS) {
        let Ok(parsed) = Shortcut::from_str(&to_tauri_shortcut(&candidate)) else {
            continue;
        };
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
            commands::add_starter_presets,
            commands::run_auto_mode_critique,
            set_hotkey,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.handle().set_activation_policy(ActivationPolicy::Accessory)?;

            let icon = Image::from_bytes(include_bytes!("../icons/trayTemplate.png"))?;
            TrayIconBuilder::new()
                .icon(icon)
                .icon_as_template(true)
                .on_tray_icon_event(|tray, event| {
                    // The tray fires Click on BOTH press (Down) and release (Up). Act on
                    // Up only — reacting to both toggles twice per click, which showed the
                    // panel on press and hid it on release (a press-and-hold, not a toggle).
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        // The tray-icon rect can be reported in logical or physical units
                        // depending on platform; convert with the panel window's own scale
                        // factor so positioning stays correct on HiDPI/Retina displays.
                        let scale = app
                            .get_webview_window("panel")
                            .and_then(|w| w.scale_factor().ok())
                            .unwrap_or(1.0);
                        let pos = rect.position.to_physical::<i32>(scale);
                        let size = rect.size.to_physical::<u32>(scale);
                        *app.state::<TrayRect>().0.lock().unwrap() = Some(Rect {
                            x: pos.x,
                            y: pos.y,
                            w: size.width as i32,
                            h: size.height as i32,
                        });
                        toggle_panel(app);
                    }
                })
                .build(app)?;

            let settings = config::load_settings(&config::settings_path(
                &config::current_env(),
                &config::home_dir(),
            ))
            .unwrap_or_default();
            let active = register_hotkey(app.handle(), &settings.hotkey);
            println!(
                "[launcher] global hotkey: {}",
                if active.is_empty() { "NONE" } else { &active }
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect(
            "Claude Launcher failed to start. This is fatal: no window, no tray icon, no way \
             to recover without a relaunch. Check stderr above for the underlying Tauri error \
             (commonly a bad capability/permission or a webview init failure).",
        );
}
