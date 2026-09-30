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
            commands::get_school_settings,
            commands::save_school_settings,
            commands::get_academic_years,
            commands::create_academic_year,
            commands::update_academic_year,
            commands::open_academic_year,
            commands::close_academic_year,
            commands::archive_academic_year,
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
            commands::migrate_student,
            commands::bulk_migrate_students,
            commands::transfer_class_within_year,
            // ── Session 3 : Sync Engine ──
            commands::trigger_sync,
            commands::retry_failed_mutations,
            commands::enqueue_full_resync,
            commands::get_pending_mutations,
            commands::get_sync_conflicts,
            commands::resolve_sync_conflict,
            commands::purge_invalid_mutations,
            // ── Session 4 : Finance ──
            commands::get_fee_structures,
            commands::create_fee_structure,
            commands::update_fee_structure,
            commands::delete_fee_structure,
            commands::get_student_payments,
            commands::get_student_financial_summary,
            commands::create_payment,
            commands::cancel_payment
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application Tauri");
}
