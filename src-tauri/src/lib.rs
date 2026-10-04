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
            commands::get_financial_dashboard,
            commands::create_payment,
            commands::cancel_payment,
            // ── Session 5 : Pédagogie ──
            commands::get_subjects,
            commands::create_subject,
            commands::update_subject,
            commands::delete_subject,
            commands::get_class_subjects,
            commands::assign_subject_to_class,
            commands::update_class_subject,
            commands::remove_class_subject,
            commands::get_grading_periods,
            commands::create_grading_period,
            commands::update_grading_period,
            commands::delete_grading_period,
            commands::activate_all_grading_periods,
            commands::get_grade_types,
            commands::create_grade_type,
            commands::update_grade_type,
            commands::get_grades_by_class,
            commands::get_grades_by_student,
            commands::upsert_grade,
            commands::get_student_averages,
            commands::get_class_rankings,
            commands::get_class_statistics,
            commands::get_teacher_assignments,
            commands::assign_teacher_to_class_subject,
            // ── Phase 3 : Structure Pédagogique ──
            commands::get_sections,
            commands::create_section,
            commands::update_section,
            commands::delete_section,
            commands::get_levels,
            commands::create_level,
            commands::update_level,
            commands::delete_level,
            commands::get_series,
            commands::create_series,
            commands::update_series,
            commands::delete_series,
            // Personnel
            commands::get_staff,
            commands::create_staff,
            commands::update_staff,
            commands::delete_staff
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application Tauri");
}
