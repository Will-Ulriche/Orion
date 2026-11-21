use rusqlite::Connection;
use std::fs;
use tauri::{AppHandle, Manager};

/// Migrations appliquées dans l'ordre. L'index dans le tableau + 1 correspond
/// au numéro de version enregistré dans `PRAGMA user_version`.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/01_init.sql"),
    include_str!("../migrations/02_devices_school_nullable.sql"),
    include_str!("../migrations/03_pending_mutations.sql"),
    include_str!("../migrations/04_session2_academic_years.sql"),
    include_str!("../migrations/05_seed_default.sql"),
    include_str!("../migrations/06_student_details.sql"),
    include_str!("../migrations/07_student_birth_place.sql"),
    include_str!("../migrations/08_school_extended_fields.sql"),
    include_str!("../migrations/09_sync_engine.sql"),
    include_str!("../migrations/10_financial_module.sql"),
    include_str!("../migrations/11_academic_module.sql"),
    include_str!("../migrations/12_grading_periods_class.sql"),
    include_str!("../migrations/13_pedagogical_structure.sql"),
    include_str!("../migrations/14_personnel_module.sql"),
    include_str!("../migrations/15_class_homeroom_teacher.sql"),
    include_str!("../migrations/16_timetable.sql"),
    include_str!("../migrations/17_perf_indexes.sql"),
    include_str!("../migrations/18_offline_auth.sql"),
    include_str!("../migrations/19_seed_realistic.sql"),
    include_str!("../migrations/20_seed_users.sql"),
    include_str!("../migrations/21_set_direction_pin.sql"),
    include_str!("../migrations/22_set_admin_pin.sql"),
    include_str!("../migrations/23_local_auth_password.sql"),
    include_str!("../migrations/24_library_module.sql"),
    include_str!("../migrations/25_link_profiles_staff.sql"),
    include_str!("../migrations/26_local_session_tokens.sql"),
    include_str!("../migrations/27_license_lifecycle.sql"),
    include_str!("../migrations/28_device_license_binding.sql"),
    include_str!("../migrations/29_normalize_absent_scores.sql"),
    include_str!("../migrations/30_seed_comptable_role.sql"),
];

pub(crate) fn run_migrations(conn: &Connection) -> Result<(), String> {
    let current: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("Erreur lecture user_version: {}", e))?;

    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        if version <= current {
            continue;
        }

        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Erreur ouverture transaction migration {:02}: {}", version, e))?;
        
        // Exécuter instruction par instruction pour ignorer les doublons de colonne
        // (cas des bases pré-migration ou des ALTER TABLE multiples dans un batch).
        // Découper par ";" puis nettoyer chaque instruction :
        // 1. On supprime les lignes de commentaires (--) en tête du bloc
        //    pour ne pas éliminer un CREATE TABLE qui suit un commentaire.
        // 2. On ignore les blocs entièrement vides après nettoyage.
        let statements: Vec<String> = sql
            .split(';')
            .map(|s| {
                // Supprimer les lignes de commentaires en début de bloc
                let mut result = s.trim();
                loop {
                    if result.starts_with("--") {
                        // Sauter jusqu'à la fin de la ligne de commentaire
                        result = result
                            .splitn(2, '\n')
                            .nth(1)
                            .unwrap_or("")
                            .trim();
                    } else {
                        break;
                    }
                }
                result.to_string()
            })
            .filter(|s| !s.is_empty())
            .collect();
        
        for stmt in &statements {
            if let Err(e) = tx.execute_batch(stmt) {
                let msg = e.to_string();
                if !msg.contains("duplicate column name") {
                    return Err(format!("Erreur migration {:02}: {}", version, msg));
                }
                // Colonne déjà existante → on continue
            }
        }
        
        tx.pragma_update(None, "user_version", version)
            .map_err(|e| format!("Erreur mise à jour user_version {:02}: {}", version, e))?;
        tx.commit()
            .map_err(|e| format!("Erreur validation migration {:02}: {}", version, e))?;
    }

    Ok(())
}

pub fn init(app: &AppHandle) -> Result<Connection, String> {
    // Récupérer le dossier de données de l'application (spécifique à l'OS)
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    
    // Créer le dossier s'il n'existe pas
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let db_path = app_dir.join("orion.sqlite");
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // Activer les clés étrangères et pragmas de haute performance
    conn.execute_batch("
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = -64000;
        PRAGMA temp_store = MEMORY;
        PRAGMA mmap_size = 268435456;
    ").map_err(|e| e.to_string())?;
    
    // Exécuter uniquement les migrations non encore appliquées
    run_migrations(&conn)?;

    Ok(conn)
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    use rusqlite::params;

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |row| row.get(0)).unwrap()
    }

    fn user_version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    fn object_exists(conn: &Connection, kind: &str, name: &str) -> bool {
        conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = ?1 AND name = ?2",
            params![kind, name],
            |row| row.get::<_, i64>(0),
        )
        .unwrap()
            > 0
    }

    fn column_exists(conn: &Connection, table: &str, column: &str) -> bool {
        let sql = format!("PRAGMA table_info({})", table);
        let mut stmt = conn.prepare(&sql).unwrap();
        let rows = stmt.query_map([], |row| row.get::<_, String>(1)).unwrap();
        let found = rows.flatten().any(|name| name == column);
        found
    }

    fn legacy_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        for sql in MIGRATIONS.iter().take(3) {
            conn.execute_batch(sql).unwrap();
        }
        conn.pragma_update(None, "user_version", 3).unwrap();

        conn.execute_batch(
            "INSERT INTO schools (id, name) VALUES
                 ('school-1', 'École 1'),
                 ('school-2', 'École 2');
             INSERT INTO academic_years (id, school_id, name, status, is_current, created_at, updated_at) VALUES
                 ('ay-1', 'school-1', '2025-2026', 'ACTIVE', 1, '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('ay-2', 'school-1', '2026-2027', 'PLANNED', 0, '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('ay-3', 'school-2', '2025-2026', 'ACTIVE', 1, '2025-09-01 08:00:00', '2025-09-01 08:00:00');
             INSERT INTO users (id, email, status, created_at, updated_at) VALUES
                 ('u-1', 'u1@orion.local', 'ACTIVE', '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('u-2', 'u2@orion.local', 'ACTIVE', '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('u-3', 'u3@orion.local', 'ACTIVE', '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('u-4', 'u4@orion.local', 'ACTIVE', '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('creator-1', 'creator@orion.local', 'ACTIVE', '2025-09-01 08:00:00', '2025-09-01 08:00:00');
             INSERT INTO profiles (id, user_id, school_id, first_name, last_name, created_at, updated_at) VALUES
                 ('p-1', 'u-1', 'school-1', 'Amina', 'Diallo', '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('p-2', 'u-2', 'school-1', 'Bakary', 'Sow', '2025-09-01 08:00:00', '2025-09-01 08:00:00'),
                 ('p-3', 'u-3', 'school-2', 'Chloé', 'Mensah', '2025-09-01 08:00:00', '2025-09-01 08:00:00');",
        )
        .unwrap();

        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute_batch(
            "INSERT INTO enrollments (id, school_id, academic_year_id, user_id, status, created_at, updated_at) VALUES
                 ('e-1', 'school-1', 'ay-1', 'u-1', 'ACTIVE', '2025-09-02 08:00:00', '2025-09-03 08:00:00'),
                 ('e-2', 'school-1', 'ay-1', 'u-2', 'ACTIVE', '2025-09-02 08:00:00', '2025-09-03 08:00:00'),
                 ('e-3', 'school-1', 'ay-2', 'u-1', 'ACTIVE', '2025-09-02 08:00:00', '2025-09-03 08:00:00'),
                 ('e-4', 'school-2', 'ay-3', 'u-3', 'ACTIVE', '2025-09-02 08:00:00', '2025-09-03 08:00:00'),
                 ('e-5', 'school-1', 'ay-1', 'u-1', 'ACTIVE', '2025-09-04 08:00:00', '2025-09-04 08:00:00'),
                 ('e-6', 'school-1', 'ay-1', 'u-4', 'ACTIVE', '2025-09-02 08:00:00', '2025-09-03 08:00:00'),
                 ('e-7', 'school-2', 'ay-3', 'u-ghost', 'ACTIVE', '2025-09-02 08:00:00', '2025-09-03 08:00:00');",
        )
        .unwrap();

        conn.execute_batch(
            "INSERT INTO enrollment_history (id, enrollment_id, status, notes, created_at, created_by) VALUES
                 ('h-1', 'e-1', 'CONFIRME', 'Inscription initiale', '2025-09-02 09:00:00', 'creator-1'),
                 ('h-2', 'e-2', 'TRANSFER', 'Changement de classe', '2025-09-05 09:00:00', 'creator-1'),
                 ('h-3', 'e-5', 'DOUBLON', 'Doublon historique', '2025-09-06 09:00:00', 'creator-1'),
                 ('h-4', 'e-3', 'PROMOTED', 'Passage en classe supérieure', '2025-09-07 09:00:00', 'creator-1'),
                 ('h-5', 'missing', 'ORPHAN', 'Historique orphelin', '2025-09-08 09:00:00', 'creator-1'),
                 ('h-6', 'e-4', 'VALIDE', NULL, '2025-09-09 09:00:00', 'creator-1');",
        )
        .unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        conn
    }

    #[test]
    fn migration_04_preserves_legacy_enrollment_data() {
        let conn = legacy_db();

        run_migrations(&conn).unwrap();

        assert_eq!(user_version(&conn), 30);
        assert!(object_exists(&conn, "table", "enrollments_legacy_v1"));
        assert!(object_exists(
            &conn,
            "table",
            "enrollment_history_legacy_v1"
        ));
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM enrollments_legacy_v1"),
            7
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM enrollment_history_legacy_v1"),
            6
        );
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM enrollments"), 6);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM enrollment_history"), 5);

        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollments WHERE id IN ('e-1','e-2','e-3','e-4','e-6','e-7')"
            ),
            6
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM students WHERE id IN ('u-1','u-2','u-3','u-4','u-ghost')"
            ),
            5
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollment_history WHERE id IN ('h-1','h-2','h-3','h-4','h-6')"
            ),
            5
        );

        let canonical: String = conn
            .query_row(
                "SELECT enrollment_id FROM enrollment_history WHERE id = 'h-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let legacy_enrollment_id: String = conn
            .query_row(
                "SELECT legacy_enrollment_id FROM enrollment_history WHERE id = 'h-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let legacy_status: String = conn
            .query_row(
                "SELECT legacy_status FROM enrollment_history WHERE id = 'h-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let legacy_notes: String = conn
            .query_row(
                "SELECT legacy_notes FROM enrollment_history WHERE id = 'h-3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let fallback_reason: String = conn
            .query_row(
                "SELECT reason FROM enrollment_history WHERE id = 'h-6'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let legacy_user_id: String = conn
            .query_row(
                "SELECT legacy_user_id FROM enrollments WHERE id = 'e-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM enrollments WHERE id = 'e-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(canonical, "e-1");
        assert_eq!(legacy_enrollment_id, "e-5");
        assert_eq!(legacy_status, "DOUBLON");
        assert_eq!(legacy_notes, "Doublon historique");
        assert_eq!(fallback_reason, "LEGACY:VALIDE");
        assert_eq!(legacy_user_id, "u-1");
        assert_eq!(created_at, "2025-09-02 08:00:00");

        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollments e LEFT JOIN students s ON s.id = e.student_id WHERE s.id IS NULL"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollments e LEFT JOIN schools s ON s.id = e.school_id WHERE s.id IS NULL"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollments e LEFT JOIN academic_years ay ON ay.id = e.academic_year_id WHERE ay.id IS NULL"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollment_history h LEFT JOIN enrollments e ON e.id = h.enrollment_id WHERE e.id IS NULL"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM enrollment_history h LEFT JOIN academic_years ay ON ay.id = h.academic_year_id WHERE ay.id IS NULL"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM (
                     SELECT academic_year_id, student_id, COUNT(*) AS duplicated
                     FROM enrollments
                     GROUP BY academic_year_id, student_id
                     HAVING duplicated > 1
                 )"
            ),
            0
        );

        for index in [
            "idx_single_active_year",
            "idx_single_planned_year",
            "idx_single_current_year",
            "idx_student_yearly_enrollment",
            "idx_enrollments_school_year",
            "idx_enrollments_class",
        ] {
            assert!(
                object_exists(&conn, "index", index),
                "index missing: {}",
                index
            );
        }

        assert!(column_exists(&conn, "enrollments", "legacy_user_id"));
        for column in ["legacy_enrollment_id", "legacy_status", "legacy_notes"] {
            assert!(
                column_exists(&conn, "enrollment_history", column),
                "column missing: {}",
                column
            );
        }
    }

    #[test]
    fn blank_database_migrations_create_legacy_backup_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        run_migrations(&conn).unwrap();

        assert_eq!(user_version(&conn), 30);
        assert!(object_exists(&conn, "table", "enrollments_legacy_v1"));
        assert!(object_exists(
            &conn,
            "table",
            "enrollment_history_legacy_v1"
        ));
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM enrollments_legacy_v1"),
            0
        );
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM enrollment_history_legacy_v1"),
            0
        );
        assert!(object_exists(
            &conn,
            "index",
            "idx_student_yearly_enrollment"
        ));
        assert!(column_exists(&conn, "enrollments", "legacy_user_id"));
        assert!(column_exists(&conn, "enrollment_history", "legacy_status"));
        assert!(column_exists(&conn, "enrollment_history", "legacy_notes"));
    }

    #[test]
    fn migration_04_failure_rolls_back_to_legacy_tables() {
        let conn = legacy_db();
        conn.execute_batch("CREATE VIEW enrollments_legacy_v1 AS SELECT 1 AS id;")
            .unwrap();

        let error = run_migrations(&conn).unwrap_err();

        assert!(
            error.contains("Erreur migration 04"),
            "unexpected error: {}",
            error
        );
        assert_eq!(user_version(&conn), 3);
        assert!(object_exists(&conn, "table", "enrollments"));
        assert!(object_exists(&conn, "table", "enrollment_history"));
        assert!(!object_exists(&conn, "table", "enrollments_legacy_v1"));
        assert!(!object_exists(
            &conn,
            "table",
            "enrollment_history_legacy_v1"
        ));
        assert!(object_exists(&conn, "view", "enrollments_legacy_v1"));
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM enrollments"), 7);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM enrollment_history"), 6);
        assert!(column_exists(&conn, "enrollments", "user_id"));
    }

    #[test]
    fn migration_29_normalizes_absent_scores() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        run_migrations(&conn).unwrap();
        conn.pragma_update(None, "user_version", 28).unwrap();

        for (id, score, is_absent) in [("abs-bad", 14.0, 1), ("present-ok", 14.5, 0)] {
            conn.execute(
                "INSERT INTO grades (id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id, grading_period_id, grade_type_id, score, max_score, recorded_by, is_absent, created_at, updated_at)
                 VALUES (?1, 's', 'y', 'e', 'st', 'cs', 'gp', 'gt', ?2, 20.0, 'u', ?3, '2026-01-01', '2026-01-01')",
                rusqlite::params![id, score, is_absent],
            )
            .unwrap();
        }

        run_migrations(&conn).unwrap();

        assert_eq!(user_version(&conn), 30);
        let absent_score: f64 = conn
            .query_row("SELECT score FROM grades WHERE id = 'abs-bad'", [], |r| r.get(0))
            .unwrap();
        let present_score: f64 = conn
            .query_row("SELECT score FROM grades WHERE id = 'present-ok'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(absent_score, 0.0);
        assert_eq!(present_score, 14.5);
    }

    #[test]
    fn migration_30_seeds_comptable_role() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        assert_eq!(user_version(&conn), 30);
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM roles WHERE name = 'COMPTABLE'"),
            1
        );
    }
}
