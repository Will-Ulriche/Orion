pub mod db;
pub mod commands;
pub mod library;
pub mod models;
pub mod sync;
pub mod auth_guard;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            commands::get_devices,
            commands::get_licenses,
            commands::save_license,
            commands::delete_local_license,
            commands::purge_local_licenses,
            commands::get_roles,
            commands::check_user_role,
            commands::get_current_user_roles,
            commands::set_local_user_role,
            commands::get_current_staff_id,
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
            commands::store_offline_credentials,
            commands::login_offline,
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
            commands::purge_all_sync_conflicts,
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
            commands::get_teacher_class_subjects,
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
            commands::get_class_notes_recap,
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
            commands::get_staff_photo,
            commands::create_staff,
            commands::update_staff,
            commands::delete_staff,
            commands::update_staff_classes,
            // ── Emploi du temps ──
            commands::get_timetable,
            commands::save_timetable_slot,
            // ── Gestion multi-utilisateurs ──
            commands::get_school_users,
            commands::create_local_user,
            commands::toggle_user_status,
            commands::delete_local_user,
            commands::assign_user_role,
            // ── Authentification locale (identifiant + mot de passe) ──
            commands::set_user_password,
            commands::login_local,
            commands::check_local_school_exists,
            commands::purge_local_school,
            // ── Export Excel (super-admin) ──
            commands::write_download_file,
            // ── Tableau de bord ──
            commands::get_school_dashboard_stats,
            commands::get_current_user_profile,
            // ── Session 6 : Bibliothèque ──
            library::get_library_settings,
            library::save_library_settings,
            library::get_library_categories,
            library::create_library_category,
            library::update_library_category,
            library::delete_library_category,
            library::get_library_books,
            library::create_library_book,
            library::update_library_book,
            library::delete_library_book,
            library::get_library_copies,
            library::create_library_copies,
            library::update_library_copy,
            library::delete_library_copy,
            library::get_library_readers,
            library::create_library_reader,
            library::update_library_reader,
            library::delete_library_reader,
            library::register_student_as_reader,
            library::get_library_loans,
            library::create_library_loan,
            library::return_library_loan,
            library::extend_library_loan,
            library::get_library_penalties,
            library::create_library_penalty,
            library::pay_library_penalty,
            library::waive_library_penalty,
            library::get_library_reservations,
            library::create_library_reservation,
            library::cancel_library_reservation,
            library::fulfill_library_reservation,
            library::get_library_dashboard,
            library::seed_library_demo_data,
            library::clear_library_data,
            commands::set_sync_access_token,
            commands::restore_local_session,
            commands::clear_local_session,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application Tauri");
}
