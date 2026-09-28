use tauri::State;
use rusqlite::Connection;
use std::sync::Mutex;
use sysinfo::System;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct DeviceInfo {
    pub identifier: String,
    pub name: String,
    pub platform: String,
}

// Structure d'état pour conserver la connexion SQLite
pub struct DbState(pub Mutex<Connection>);

#[tauri::command]
pub fn check_db_status(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;
    let mut stmt = conn.prepare("SELECT count(*) FROM roles").map_err(|e| e.to_string())?;
    
    let count: i64 = stmt.query_row([], |row| row.get(0)).unwrap_or(0);
    
    Ok(format!("Base de données active. Nombre de rôles de base insérés : {}", count))
}

#[tauri::command]
pub fn get_device_info() -> Result<DeviceInfo, String> {
    // Obtenir le Machine GUID unique à l'OS
    let uid = machine_uid::get().unwrap_or_else(|_| "unknown_device".to_string());
    
    // Obtenir le nom d'hôte ou nom du PC
    let host_name = System::host_name().unwrap_or_else(|| "Unknown PC".to_string());
    
    // Plateforme (Windows, macOS, Linux)
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    
    Ok(DeviceInfo {
        identifier: uid,
        name: host_name,
        platform: os_name,
    })
}

#[tauri::command]
pub fn register_device(state: State<'_, DbState>, school_id: Option<String>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let uid = machine_uid::get().unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
    let host_name = System::host_name().unwrap_or_else(|| "Unknown PC".to_string());
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let device_id = uuid::Uuid::new_v4().to_string();

    // Vérifier si l'appareil est déjà enregistré
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM devices WHERE device_identifier = ?1",
            rusqlite::params![uid],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if exists {
        // Mettre à jour last_seen_at
        conn.execute(
            "UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE device_identifier = ?1",
            rusqlite::params![uid],
        ).map_err(|e| e.to_string())?;
        return Ok(format!("Appareil déjà enregistré. Mise à jour effectuée."));
    }

    // Enregistrer le nouvel appareil (school_id peut être NULL si pas encore configuré)
    conn.execute(
        "INSERT INTO devices (id, school_id, device_identifier, device_name, platform, status, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ACTIVE', CURRENT_TIMESTAMP)",
        rusqlite::params![device_id, school_id, uid, host_name, os_name],
    ).map_err(|e| e.to_string())?;

    Ok(format!("Appareil enregistré : {} ({})", host_name, uid))
}
