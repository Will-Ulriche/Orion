use rusqlite::Connection;
use std::fs;
use tauri::{AppHandle, Manager};

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
    
    // Exécuter les migrations dans l'ordre
    let migration_01 = include_str!("../migrations/01_init.sql");
    conn.execute_batch(migration_01).map_err(|e| format!("Erreur migration 01: {}", e))?;
    
    let migration_02 = include_str!("../migrations/02_devices_school_nullable.sql");
    conn.execute_batch(migration_02).map_err(|e| format!("Erreur migration 02: {}", e))?;
    
    let migration_03 = include_str!("../migrations/03_pending_mutations.sql");
    conn.execute_batch(migration_03).map_err(|e| format!("Erreur migration 03: {}", e))?;
    
    let migration_04 = include_str!("../migrations/04_session2_academic_years.sql");
    conn.execute_batch(migration_04).map_err(|e| format!("Erreur migration 04: {}", e))?;

    let migration_05 = include_str!("../migrations/05_seed_default.sql");
    conn.execute_batch(migration_05).map_err(|e| format!("Erreur migration 05: {}", e))?;

    Ok(conn)
}
