pub mod applescript;
pub mod commands;
pub mod config;
pub mod detect;
pub mod hotkey;
pub mod launch;
pub mod position;
pub mod types;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
