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

#[derive(Serialize, Deserialize)]
pub struct SyncStatus {
    pub pending: i64,
    pub failed: i64,
    pub conflict: i64,
}

// Structure d'état pour conserver la connexion SQLite
pub struct DbState(pub Mutex<Connection>);

// ──────────────────────────────────────────────
// COMMANDE : Vérification de la base locale
// ──────────────────────────────────────────────
#[tauri::command]
pub fn check_db_status(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;
    let mut stmt = conn.prepare("SELECT count(*) FROM roles").map_err(|e| e.to_string())?;
    let count: i64 = stmt.query_row([], |row| row.get(0)).unwrap_or(0);
    Ok(format!("Base de données active. {} rôles configurés.", count))
}

// ──────────────────────────────────────────────
// COMMANDE : Informations sur l'appareil
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_device_info() -> Result<DeviceInfo, String> {
    let uid = machine_uid::get().unwrap_or_else(|_| "unknown_device".to_string());
    let host_name = System::host_name().unwrap_or_else(|| "Unknown PC".to_string());
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());

    Ok(DeviceInfo {
        identifier: uid,
        name: host_name,
        platform: os_name,
    })
}

// ──────────────────────────────────────────────
// COMMANDE : Enregistrement de l'appareil
// ──────────────────────────────────────────────
#[tauri::command]
pub fn register_device(state: State<'_, DbState>, school_id: Option<String>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let uid = machine_uid::get().unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());
    let host_name = System::host_name().unwrap_or_else(|| "Unknown PC".to_string());
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let device_id = uuid::Uuid::new_v4().to_string();

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM devices WHERE device_identifier = ?1",
            rusqlite::params![uid],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if exists {
        conn.execute(
            "UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE device_identifier = ?1",
            rusqlite::params![uid],
        ).map_err(|e| e.to_string())?;
        return Ok("Appareil reconnu — session mise à jour.".to_string());
    }

    conn.execute(
        "INSERT INTO devices (id, school_id, device_identifier, device_name, platform, status, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ACTIVE', CURRENT_TIMESTAMP)",
        rusqlite::params![device_id, school_id, uid, host_name, os_name],
    ).map_err(|e| e.to_string())?;

    Ok(format!("Appareil enregistré : {} ({})", host_name, uid))
}

// ──────────────────────────────────────────────
// COMMANDE : Vérification du rôle utilisateur (RBAC)
// ──────────────────────────────────────────────
#[tauri::command]
pub fn check_user_role(state: State<'_, DbState>, user_id: String, school_id: String, required_role: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    // SUPER_ADMIN a accès partout
    let is_super_admin: bool = conn.query_row(
        "SELECT COUNT(*) FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ?1 AND r.name = 'SUPER_ADMIN'",
        rusqlite::params![user_id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if is_super_admin {
        return Ok(true);
    }

    // DIRECTION a toutes les permissions de son établissement
    if required_role != "SUPER_ADMIN" {
        let is_direction: bool = conn.query_row(
            "SELECT COUNT(*) FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE ur.user_id = ?1 AND ur.school_id = ?2 AND r.name = 'DIRECTION'",
            rusqlite::params![user_id, school_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if is_direction {
            return Ok(true);
        }
    }

    // Vérifier le rôle spécifique demandé
    let has_role: bool = conn.query_row(
        "SELECT COUNT(*) FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ?1 AND ur.school_id = ?2 AND r.name = ?3",
        rusqlite::params![user_id, school_id, required_role],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    Ok(has_role)
}

// ──────────────────────────────────────────────
// COMMANDE : Écriture dans les journaux d'audit
// ──────────────────────────────────────────────
#[tauri::command]
pub fn write_audit_log(
    state: State<'_, DbState>,
    school_id: String,
    user_id: Option<String>,
    device_id: Option<String>,
    action: String,
    entity_type: String,
    entity_id: Option<String>,
    old_data: Option<String>,
    new_data: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO audit_logs (id, school_id, user_id, device_id, action, entity_type, entity_id, old_data, new_data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, school_id, user_id, device_id, action, entity_type, entity_id, old_data, new_data],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : État de la file de synchronisation
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_sync_status(state: State<'_, DbState>) -> Result<SyncStatus, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pending_mutations WHERE status = 'PENDING'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    let failed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pending_mutations WHERE status = 'FAILED'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    let conflict: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pending_mutations WHERE status = 'CONFLICT'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    Ok(SyncStatus { pending, failed, conflict })
}

// ──────────────────────────────────────────────
// COMMANDE : Enregistrer les paramètres de l'établissement (Offline-First)
// ──────────────────────────────────────────────
#[tauri::command]
pub fn save_school_settings(payload: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;
    
    // On insère l'action de mise à jour/création d'établissement dans la file d'attente
    conn.execute(
        "INSERT INTO pending_mutations (table_name, action, payload) VALUES (?1, ?2, ?3)",
        ["schools", "UPSERT", &payload]
    ).map_err(|e| format!("Erreur SQLite: {}", e))?;
    
    // On enregistre également cette action sensible dans l'audit
    // Dans une version plus avancée, on récupérait l'ID de l'utilisateur actif
    conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity, details) VALUES (?1, ?2, ?3, ?4)",
        ["current_user", "UPDATE_SETTINGS", "schools", &payload]
    ).unwrap_or(0);

    Ok(())
}
