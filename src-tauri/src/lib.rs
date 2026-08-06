pub mod applescript;
pub mod config;
pub mod launch;
pub mod position;
pub mod types;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
