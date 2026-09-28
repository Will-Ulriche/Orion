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
    
    // Exécuter la migration initiale
    let migration = include_str!("../migrations/01_init.sql");
    conn.execute_batch(migration).map_err(|e| format!("Erreur lors de la migration: {}", e))?;
    
    Ok(conn)
}
