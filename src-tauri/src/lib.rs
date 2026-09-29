pub mod db;
pub mod commands;
pub mod models;
pub mod sync;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialisation de la base SQLite et exécution de la migration
            let conn = db::init(app.handle()).expect("Erreur fatale : Impossible d'initialiser la base de données locale");
            
            // Démarrage du thread de synchronisation en arrière-plan
            if let Ok(app_dir) = app.handle().path().app_data_dir() {
                let db_path = app_dir.join("orion.sqlite");
                sync::start_sync_loop(db_path);
            }
            
            // Injection de la connexion dans l'état Tauri
            app.manage(commands::DbState(Mutex::new(conn)));
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_db_status,
            commands::get_device_info,
            commands::register_device,
            commands::check_user_role,
            commands::write_audit_log,
            commands::get_sync_status,
            commands::save_school_settings,
            commands::get_academic_years,
            commands::create_academic_year,
            commands::update_academic_year,
            commands::open_academic_year,
            commands::close_academic_year,
            commands::delete_academic_year,
            commands::sync_local_user,
            commands::get_classes,
            commands::create_class,
            commands::update_class,
            commands::delete_class,
            commands::get_students,
            commands::create_student,
            commands::delete_enrollment,
            commands::get_student_details,
            commands::update_student,
            commands::migrate_student
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application Tauri");
}
