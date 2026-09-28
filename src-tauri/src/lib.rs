pub mod db;
pub mod commands;
pub mod models;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialisation de la base SQLite et exécution de la migration
            let conn = db::init(app.handle()).expect("Erreur fatale : Impossible d'initialiser la base de données locale");
            
            // Injection de la connexion dans l'état Tauri
            app.manage(commands::DbState(Mutex::new(conn)));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_db_status,
            commands::get_device_info,
            commands::register_device
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application Tauri");
}
