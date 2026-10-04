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
    
    // Activer les clés étrangères pour garantir l'intégrité des données
    conn.execute("PRAGMA foreign_keys = ON;", []).map_err(|e| e.to_string())?;
    
    // Exécuter uniquement les migrations non encore appliquées
    run_migrations(&conn)?;

    Ok(conn)
}
