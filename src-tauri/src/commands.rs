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
