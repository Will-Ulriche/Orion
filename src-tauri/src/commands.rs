use tauri::State;
use tauri::Manager;
use rusqlite::Connection;
use std::sync::Mutex;
use sysinfo::System;
use serde::{Deserialize, Serialize};
use crate::models::AcademicYear;

#[derive(Serialize, Deserialize)]
pub struct DeviceInfo {
    pub identifier: String,
    pub name: String,
    pub platform: String,
}

// SyncStatus est défini dans sync.rs — on réexporte pour la compatibilité
pub use crate::sync::{SyncStatus, PendingMutation, InboxConflict};

// Structure d'état pour conserver la connexion SQLite
pub struct DbState(pub Mutex<Connection>);

// Helper pour enregistrer une mutation dans l'outbox
pub fn record_mutation(
    conn: &Connection,
    school_id: &str,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let mutation_id = uuid::Uuid::new_v4().to_string();
    let payload_str = payload.to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PENDING')",
        rusqlite::params![mutation_id, school_id, entity_type, entity_id, operation, payload_str],
    ).map_err(|e| format!("Erreur lors de l'enregistrement de la mutation: {}", e))?;
    Ok(())
}

// Colonnes présentes côté Supabase pour chaque entité synchronisée.
// Toute colonne locale absente de cette liste est écartée du payload : PostgREST
// rejette une requête dès qu'une colonne inconnue y figure.
const REMOTE_COLUMNS: &[(&str, &[&str])] = &[
    ("academic_years", &["id", "school_id", "name", "start_date", "end_date", "status", "is_current", "closed_at", "created_at", "updated_at"]),
    ("classes",        &["id", "school_id", "academic_year_id", "name", "level", "created_at", "updated_at"]),
    ("students",       &["id", "school_id", "first_name", "last_name", "birth_date", "gender", "photo_url", "matricule", "address", "phone", "parent_name", "parent_phone", "parent_email", "blood_type", "medical_notes", "birth_place", "created_at", "updated_at"]),
    ("enrollments",    &["id", "school_id", "academic_year_id", "student_id", "class_id", "enrollment_number", "enrollment_date", "status", "enrollment_type", "previous_class_id", "created_at", "updated_at"]),
];

// Colonnes booléennes : SQLite les range en 0/1, PostgreSQL attend true/false.
const BOOLEAN_COLUMNS: &[&str] = &["is_current"];

/// Convertit une valeur SQLite en JSON, en honorant le type booléen attendu.
fn column_to_json(row: &rusqlite::Row, idx: usize, as_bool: bool) -> rusqlite::Result<serde_json::Value> {
    Ok(match row.get_ref(idx)? {
        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
        rusqlite::types::ValueRef::Integer(i) => {
            if as_bool {
                serde_json::Value::Bool(i != 0)
            } else {
                serde_json::Value::from(i)
            }
        }
        rusqlite::types::ValueRef::Real(f) => serde_json::Value::from(f),
        rusqlite::types::ValueRef::Text(t) => {
            serde_json::Value::from(String::from_utf8_lossy(t).into_owned())
        }
        rusqlite::types::ValueRef::Blob(_) => serde_json::Value::Null,
    })
}

fn local_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    Ok(rows.filter_map(Result::ok).collect())
}

/// Sérialise une ligne locale en payload prêt pour PostgREST, limité aux
/// colonnes que la table distante connaît.
fn remote_payload(conn: &Connection, table: &str, id: &str) -> Result<serde_json::Value, String> {
    let remote = REMOTE_COLUMNS
        .iter()
        .find(|(t, _)| *t == table)
        .map(|(_, cols)| *cols)
        .ok_or_else(|| format!("Table non synchronisable : {}", table))?;

    let local = local_columns(conn, table).map_err(|e| e.to_string())?;
    let selected: Vec<&str> = remote
        .iter()
        .copied()
        .filter(|c| local.iter().any(|l| l == c))
        .collect();

    let sql = format!("SELECT {} FROM {} WHERE id = ?1", selected.join(", "), table);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let cols = selected.clone();
    let mut rows = stmt
        .query_map(rusqlite::params![id], |row| {
            let mut map = serde_json::Map::new();
            for (i, col) in cols.iter().enumerate() {
                map.insert(
                    (*col).to_string(),
                    column_to_json(row, i, BOOLEAN_COLUMNS.contains(col))?,
                );
            }
            Ok(serde_json::Value::Object(map))
        })
        .map_err(|e| e.to_string())?;

    match rows.next() {
        Some(row) => row.map_err(|e| e.to_string()),
        None => Err(format!("Ligne introuvable dans {} : {}", table, id)),
    }
}

/// Met une entité locale en file d'attente pour Supabase.
fn enqueue_entity(conn: &Connection, table: &str, school_id: &str, id: &str) {
    if let Ok(payload) = remote_payload(conn, table, id) {
        // `UPSERT` est idempotent (`?on_conflict=id`) : rejouer l'envoi d'une
        // entité déjà présente ne provoque pas d'erreur de doublon.
        let _ = record_mutation(conn, school_id, table, id, "UPSERT", &payload);
    }
}

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
// COMMANDE : État complet du moteur de synchronisation
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_sync_status(app: tauri::AppHandle) -> Result<SyncStatus, String> {
    // Même source de vérité que `trigger_sync` : la commandelit la base via
    // son propre chemin, sinon l'affichage pouvait diverger du moteur.
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::get_sync_status_internal(&db_path)
}

// ──────────────────────────────────────────────
// COMMANDE : Remettre en file les mutations définitivement échouées
// ──────────────────────────────────────────────
#[tauri::command]
pub fn retry_failed_mutations(app: tauri::AppHandle) -> Result<usize, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::retry_failed_mutations_internal(&db_path)
}

// ──────────────────────────────────────────────
// COMMANDE : Resynchronisation complète (tout l'état local vers le cloud)
// Les entités créées localement avant que l'outbox ne les couvre n'y figurent
// jamais : sans ce rattrapage, leurs enfants restent bloqués par la clé étrangère.
// ──────────────────────────────────────────────
#[tauri::command]
pub fn enqueue_full_resync(school_id: String, state: State<'_, DbState>) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let mut enqueued = 0usize;
    // L'ordre suit les dépendances : année scolaire → classes → élèves → inscriptions.
    for table in ["academic_years", "classes", "students", "enrollments"] {
        let mut stmt = conn
            .prepare(&format!("SELECT id FROM {} WHERE school_id = ?1", table))
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = stmt
            .query_map(rusqlite::params![school_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        drop(stmt);

        for id in ids {
            enqueue_entity(&conn, table, &school_id, &id);
            enqueued += 1;
        }
    }

    Ok(enqueued)
}

// ──────────────────────────────────────────────
// COMMANDE : Synchronisation manuelle (bouton utilisateur)
// ──────────────────────────────────────────────
#[tauri::command]
pub async fn trigger_sync(app: tauri::AppHandle) -> Result<SyncStatus, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::run_manual_sync(db_path).await
}

// ──────────────────────────────────────────────
// COMMANDE : Liste des mutations en attente
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_pending_mutations(app: tauri::AppHandle) -> Result<Vec<PendingMutation>, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::get_pending_mutations_internal(&db_path)
}

// ──────────────────────────────────────────────
// COMMANDE : Liste des conflits à résoudre
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_sync_conflicts(app: tauri::AppHandle) -> Result<Vec<InboxConflict>, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::get_conflicts_internal(&db_path)
}

// ──────────────────────────────────────────────
// COMMANDE : Résolution manuelle d'un conflit
// ──────────────────────────────────────────────
#[tauri::command]
pub fn resolve_sync_conflict(
    inbox_id: String,
    choice: String,   // "LOCAL" ou "REMOTE"
    app: tauri::AppHandle,
) -> Result<(), String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::resolve_conflict_internal(&db_path, &inbox_id, &choice)
}

// ──────────────────────────────────────────────
// COMMANDE : Enregistrer les paramètres de l'établissement (Offline-First)
// ──────────────────────────────────────────────
#[tauri::command]
pub fn save_school_settings(payload: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;
    
    let s: serde_json::Value = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let get = |key: &str| s.get(key).and_then(|v| v.as_str());

    conn.execute(
        "UPDATE schools SET 
            name = ?1, short_name = ?2, address = ?3, city = ?4, country = ?5, 
            phone_primary = ?6, phone_secondary = ?7, email = ?8, website = ?9, 
            currency = ?10, timezone = ?11,
            logo_url = ?12, stamp_url = ?13, signature_url = ?14,
            ministry_name = ?15, head_title = ?16, head_name = ?17,
            slogan = ?18, registration_number = ?19
         WHERE id = 'school-1'",
        rusqlite::params![
            get("name").unwrap_or(""),
            get("short_name"), get("address"), get("city"), get("country"),
            get("phone"), get("phone_secondary"), get("email"), get("website"),
            get("currency"), get("timezone"),
            get("logo_url"), get("stamp_url"), get("signature_url"),
            get("ministry_name"), get("head_title"), get("head_name"),
            get("slogan"), get("registration_number")
        ]
    ).map_err(|e| format!("Erreur SQLite UPDATE schools: {}", e))?;

    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![mutation_id, "school", "school-1", "UPSERT", &payload]
    ).map_err(|e| format!("Erreur SQLite pending_mutations: {}", e))?;
    
    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), "school-1", "UPDATE_SETTINGS", "schools", &payload]
    ).unwrap_or(0);

    Ok(())
}

#[tauri::command]
pub fn get_school_settings(state: State<'_, DbState>) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;
    let mut stmt = conn.prepare(
        "SELECT name, short_name, address, city, country, phone_primary, phone_secondary, email, website, currency, timezone,
                logo_url, stamp_url, signature_url, ministry_name, head_title, head_name, slogan, registration_number
         FROM schools WHERE id = 'school-1'"
    ).map_err(|e| e.to_string())?;
    
    let settings = stmt.query_row([], |row| {
        let g = |i: usize| -> rusqlite::Result<String> { Ok(row.get::<_, Option<String>>(i)?.unwrap_or_default()) };
        Ok(serde_json::json!({
            "name": g(0)?,
            "short_name": g(1)?,
            "address": g(2)?,
            "city": g(3)?,
            "country": g(4)?,
            "phone": g(5)?,
            "phone_secondary": g(6)?,
            "email": g(7)?,
            "website": g(8)?,
            "currency": g(9)?,
            "timezone": g(10)?,
            "logo_url": g(11)?,
            "stamp_url": g(12)?,
            "signature_url": g(13)?,
            "ministry_name": g(14)?,
            "head_title": g(15)?,
            "head_name": g(16)?,
            "slogan": g(17)?,
            "registration_number": g(18)?,
        }))
    }).map_err(|e| e.to_string())?;
    
    Ok(settings)
}

// ──────────────────────────────────────────────
// COMMANDE : Récupérer les années académiques
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_academic_years(school_id: String, state: State<'_, DbState>) -> Result<Vec<AcademicYear>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, school_id, name, start_date, end_date, status, is_current FROM academic_years WHERE school_id = ?1 ORDER BY start_date DESC").map_err(|e| e.to_string())?;
    let year_iter = stmt.query_map(rusqlite::params![school_id], |row| {
        Ok(AcademicYear {
            id: row.get(0)?,
            school_id: row.get(1)?,
            name: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            status: row.get(5)?,
            is_current: row.get::<_, i32>(6)? == 1,
        })
    }).map_err(|e| e.to_string())?;

    let mut years = Vec::new();
    for year in year_iter {
        years.push(year.map_err(|e| e.to_string())?);
    }
    
    Ok(years)
}

// ──────────────────────────────────────────────
// COMMANDE : Créer une année académique
// ──────────────────────────────────────────────
#[tauri::command]
pub fn create_academic_year(school_id: String, name: String, start_date: String, end_date: String, user_id: String, state: State<'_, DbState>) -> Result<AcademicYear, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    // Check if PLANNED exists
    let planned_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM academic_years WHERE school_id = ?1 AND status = 'PLANNED'",
        rusqlite::params![school_id],
        |row| row.get(0),
    ).unwrap_or(0);
    
    if planned_count > 0 {
        return Err("Une année PLANNED existe déjà pour cet établissement.".to_string());
    }
    
    let id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO academic_years (id, school_id, name, start_date, end_date, status, is_current, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, 'PLANNED', 0, ?6)",
        rusqlite::params![id, school_id, name, start_date, end_date, user_id],
    ).map_err(|e| e.to_string())?;

    // L'année scolaire est la racine de dépendances des classes, élèves et
    // inscriptions : sans elle dans l'outbox, aucun envoi enfant ne peut aboutir
    // (violation de clé étrangère côté Supabase).
    enqueue_entity(&conn, "academic_years", &school_id, &id);

    Ok(AcademicYear {
        id, school_id, name, start_date: Some(start_date), end_date: Some(end_date), status: "PLANNED".to_string(), is_current: false
    })
}

// ──────────────────────────────────────────────
// COMMANDE : Modifier une année académique
// ──────────────────────────────────────────────
#[tauri::command]
pub fn update_academic_year(id: String, school_id: String, name: String, start_date: String, end_date: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    conn.execute(
        "UPDATE academic_years SET name = ?1, start_date = ?2, end_date = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4 AND school_id = ?5",
        rusqlite::params![name, start_date, end_date, id, school_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Ouvrir une année académique (ACTIVE)
// ──────────────────────────────────────────────
#[tauri::command]
pub fn open_academic_year(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    // Check if ACTIVE exists
    let active_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM academic_years WHERE school_id = ?1 AND status = 'ACTIVE'",
        rusqlite::params![school_id],
        |row| row.get(0),
    ).unwrap_or(0);
    
    if active_count > 0 {
        return Err("Une année ACTIVE existe déjà. Veuillez la clôturer d'abord.".to_string());
    }
    
    conn.execute(
        "UPDATE academic_years SET status = 'ACTIVE', is_current = 1 WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Clôturer une année académique
// ──────────────────────────────────────────────
#[tauri::command]
pub fn close_academic_year(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let status: String = conn.query_row(
        "SELECT status FROM academic_years WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
        |row| row.get(0),
    ).map_err(|_| "Année introuvable.".to_string())?;

    if status != "ACTIVE" {
        return Err("Seule une année ACTIVE peut être clôturée.".to_string());
    }

    conn.execute(
        "UPDATE academic_years SET status = 'CLOSED', is_current = 0, closed_at = CURRENT_TIMESTAMP WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Archiver une année académique
// ──────────────────────────────────────────────
#[tauri::command]
pub fn archive_academic_year(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let status: String = conn.query_row(
        "SELECT status FROM academic_years WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
        |row| row.get(0),
    ).map_err(|_| "Année introuvable.".to_string())?;

    if status != "CLOSED" {
        return Err("Seule une année CLOSED peut être archivée. Clôturez l'année d'abord.".to_string());
    }

    conn.execute(
        "UPDATE academic_years SET status = 'ARCHIVED' WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Supprimer une année académique
// ──────────────────────────────────────────────
#[tauri::command]
pub fn delete_academic_year(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    // On refuse de supprimer l'année active
    let status: String = conn.query_row(
        "SELECT status FROM academic_years WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
        |row| row.get(0),
    ).map_err(|_| "Année introuvable.".to_string())?;

    if status == "ACTIVE" {
        return Err("Impossible de supprimer l'année active. Veuillez d'abord la clôturer.".to_string());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Suppression en cascade des données liées (ordre des dépendances)
    tx.execute(
        "DELETE FROM enrollment_history WHERE academic_year_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM enrollments WHERE academic_year_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM classes WHERE academic_year_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM academic_years WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Transfert de classe (même année scolaire)
// Distincte de la promotion : on reste dans la même année,
// on change seulement la classe de l'inscription.
// ──────────────────────────────────────────────
#[tauri::command]
pub fn transfer_class_within_year(
    enrollment_id: String,
    new_class_id: Option<String>,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    // Récupérer school_id et academic_year_id pour vérifier le verrouillage
    let (school_id, academic_year_id, old_class_id): (String, String, Option<String>) = conn.query_row(
        "SELECT school_id, academic_year_id, class_id FROM enrollments WHERE id = ?1",
        rusqlite::params![enrollment_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Inscription introuvable.".to_string())?;

    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    // Vérifier que la classe cible appartient bien à la même année
    if let Some(ref cid) = new_class_id {
        let class_year: String = conn.query_row(
            "SELECT academic_year_id FROM classes WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![cid, school_id],
            |row| row.get(0),
        ).map_err(|_| "Classe introuvable ou n'appartient pas à cet établissement.".to_string())?;

        if class_year != academic_year_id {
            return Err("La classe cible n'appartient pas à la même année scolaire. Utilisez la promotion pour changer d'année.".to_string());
        }
    }

    // Mise à jour de la classe + tracé dans l'historique
    conn.execute(
        "UPDATE enrollments SET class_id = ?1, enrollment_type = 'TRANSFER_CLASS' WHERE id = ?2",
        rusqlite::params![new_class_id, enrollment_id],
    ).map_err(|e| e.to_string())?;

    let history_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO enrollment_history (id, enrollment_id, student_id, academic_year_id, reason)
         SELECT ?1, ?2, student_id, ?3, ?4 FROM enrollments WHERE id = ?2",
        rusqlite::params![
            history_id, enrollment_id, academic_year_id,
            format!("TRANSFER_CLASS: {:?} → {:?}", old_class_id, new_class_id)
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Synchroniser l'utilisateur Supabase en local
// ──────────────────────────────────────────────
#[tauri::command]
pub fn sync_local_user(user_id: String, email: String, school_id: String, school_name: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    // Upsert school
    conn.execute(
        "INSERT INTO schools (id, name) VALUES (?1, ?2) 
         ON CONFLICT(id) DO UPDATE SET name = excluded.name",
        rusqlite::params![school_id, school_name],
    ).map_err(|e| format!("Erreur sync école: {}", e))?;

    // Upsert user
    conn.execute(
        "INSERT INTO users (id, email) VALUES (?1, ?2) 
         ON CONFLICT(id) DO UPDATE SET email = excluded.email",
        rusqlite::params![user_id, email],
    ).map_err(|e| format!("Erreur sync utilisateur: {}", e))?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Classes
// ──────────────────────────────────────────────
use crate::models::{Class, StudentEnrollment};

fn ensure_year_is_open(conn: &rusqlite::Connection, school_id: &str, year_id: &str) -> Result<(), String> {
    let status: String = conn.query_row(
        "SELECT status FROM academic_years WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![year_id, school_id],
        |row| row.get(0),
    ).map_err(|_| "Année introuvable.".to_string())?;

    if status == "CLOSED" || status == "ARCHIVED" {
        return Err("L'année sélectionnée est clôturée ou archivée. Modification impossible.".to_string());
    }
    Ok(())
}


#[tauri::command]
pub fn get_classes(school_id: String, academic_year_id: String, state: State<'_, DbState>) -> Result<Vec<Class>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let mut stmt = conn.prepare("
        SELECT c.id, c.school_id, c.academic_year_id, c.name, c.level,
               (SELECT COUNT(*) FROM enrollments e
                 WHERE e.class_id = c.id
                   AND e.academic_year_id = c.academic_year_id
                   AND e.status = 'ACTIVE') AS student_count
        FROM classes c
        WHERE c.school_id = ?1 AND c.academic_year_id = ?2
        ORDER BY c.name ASC
    ").map_err(|e| e.to_string())?;
    let classes_iter = stmt.query_map(rusqlite::params![school_id, academic_year_id], |row| {
        Ok(Class {
            id: row.get(0)?,
            school_id: row.get(1)?,
            academic_year_id: row.get(2)?,
            name: row.get(3)?,
            level: row.get(4)?,
            student_count: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut classes = Vec::new();
    for class in classes_iter {
        classes.push(class.map_err(|e| e.to_string())?);
    }
    
    Ok(classes)
}

#[tauri::command]
pub fn create_class(school_id: String, academic_year_id: String, name: String, level: Option<String>, state: State<'_, DbState>) -> Result<Class, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO classes (id, school_id, academic_year_id, name, level) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, school_id, academic_year_id, name, level],
    ).map_err(|e| e.to_string())?;

    // La classe est le parent direct des inscriptions : elle doit rejoindre
    // l'outbox, sinon `enrollments.class_id` ne peut pas être résolu côté cloud.
    enqueue_entity(&conn, "classes", &school_id, &id);

    Ok(Class {
        id, school_id, academic_year_id, name, level, student_count: 0
    })
}

#[tauri::command]
pub fn update_class(id: String, name: String, level: Option<String>, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let (school_id, academic_year_id): (String, String) = conn.query_row(
        "SELECT school_id, academic_year_id FROM classes WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|_| "Classe introuvable".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    conn.execute(
        "UPDATE classes SET name = ?1, level = ?2 WHERE id = ?3",
        rusqlite::params![name, level, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_class(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let (school_id, academic_year_id): (String, String) = conn.query_row(
        "SELECT school_id, academic_year_id FROM classes WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|_| "Classe introuvable".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    // Les élèves de la classe passent en "non assigné" au lieu d'être supprimés
    conn.execute(
        "UPDATE enrollments SET class_id = NULL WHERE class_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM classes WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Élèves et Inscriptions
// ──────────────────────────────────────────────
#[tauri::command]
pub fn delete_enrollment(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    let (school_id, academic_year_id): (String, String) = conn.query_row(
        "SELECT school_id, academic_year_id FROM enrollments WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|_| "Inscription introuvable".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    // Supprimer d'abord l'historique lié (clé étrangère enrollment_id → enrollments.id)
    conn.execute("DELETE FROM enrollment_history WHERE enrollment_id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM enrollments WHERE id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_students(school_id: String, academic_year_id: String, class_id: Option<String>, state: State<'_, DbState>) -> Result<Vec<StudentEnrollment>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let mut query = "
        SELECT e.id, e.student_id, e.class_id, e.enrollment_type, e.status,
               s.first_name, s.last_name, s.matricule, s.photo_url, c.name as class_name,
               c.level as class_level, s.birth_date, s.birth_place, s.gender, s.address
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE e.school_id = ?1 AND e.academic_year_id = ?2
    ".to_string();
    
    if class_id.is_some() {
        query.push_str(" AND e.class_id = ?3");
    }
    
    query.push_str(" ORDER BY s.last_name ASC, s.first_name ASC");
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let params: Vec<&dyn rusqlite::ToSql> = if let Some(ref cid) = class_id {
        vec![&school_id, &academic_year_id, cid]
    } else {
        vec![&school_id, &academic_year_id]
    };

    let iter = stmt.query_map(params.as_slice(), |row| {
        Ok(StudentEnrollment {
            id: row.get(0)?,
            student_id: row.get(1)?,
            class_id: row.get(2)?,
            enrollment_type: row.get(3)?,
            status: row.get(4)?,
            first_name: row.get(5)?,
            last_name: row.get(6)?,
            matricule: row.get(7)?,
            photo_url: row.get(8)?,
            class_name: row.get(9)?,
            class_level: row.get(10)?,
            birth_date: row.get(11)?,
            birth_place: row.get(12)?,
            gender: row.get(13)?,
            address: row.get(14)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut students = Vec::new();
    for student in iter {
        students.push(student.map_err(|e| e.to_string())?);
    }
    
    Ok(students)
}

#[tauri::command]
pub fn create_student(school_id: String, academic_year_id: String, first_name: String, last_name: String, class_id: Option<String>, state: State<'_, DbState>) -> Result<StudentEnrollment, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    
    let student_id = uuid::Uuid::new_v4().to_string();
    let enrollment_id = uuid::Uuid::new_v4().to_string();
    
    // Begin transaction conceptually
    conn.execute(
        "INSERT INTO students (id, school_id, first_name, last_name) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![student_id, school_id, first_name, last_name],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_type, status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'NEW', 'ACTIVE')",
        rusqlite::params![enrollment_id, school_id, academic_year_id, student_id, class_id],
    ).map_err(|e| e.to_string())?;
    
    let (class_name, class_level): (Option<String>, Option<String>) = if let Some(ref cid) = class_id {
        conn.query_row(
            "SELECT name, level FROM classes WHERE id = ?1",
            rusqlite::params![cid],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap_or((None, None))
    } else {
        (None, None)
    };

    let student = serde_json::json!({
        "id": student_id,
        "school_id": school_id,
        "first_name": first_name,
        "last_name": last_name
    });

    let enrollment = serde_json::json!({
        "id": enrollment_id,
        "school_id": school_id,
        "academic_year_id": academic_year_id,
        "student_id": student_id,
        "class_id": class_id,
        "enrollment_type": "NEW",
        "status": "ACTIVE"
    });

    record_mutation(&conn, &school_id, "students", &student_id, "INSERT", &student)?;
    record_mutation(&conn, &school_id, "enrollments", &enrollment_id, "INSERT", &enrollment)?;

    Ok(StudentEnrollment {
        id: enrollment_id,
        student_id,
        class_id,
        enrollment_type: "NEW".to_string(),
        status: "ACTIVE".to_string(),
        first_name: Some(first_name),
        last_name: Some(last_name),
        matricule: None,
        photo_url: None,
        class_name,
        class_level,
        birth_date: None,
        birth_place: None,
        gender: None,
        address: None,
    })
}

#[tauri::command]
pub fn get_student_details(student_id: String, state: State<'_, DbState>) -> Result<crate::models::Student, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let mut stmt = conn.prepare("
        SELECT id, first_name, last_name, birth_date, birth_place, gender, photo_url, matricule,
               address, phone, parent_name, parent_phone, parent_email, blood_type, medical_notes
        FROM students
        WHERE id = ?1
    ").map_err(|e| e.to_string())?;
    
    let student = stmt.query_row(rusqlite::params![student_id], |row| {
        Ok(crate::models::Student {
            id: row.get(0)?,
            first_name: row.get(1)?,
            last_name: row.get(2)?,
            birth_date: row.get(3)?,
            birth_place: row.get(4)?,
            gender: row.get(5)?,
            photo_url: row.get(6)?,
            matricule: row.get(7)?,
            address: row.get(8)?,
            phone: row.get(9)?,
            parent_name: row.get(10)?,
            parent_phone: row.get(11)?,
            parent_email: row.get(12)?,
            blood_type: row.get(13)?,
            medical_notes: row.get(14)?,
        })
    }).map_err(|e| e.to_string())?;
    
    Ok(student)
}

#[tauri::command]
pub fn update_student(student: crate::models::Student, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    conn.execute(
        "UPDATE students SET
            first_name = ?1, last_name = ?2, birth_date = ?3, birth_place = ?4, gender = ?5,
            photo_url = ?6, matricule = ?7, address = ?8, phone = ?9,
            parent_name = ?10, parent_phone = ?11, parent_email = ?12,
            blood_type = ?13, medical_notes = ?14
         WHERE id = ?15",
        rusqlite::params![
            student.first_name, student.last_name, student.birth_date, student.birth_place, student.gender,
            student.photo_url, student.matricule, student.address, student.phone,
            student.parent_name, student.parent_phone, student.parent_email,
            student.blood_type, student.medical_notes, student.id
        ],
    ).map_err(|e| e.to_string())?;
    
    // Ajout d'une entrée dans pending_mutations
    let mutation_id = uuid::Uuid::new_v4().to_string();
    let payload = serde_json::to_string(&student).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![mutation_id, "students", student.id, "UPDATE", payload]
    ).map_err(|e| e.to_string())?;
        
    Ok(())
}

#[tauri::command]
pub fn migrate_student(
    school_id: String, 
    student_id: String, 
    target_academic_year_id: String, 
    target_class_id: Option<String>, 
    enrollment_type: String, 
    state: State<'_, DbState>
) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    ensure_year_is_open(&conn, &school_id, &target_academic_year_id)?;
    
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM enrollments WHERE academic_year_id = ?1 AND student_id = ?2",
        rusqlite::params![target_academic_year_id, student_id],
        |row| row.get::<_, i64>(0)
    ).unwrap_or(0) > 0;

    if exists {
        return Err("Cet élève est déjà inscrit dans l'année cible.".to_string());
    }

    let enrollment_id = uuid::Uuid::new_v4().to_string();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_type, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ACTIVE')",
        rusqlite::params![enrollment_id, school_id, target_academic_year_id, student_id, target_class_id, enrollment_type],
    ).map_err(|e| e.to_string())?;

    let history_id = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO enrollment_history (id, enrollment_id, student_id, academic_year_id, reason)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![history_id, enrollment_id, student_id, target_academic_year_id, enrollment_type]
    ).map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct BulkMigrationItem {
    pub student_id: String,
    pub target_class_id: Option<String>,
    pub enrollment_type: String,
}

#[tauri::command]
pub fn bulk_migrate_students(
    school_id: String,
    target_academic_year_id: String,
    _source_academic_year_id: String,
    students: Vec<BulkMigrationItem>,
    state: State<'_, DbState>
) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    ensure_year_is_open(&conn, &school_id, &target_academic_year_id)?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    for item in students {
        let exists: bool = tx.query_row(
            "SELECT COUNT(*) FROM enrollments WHERE academic_year_id = ?1 AND student_id = ?2",
            rusqlite::params![target_academic_year_id, item.student_id],
            |row| row.get::<_, i64>(0)
        ).unwrap_or(0) > 0;

        if exists {
            continue; // Skip already migrated students silently
        }

        let enrollment_id = uuid::Uuid::new_v4().to_string();
        
        tx.execute(
            "INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_type, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ACTIVE')",
            rusqlite::params![enrollment_id, school_id, target_academic_year_id, item.student_id, item.target_class_id, item.enrollment_type],
        ).map_err(|e| e.to_string())?;

        let history_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO enrollment_history (id, enrollment_id, student_id, academic_year_id, reason)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![history_id, enrollment_id, item.student_id, target_academic_year_id, item.enrollment_type]
        ).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
