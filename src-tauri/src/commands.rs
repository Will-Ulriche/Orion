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
    ("fee_structures", &["id", "school_id", "academic_year_id", "name", "amount", "fee_type", "applies_to", "class_id", "level", "due_date", "is_mandatory", "created_at", "updated_at"]),
    ("payments",       &["id", "school_id", "academic_year_id", "enrollment_id", "student_id", "fee_structure_id", "amount", "payment_date", "payment_method", "reference", "receipt_number", "notes", "recorded_by", "status", "cancelled_at", "cancel_reason", "created_at", "updated_at"]),
    // Session 5 — Module pédagogique
    ("subjects",            &["id", "school_id", "name", "code", "color", "created_at", "updated_at"]),
    ("grade_types",         &["id", "school_id", "name", "max_score", "created_at", "updated_at"]),
    ("grading_periods",     &["id", "school_id", "academic_year_id", "name", "period_order", "start_date", "end_date", "is_active", "created_at", "updated_at"]),
    ("class_subjects",      &["id", "school_id", "academic_year_id", "class_id", "subject_id", "teacher_id", "coefficient", "created_at", "updated_at"]),
    ("teacher_assignments", &["id", "school_id", "academic_year_id", "teacher_id", "class_subject_id", "created_at", "updated_at"]),
    ("grades",              &["id", "school_id", "academic_year_id", "enrollment_id", "student_id", "class_subject_id", "grading_period_id", "grade_type_id", "score", "max_score", "evaluation_date", "notes", "recorded_by", "is_absent", "created_at", "updated_at"]),
    // Session 6 — Module bibliothèque
    ("library_categories",   &["id", "school_id", "name", "code", "description", "color", "created_at", "updated_at"]),
    ("library_books",        &["id", "school_id", "category_id", "isbn", "title", "author", "publisher", "publication_year", "language", "edition", "pages", "description", "shelf_location", "is_reference", "created_at", "updated_at"]),
    ("library_copies",       &["id", "school_id", "book_id", "inventory_code", "barcode", "status", "condition", "acquisition_date", "acquisition_source", "price", "location", "notes", "created_at", "updated_at"]),
    ("library_readers",      &["id", "school_id", "reader_type", "student_id", "staff_id", "full_name", "email", "phone", "card_number", "class_name", "max_loans", "status", "registered_at", "expires_at", "notes", "created_at", "updated_at"]),
    ("library_loans",        &["id", "school_id", "copy_id", "reader_id", "book_id", "loan_date", "due_date", "returned_at", "status", "loan_condition", "notes", "created_by", "created_at", "updated_at"]),
    ("library_returns",      &["id", "school_id", "loan_id", "copy_id", "reader_id", "returned_at", "loan_condition", "late_days", "fine_amount", "remarks", "handled_by", "created_at", "updated_at"]),
    ("library_penalties",    &["id", "school_id", "reader_id", "loan_id", "penalty_type", "amount", "days_late", "description", "status", "paid_at", "created_at", "updated_at"]),
    ("library_reservations", &["id", "school_id", "book_id", "reader_id", "reserved_at", "available_at", "expires_at", "status", "queue_position", "notified_at", "fulfilled_at", "loan_id", "notes", "created_at", "updated_at"]),
];

// Colonnes booléennes : SQLite les range en 0/1, PostgreSQL attend true/false.
const BOOLEAN_COLUMNS: &[&str] = &["is_current", "is_mandatory", "is_active", "is_absent", "is_reference"];

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
pub(crate) fn enqueue_entity(conn: &Connection, table: &str, school_id: &str, id: &str) {
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

#[tauri::command]
pub fn get_current_user_roles(state: State<'_, DbState>, user_id: String, school_id: String) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ?1 AND ur.school_id = ?2
         UNION
         SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ?1 AND r.name = 'SUPER_ADMIN'"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![user_id, school_id], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| e.to_string())?;

    let mut roles = Vec::new();
    for r in rows {
        if let Ok(role_name) = r {
            roles.push(role_name);
        }
    }
    Ok(roles)
}

/// Synchronise localement le rôle (issu du cloud) de l'utilisateur connecté.
/// Crée le rôle s'il n'existe pas, puis l'associe à l'utilisateur pour l'école.
/// Permet à l'app hors-ligne de connaître le rôle SUPER_ADMIN après la 1ère
/// connexion en ligne.
#[tauri::command]
pub fn set_local_user_role(user_id: String, school_id: String, role_name: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    // École : réutilise si déjà connue, sinon crée un libellé par défaut.
    conn.execute(
        "INSERT INTO schools (id, name) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
        rusqlite::params![school_id, "École"],
    ).map_err(|e| format!("Erreur sync école: {}", e))?;

    // Utilisateur : doit exister (normalement créé par sync_local_user).
    let user_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE id = ?1",
        rusqlite::params![user_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if user_exists == 0 {
        return Err("Utilisateur local introuvable.".to_string());
    }

    // Rôle : récupère par nom, sinon l'insère.
    let existing_role: Option<String> = conn.query_row(
        "SELECT id FROM roles WHERE name = ?1",
        rusqlite::params![role_name],
        |row| row.get::<_, String>(0),
    ).ok();
    let role_id = match existing_role {
        Some(id) => id,
        None => {
            let new_id = format!("role-{}", role_name.to_lowercase());
            conn.execute(
                "INSERT INTO roles (id, name) VALUES (?1, ?2)",
                rusqlite::params![new_id, role_name],
            ).map_err(|e| format!("Erreur création rôle: {}", e))?;
            new_id
        }
    };

    // Association user_roles : évite les doublons.
    let link_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM user_roles WHERE user_id = ?1 AND school_id = ?2 AND role_id = ?3",
        rusqlite::params![user_id, school_id, role_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    if link_exists == 0 {
        let link_id = format!("ur-{}-{}-{}", user_id, school_id, role_id);
        conn.execute(
            "INSERT INTO user_roles (id, user_id, school_id, role_id) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![link_id, user_id, school_id, role_id],
        ).map_err(|e| format!("Erreur attribution rôle: {}", e))?;
    }

    Ok(())
}


/// Retourne l'identifiant `staff` correspondant à l'utilisateur connecté.
/// Le lien explicite `profiles.staff_id` est prioritaire ; à défaut, on
/// retombe sur le rapprochement par email (users.email == staff.email).
/// Un professeur ne peut ainsi accéder qu'à ses propres affectations.
#[tauri::command]
pub fn get_current_staff_id(state: State<'_, DbState>, user_id: String, school_id: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let linked_staff_id: Option<String> = conn.query_row(
        "SELECT p.staff_id
           FROM profiles p
           JOIN staff s ON s.id = p.staff_id AND s.school_id = p.school_id
          WHERE p.user_id = ?1 AND p.school_id = ?2 AND p.deleted_at IS NULL
          LIMIT 1",
        rusqlite::params![user_id, school_id],
        |row| row.get::<_, Option<String>>(0),
    ).unwrap_or(None);

    if linked_staff_id.is_some() {
        return Ok(linked_staff_id);
    }

    let email: Option<String> = conn.query_row(
        "SELECT email FROM users WHERE id = ?1",
        rusqlite::params![user_id],
        |row| row.get::<_, Option<String>>(0),
    ).unwrap_or(None);

    let Some(email) = email else { return Ok(None); };
    if email.trim().is_empty() {
        return Ok(None);
    }

    let staff_id: Option<String> = conn.query_row(
        "SELECT id FROM staff
          WHERE school_id = ?1 AND email IS NOT NULL AND lower(email) = lower(?2)
          LIMIT 1",
        rusqlite::params![school_id, email],
        |row| row.get::<_, String>(0),
    ).ok();

    Ok(staff_id)
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
// COMMANDE : Purger les mutations invalides (entity_type inconnu)
// ──────────────────────────────────────────────
#[tauri::command]
pub fn purge_invalid_mutations(state: State<'_, DbState>) -> Result<usize, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    // Tables valides synchronisables
    let valid_types = ["academic_years", "classes", "students", "enrollments"];
    let placeholders = valid_types.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "DELETE FROM pending_mutations WHERE entity_type NOT IN ({})",
        placeholders
    );
    let params: Vec<&dyn rusqlite::ToSql> = valid_types.iter().map(|t| t as &dyn rusqlite::ToSql).collect();
    let deleted = conn.execute(&sql, params.as_slice()).map_err(|e| e.to_string())?;
    Ok(deleted)
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
// COMMANDE : Supprimer TOUS les conflits en attente
// ──────────────────────────────────────────────
#[tauri::command]
pub fn purge_all_sync_conflicts(app: tauri::AppHandle) -> Result<usize, String> {
    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {}", e))?
        .join("orion.sqlite");

    crate::sync::purge_all_conflicts_internal(&db_path)
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
pub fn save_school_settings(payload: String, school_id: Option<String>, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;

    let s: serde_json::Value = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let get = |key: &str| s.get(key).and_then(|v| v.as_str());

    // Établissement courant : l'identifiant transmis par le front (école de
    // l'utilisateur connecté) est prioritaire ; à défaut, première école locale.
    let school_id: String = school_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            conn.query_row("SELECT id FROM schools ORDER BY (id = 'school-1') ASC, created_at ASC LIMIT 1", [], |r| r.get(0))
                .unwrap_or_else(|_| "school-1".to_string())
        });

    // Garantir l'existence de la ligne (la colonne name est NOT NULL).
    conn.execute(
        "INSERT INTO schools (id, name) VALUES (?1, ?2) ON CONFLICT(id) DO NOTHING",
        rusqlite::params![school_id, get("name").unwrap_or("")],
    ).map_err(|e| format!("Erreur SQLite INSERT schools: {}", e))?;

    conn.execute(
        "UPDATE schools SET 
            name = ?1, short_name = ?2, address = ?3, city = ?4, country = ?5, 
            phone_primary = ?6, phone_secondary = ?7, email = ?8, website = ?9, 
            currency = ?10, timezone = ?11,
            logo_url = ?12, stamp_url = ?13, signature_url = ?14,
            ministry_name = ?15, head_title = ?16, head_name = ?17,
            slogan = ?18, registration_number = ?19
         WHERE id = ?20",
        rusqlite::params![
            get("name").unwrap_or(""),
            get("short_name"), get("address"), get("city"), get("country"),
            get("phone"), get("phone_secondary"), get("email"), get("website"),
            get("currency"), get("timezone"),
            get("logo_url"), get("stamp_url"), get("signature_url"),
            get("ministry_name"), get("head_title"), get("head_name"),
            get("slogan"), get("registration_number"),
            school_id
        ]
    ).map_err(|e| format!("Erreur SQLite UPDATE schools: {}", e))?;

    // Note : les paramètres de l'école sont locaux uniquement.
    // La table 'schools' n'est pas synchronisée via l'outbox.
    
    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), school_id, "UPDATE_SETTINGS", "schools", &payload]
    ).unwrap_or(0);

    Ok(())
}

#[tauri::command(async)]
pub fn get_school_settings(school_id: Option<String>, state: State<'_, DbState>) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données")?;

    // Établissement courant : l'identifiant transmis par le front (école de
    // l'utilisateur connecté) est prioritaire ; à défaut, on retombe sur la
    // première école locale connue (compatibilité mono-établissement), afin de
    // refléter le nom réel créé par le super-administrateur.
    let school_id: String = school_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            conn.query_row("SELECT id FROM schools ORDER BY (id = 'school-1') ASC, created_at ASC LIMIT 1", [], |r| r.get(0))
                .unwrap_or_else(|_| "school-1".to_string())
        });

    let mut stmt = conn.prepare(
        "SELECT name, short_name, address, city, country, phone_primary, phone_secondary, email, website, currency, timezone,
                logo_url, stamp_url, signature_url, ministry_name, head_title, head_name, slogan, registration_number
         FROM schools WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let settings = stmt.query_row(rusqlite::params![school_id], |row| {
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
    });

    match settings {
        Ok(s) => Ok(s),
        // Aucune ligne encore enregistrée : renvoyer un objet vide plutôt qu'une erreur,
        // pour que le formulaire des paramètres reste utilisable.
        Err(_) => Ok(serde_json::json!({
            "name": "", "short_name": "", "address": "", "city": "", "country": "",
            "phone": "", "phone_secondary": "", "email": "", "website": "",
            "currency": "", "timezone": "", "logo_url": "", "stamp_url": "", "signature_url": "",
            "ministry_name": "", "head_title": "", "head_name": "", "slogan": "", "registration_number": ""
        })),
    }
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

    // Collecter les IDs des entités enfants AVANT de les supprimer,
    // pour pouvoir enregistrer des mutations DELETE pour chaque.
    let enrollment_ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM enrollments WHERE academic_year_id = ?1"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        result
    };
    let class_ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM classes WHERE academic_year_id = ?1"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        result
    };

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

    // Enregistrer les mutations DELETE pour la sync (enfants d'abord, puis parent)
    for eid in &enrollment_ids {
        let payload = serde_json::json!({ "id": eid });
        let mid = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'enrollments', ?3, 'DELETE', ?4, 'PENDING')",
            rusqlite::params![mid, school_id, eid, payload.to_string()],
        ).map_err(|e| e.to_string())?;
    }
    for cid in &class_ids {
        let payload = serde_json::json!({ "id": cid });
        let mid = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'classes', ?3, 'DELETE', ?4, 'PENDING')",
            rusqlite::params![mid, school_id, cid, payload.to_string()],
        ).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::json!({ "id": id });
    let mid = uuid::Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'academic_years', ?3, 'DELETE', ?4, 'PENDING')",
        rusqlite::params![mid, school_id, id, payload.to_string()],
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
#[allow(clippy::too_many_arguments)]
pub fn sync_local_user(
    user_id: String,
    email: String,
    school_id: String,
    school_name: String,
    first_name: Option<String>,
    last_name: Option<String>,
    staff_id: Option<String>,
    role_name: Option<String>,
    short_name: Option<String>,
    address: Option<String>,
    city: Option<String>,
    country: Option<String>,
    phone_primary: Option<String>,
    phone_secondary: Option<String>,
    school_email: Option<String>,
    website: Option<String>,
    currency: Option<String>,
    timezone: Option<String>,
    logo_url: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    // Upsert établissement — les informations saisies par le super-administrateur
    // dans le cloud sont rapatriées localement, afin que la direction les
    // retrouve dans « Paramètres » sans les ressaisir (source de vérité unique).
    // - Le nom n'écrase un libellé local que s'il n'est pas un placeholder.
    // - Les autres champs priment lorsqu'ils sont renseignés dans le cloud,
    //   sinon la valeur locale (éditée par la direction) est conservée.
    conn.execute(
        "INSERT INTO schools (id, name, short_name, address, city, country, phone_primary, phone_secondary, email, website, currency, timezone, logo_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
            name = CASE
                     WHEN TRIM(COALESCE(excluded.name, '')) <> ''
                          AND excluded.name NOT IN ('École', 'Établissement', 'Établissement Principal')
                     THEN excluded.name
                     ELSE schools.name END,
            short_name      = COALESCE(NULLIF(TRIM(COALESCE(excluded.short_name, '')), ''), schools.short_name),
            address         = COALESCE(NULLIF(TRIM(COALESCE(excluded.address, '')), ''), schools.address),
            city            = COALESCE(NULLIF(TRIM(COALESCE(excluded.city, '')), ''), schools.city),
            country         = COALESCE(NULLIF(TRIM(COALESCE(excluded.country, '')), ''), schools.country),
            phone_primary   = COALESCE(NULLIF(TRIM(COALESCE(excluded.phone_primary, '')), ''), schools.phone_primary),
            phone_secondary = COALESCE(NULLIF(TRIM(COALESCE(excluded.phone_secondary, '')), ''), schools.phone_secondary),
            email           = COALESCE(NULLIF(TRIM(COALESCE(excluded.email, '')), ''), schools.email),
            website         = COALESCE(NULLIF(TRIM(COALESCE(excluded.website, '')), ''), schools.website),
            currency        = COALESCE(NULLIF(TRIM(COALESCE(excluded.currency, '')), ''), schools.currency),
            timezone        = COALESCE(NULLIF(TRIM(COALESCE(excluded.timezone, '')), ''), schools.timezone),
            logo_url        = COALESCE(NULLIF(TRIM(COALESCE(excluded.logo_url, '')), ''), schools.logo_url)",
        rusqlite::params![
            school_id, school_name, short_name, address, city, country,
            phone_primary, phone_secondary, school_email, website, currency, timezone, logo_url
        ],
    ).map_err(|e| format!("Erreur sync école: {}", e))?;

    // Upsert user — le nom d'utilisateur par défaut reprend l'email pour
    // permettre au compte cloud de se reconnecter localement.
    conn.execute(
        "INSERT INTO users (id, email, username) VALUES (?1, ?2, ?2)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email,
             username = COALESCE(users.username, excluded.username)",
        rusqlite::params![user_id, email],
    ).map_err(|e| format!("Erreur sync utilisateur: {}", e))?;

    // Upsert profil (nécessaire pour que l'utilisateur apparaisse dans la
    // sélection de compte et la gestion des PIN côté interface locale).
    let existing_profile: Option<String> = conn.query_row(
        "SELECT id FROM profiles
          WHERE user_id = ?1 AND school_id = ?2 AND deleted_at IS NULL
          LIMIT 1",
        rusqlite::params![user_id, school_id],
        |row| row.get(0),
    ).ok();

    // Si le profil cloud ne porte pas encore de staff_id (migration non
    // appliquée ou compte ancien), on rapproche par email au sein de l'école.
    // Pour un compte DIRECTION dont l'email de connexion diffère de celui du
    // personnel, on rattache la fiche du responsable (matricule *-P-0001).
    let resolved_staff_id: Option<String> = match staff_id.as_deref() {
        Some(s) if !s.trim().is_empty() => staff_id.clone(),
        _ => {
            let by_email: Option<String> = conn.query_row(
                "SELECT id FROM staff
                  WHERE school_id = ?1 AND email IS NOT NULL
                    AND lower(email) = lower(?2)
                  LIMIT 1",
                rusqlite::params![school_id, email],
                |row| row.get(0),
            ).ok();
            if by_email.is_some() || !role_name.as_deref().unwrap_or("").eq_ignore_ascii_case("DIRECTION") {
                by_email
            } else {
                conn.query_row(
                    "SELECT id FROM staff
                      WHERE school_id = ?1 AND matricule LIKE '%-P-0001'
                      ORDER BY matricule
                      LIMIT 1",
                    rusqlite::params![school_id],
                    |row| row.get(0),
                ).ok()
            }
        }
    };

    let f_name = first_name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Direction".to_string());
    let l_name = last_name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Établissement".to_string());

    match existing_profile {
        Some(profile_id) => {
            conn.execute(
                "UPDATE profiles
                    SET first_name = COALESCE(?1, first_name),
                        last_name  = COALESCE(?2, last_name),
                        staff_id   = COALESCE(?3, staff_id),
                        updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?4",
                rusqlite::params![f_name, l_name, resolved_staff_id, profile_id],
            ).map_err(|e| format!("Erreur sync profil: {}", e))?;
        }
        None => {
            let profile_id = format!("prof-{}", user_id);
            conn.execute(
                "INSERT INTO profiles (id, user_id, school_id, first_name, last_name, staff_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                rusqlite::params![profile_id, user_id, school_id, f_name, l_name, resolved_staff_id],
            ).map_err(|e| format!("Erreur création profil: {}", e))?;
        }
    }

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


// `async` : exécuté sur un thread séparé pour ne jamais bloquer l'interface.
#[tauri::command(async)]
pub fn get_classes(school_id: String, academic_year_id: String, state: State<'_, DbState>) -> Result<Vec<Class>, String> {
    let conn = state.0.lock().map_err(|_ | "Impossible de verrouiller la base de données".to_string())?;
    
    let mut stmt = conn.prepare("
        SELECT c.id, c.school_id, c.academic_year_id, c.name, c.level,
               (SELECT COUNT(*) FROM enrollments e
                 WHERE e.class_id = c.id
                   AND e.academic_year_id = c.academic_year_id
                   AND e.status = 'ACTIVE') AS student_count,
               c.level_id, c.series_id,
               c.homeroom_teacher_id,
               (st.prenoms || ' ' || st.nom) AS homeroom_teacher_name
        FROM classes c
        LEFT JOIN staff st ON c.homeroom_teacher_id = st.id
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
            level_id: row.get(6)?,
            series_id: row.get(7)?,
            homeroom_teacher_id: row.get(8)?,
            homeroom_teacher_name: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut classes = Vec::new();
    for class in classes_iter {
        classes.push(class.map_err(|e| e.to_string())?);
    }
    
    Ok(classes)
}

#[tauri::command]
pub fn create_class(
    school_id: String,
    academic_year_id: String,
    name: String,
    level: Option<String>,
    level_id: Option<String>,
    series_id: Option<String>,
    homeroom_teacher_id: Option<String>,
    state: State<'_, DbState>
) -> Result<Class, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO classes (id, school_id, academic_year_id, name, level, level_id, series_id, homeroom_teacher_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, school_id, academic_year_id, name, level, level_id, series_id, homeroom_teacher_id],
    ).map_err(|e| e.to_string())?;

    enqueue_entity(&conn, "classes", &school_id, &id);

    Ok(Class {
        id, school_id, academic_year_id, name, level, student_count: 0,
        level_id, series_id, homeroom_teacher_id, homeroom_teacher_name: None,
    })
}

#[tauri::command]
pub fn update_class(
    id: String,
    name: String,
    level: Option<String>,
    level_id: Option<String>,
    series_id: Option<String>,
    homeroom_teacher_id: Option<String>,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;

    let (school_id, academic_year_id): (String, String) = conn.query_row(
        "SELECT school_id, academic_year_id FROM classes WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|_| "Classe introuvable".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    conn.execute(
        "UPDATE classes SET name = ?1, level = ?2, level_id = ?3, series_id = ?4, homeroom_teacher_id = ?5 WHERE id = ?6",
        rusqlite::params![name, level, level_id, series_id, homeroom_teacher_id, id],
    ).map_err(|e| e.to_string())?;

    enqueue_entity(&conn, "classes", &school_id, &id);
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

    // Enregistrer la mutation DELETE pour la sync Supabase
    let payload = serde_json::json!({ "id": id });
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'classes', ?3, 'DELETE', ?4, 'PENDING')",
        rusqlite::params![mutation_id, school_id, id, payload.to_string()],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Élèves et Inscriptions
// ──────────────────────────────────────────────
#[tauri::command]
pub fn delete_enrollment(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    let (school_id, academic_year_id, student_id): (String, String, String) = conn.query_row(
        "SELECT school_id, academic_year_id, student_id FROM enrollments WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    ).map_err(|_| "Inscription introuvable".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    // Collecter les IDs d'historique liés avant suppression
    let history_ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM enrollment_history WHERE enrollment_id = ?1"
        ).map_err(|e| e.to_string())?;
        let result = stmt.query_map(rusqlite::params![id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        result
    };

    // Supprimer d'abord l'historique lié (clé étrangère enrollment_id → enrollments.id)
    conn.execute("DELETE FROM enrollment_history WHERE enrollment_id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM enrollments WHERE id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;

    // Vérifier si cet étudiant a d'autres inscriptions. Si non, supprimer aussi l'étudiant.
    let other_enrollments: i64 = conn.query_row(
        "SELECT COUNT(*) FROM enrollments WHERE student_id = ?1",
        rusqlite::params![student_id],
        |row| row.get(0),
    ).unwrap_or(0);

    if other_enrollments == 0 {
        conn.execute("DELETE FROM students WHERE id = ?1", rusqlite::params![student_id]).map_err(|e| e.to_string())?;
        // Mutation DELETE pour l'étudiant
        let payload = serde_json::json!({ "id": student_id });
        let mid = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'students', ?3, 'DELETE', ?4, 'PENDING')",
            rusqlite::params![mid, school_id, student_id, payload.to_string()],
        ).map_err(|e| e.to_string())?;
    }

    // Mutations DELETE pour l'historique d'inscription
    for hid in &history_ids {
        let payload = serde_json::json!({ "id": hid });
        let mid = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'enrollment_history', ?3, 'DELETE', ?4, 'PENDING')",
            rusqlite::params![mid, school_id, hid, payload.to_string()],
        ).map_err(|e| e.to_string())?;
    }

    // Mutation DELETE pour l'inscription elle-même
    let payload = serde_json::json!({ "id": id });
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES (?1, ?2, 'enrollments', ?3, 'DELETE', ?4, 'PENDING')",
        rusqlite::params![mutation_id, school_id, id, payload.to_string()],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(async)]
pub fn get_students(
    school_id: String,
    academic_year_id: String,
    class_id: Option<String>,
    include_photos: Option<bool>,
    state: State<'_, DbState>,
) -> Result<Vec<StudentEnrollment>, String> {
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

    // Les photos (base64) pèsent plusieurs Mo : on les écarte quand l'appelant n'en a pas besoin.
    if include_photos == Some(false) {
        for s in students.iter_mut() {
            s.photo_url = None;
        }
    }

    Ok(students)
}

#[tauri::command]
pub fn create_student(school_id: String, academic_year_id: String, first_name: String, last_name: String, class_id: Option<String>, state: State<'_, DbState>) -> Result<StudentEnrollment, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    
    let student_id = uuid::Uuid::new_v4().to_string();
    let enrollment_id = uuid::Uuid::new_v4().to_string();
    let matricule = format!("MAT-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap().to_uppercase());
    
    // Begin transaction conceptually
    conn.execute(
        "INSERT INTO students (id, school_id, first_name, last_name, matricule) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![student_id, school_id, first_name, last_name, matricule],
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
        "last_name": last_name,
        "matricule": matricule
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
        matricule: Some(matricule),
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

// ============================================================
// SESSION 4 : GESTION FINANCIÈRE (Frais scolaires & Paiements)
// ============================================================

#[tauri::command]
pub fn get_fee_structures(
    school_id: String,
    academic_year_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::FeeStructure>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT f.id, f.school_id, f.academic_year_id, f.name, f.amount, f.fee_type,
                f.applies_to, f.class_id, f.level, f.due_date, f.is_mandatory,
                c.name as class_name
         FROM fee_structures f
         LEFT JOIN classes c ON f.class_id = c.id
         WHERE f.school_id = ?1 AND f.academic_year_id = ?2
         ORDER BY f.created_at DESC"
    ).map_err(|e| e.to_string())?;

    let iter = stmt.query_map(rusqlite::params![school_id, academic_year_id], |row| {
        Ok(crate::models::FeeStructure {
            id: row.get(0)?,
            school_id: row.get(1)?,
            academic_year_id: row.get(2)?,
            name: row.get(3)?,
            amount: row.get(4)?,
            fee_type: row.get(5)?,
            applies_to: row.get(6)?,
            class_id: row.get(7)?,
            level: row.get(8)?,
            due_date: row.get(9)?,
            is_mandatory: row.get(10)?,
            class_name: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for item in iter {
        if let Ok(fs) = item {
            res.push(fs);
        }
    }
    Ok(res)
}

#[tauri::command]
pub fn create_fee_structure(
    school_id: String,
    academic_year_id: String,
    name: String,
    amount: i64,
    fee_type: String,
    applies_to: String,
    class_id: Option<String>,
    level: Option<String>,
    due_date: Option<String>,
    is_mandatory: bool,
    state: State<'_, DbState>
) -> Result<crate::models::FeeStructure, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        rusqlite::params![
            id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, now
        ]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;

    let payload = serde_json::json!({
        "id": id,
        "school_id": school_id,
        "academic_year_id": academic_year_id,
        "name": name,
        "amount": amount,
        "fee_type": fee_type,
        "applies_to": applies_to,
        "class_id": class_id,
        "level": level,
        "due_date": due_date,
        "is_mandatory": is_mandatory,
        "created_at": now,
        "updated_at": now
    });
    
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, 'fee_structures', ?2, 'INSERT', ?3)",
        rusqlite::params![mutation_id, id, payload.to_string()]
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), school_id, "CREATE_FEE", "fee_structures", payload.to_string()]
    ).unwrap_or(0);

    let class_name = if let Some(cid) = &class_id {
        conn.query_row("SELECT name FROM classes WHERE id = ?1", rusqlite::params![cid], |r| r.get(0)).unwrap_or(None)
    } else { None };

    Ok(crate::models::FeeStructure {
        id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, class_name
    })
}

#[tauri::command]
pub fn delete_fee_structure(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM payments WHERE fee_structure_id = ?1 AND status = 'VALID'",
        rusqlite::params![id],
        |r| r.get(0)
    ).unwrap_or(0);
    if count > 0 {
        return Err("Impossible de supprimer : des paiements valides y sont attachés.".into());
    }

    conn.execute("DELETE FROM fee_structures WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id])
        .map_err(|e| e.to_string())?;

    let payload = serde_json::json!({ "id": id });
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, 'fee_structures', ?2, 'DELETE', ?3)",
        rusqlite::params![mutation_id, id, payload.to_string()]
    ).unwrap_or(0);

    Ok(())
}

#[tauri::command]
pub fn update_fee_structure(
    id: String,
    school_id: String,
    name: String,
    amount: i64,
    due_date: Option<String>,
    is_mandatory: bool,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE fee_structures SET name = ?1, amount = ?2, due_date = ?3, is_mandatory = ?4, updated_at = ?5
         WHERE id = ?6 AND school_id = ?7",
        rusqlite::params![name, amount, due_date, is_mandatory, now, id, school_id]
    ).map_err(|e| e.to_string())?;

    // Create a generic payload to sync the update
    let payload = serde_json::json!({
        "id": id,
        "name": name,
        "amount": amount,
        "due_date": due_date,
        "is_mandatory": is_mandatory,
        "updated_at": now
    });

    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, 'fee_structures', ?2, 'UPDATE', ?3)",
        rusqlite::params![mutation_id, id, payload.to_string()]
    ).unwrap_or(0);

    Ok(())
}

#[tauri::command]
pub fn get_student_payments(
    school_id: String,
    academic_year_id: String,
    student_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::Payment>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.school_id, p.academic_year_id, p.enrollment_id, p.student_id,
                p.fee_structure_id, p.amount, p.payment_date, p.payment_method, p.reference,
                p.receipt_number, p.notes, p.recorded_by, p.status, p.cancelled_at, p.cancel_reason,
                f.name as fee_name
         FROM payments p
         LEFT JOIN fee_structures f ON p.fee_structure_id = f.id
         WHERE p.school_id = ?1 AND p.academic_year_id = ?2 AND p.student_id = ?3
         ORDER BY p.payment_date DESC, p.created_at DESC"
    ).map_err(|e| e.to_string())?;

    let iter = stmt.query_map(rusqlite::params![school_id, academic_year_id, student_id], |row| {
        Ok(crate::models::Payment {
            id: row.get(0)?,
            school_id: row.get(1)?,
            academic_year_id: row.get(2)?,
            enrollment_id: row.get(3)?,
            student_id: row.get(4)?,
            fee_structure_id: row.get(5)?,
            amount: row.get(6)?,
            payment_date: row.get(7)?,
            payment_method: row.get(8)?,
            reference: row.get(9)?,
            receipt_number: row.get(10)?,
            notes: row.get(11)?,
            recorded_by: row.get(12)?,
            status: row.get(13)?,
            cancelled_at: row.get(14)?,
            cancel_reason: row.get(15)?,
            fee_name: row.get(16)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for item in iter {
        if let Ok(p) = item {
            res.push(p);
        }
    }
    Ok(res)
}

#[tauri::command]
pub fn get_student_financial_summary(
    school_id: String,
    academic_year_id: String,
    student_id: String,
    state: State<'_, DbState>
) -> Result<crate::models::StudentFinancialSummary, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // 1. Fetch enrollment and class
    let (enrollment_id, class_id, first_name, last_name, class_name) = conn.query_row(
        "SELECT e.id, e.class_id, s.first_name, s.last_name, c.name
         FROM enrollments e
         JOIN students s ON e.student_id = s.id
         JOIN classes c ON e.class_id = c.id
         WHERE e.school_id = ?1 AND e.academic_year_id = ?2 AND e.student_id = ?3 AND e.status = 'ACTIVE'",
        rusqlite::params![school_id, academic_year_id, student_id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?
        ))
    ).map_err(|_| "Inscription active introuvable pour cet élève dans cette année scolaire.".to_string())?;

    // 2. Calculate Total Due
    let total_due: i64 = conn.query_row(
        "SELECT SUM(amount) FROM fee_structures 
         WHERE school_id = ?1 AND academic_year_id = ?2 
         AND (applies_to = 'ALL' OR (applies_to = 'CLASS' AND class_id = ?3))",
        rusqlite::params![school_id, academic_year_id, class_id],
        |row| row.get(0)
    ).unwrap_or(0);

    // 3. Calculate Total Paid
    let total_paid: i64 = conn.query_row(
        "SELECT SUM(amount) FROM payments
         WHERE school_id = ?1 AND academic_year_id = ?2 AND enrollment_id = ?3 AND status = 'VALID'",
        rusqlite::params![school_id, academic_year_id, enrollment_id],
        |row| row.get(0)
    ).unwrap_or(0);

    let remaining_balance = total_due - total_paid;
    let status = if remaining_balance <= 0 {
        "SOLDE"
    } else if total_paid > 0 {
        "PARTIEL"
    } else {
        "IMPAYE"
    };

    Ok(crate::models::StudentFinancialSummary {
        student_id,
        enrollment_id,
        first_name,
        last_name,
        class_name,
        total_due,
        total_paid,
        remaining_balance,
        status: status.to_string(),
    })
}

#[tauri::command]
pub fn create_payment(
    school_id: String,
    academic_year_id: String,
    enrollment_id: String,
    student_id: String,
    fee_structure_id: Option<String>,
    amount: i64,
    payment_method: String,
    reference: Option<String>,
    notes: Option<String>,
    recorded_by: String, // from context
    state: State<'_, DbState>
) -> Result<crate::models::Payment, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let payment_date = chrono::Utc::now().naive_local().date().to_string();

    // Generate receipt number (basic version: RECU-YYYYMMDD-ID)
    let receipt_number = format!("RECU-{}-{}", chrono::Utc::now().format("%Y%m%d"), &id[..6].to_uppercase());

    conn.execute(
        "INSERT INTO payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'VALID', ?14, ?14)",
        rusqlite::params![
            id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, now
        ]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;

    let payload = serde_json::json!({
        "id": id,
        "school_id": school_id,
        "academic_year_id": academic_year_id,
        "enrollment_id": enrollment_id,
        "student_id": student_id,
        "fee_structure_id": fee_structure_id,
        "amount": amount,
        "payment_date": payment_date,
        "payment_method": payment_method,
        "reference": reference,
        "receipt_number": receipt_number,
        "notes": notes,
        "recorded_by": recorded_by,
        "status": "VALID",
        "created_at": now,
        "updated_at": now
    });
    
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, 'payments', ?2, 'INSERT', ?3)",
        rusqlite::params![mutation_id, id, payload.to_string()]
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), school_id, "CREATE_PAYMENT", "payments", payload.to_string()]
    ).unwrap_or(0);

    let fee_name = if let Some(fid) = &fee_structure_id {
        conn.query_row("SELECT name FROM fee_structures WHERE id = ?1", rusqlite::params![fid], |r| r.get(0)).unwrap_or(None)
    } else { None };

    Ok(crate::models::Payment {
        id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, reference, receipt_number, notes, recorded_by, status: "VALID".to_string(), cancelled_at: None, cancel_reason: None, fee_name
    })
}

#[tauri::command(async)]
pub fn get_financial_dashboard(
    school_id: String,
    academic_year_id: String,
    state: State<'_, DbState>
) -> Result<crate::models::FinancialDashboard, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    build_financial_dashboard(&conn, &school_id, &academic_year_id)
}

fn build_financial_dashboard(
    conn: &rusqlite::Connection,
    school_id: &str,
    academic_year_id: &str
) -> Result<crate::models::FinancialDashboard, String> {
    // Solde de chaque inscription active : dû (frais globaux + frais de sa classe)
    // moins encaissé (paiements VALID rattachés à l'inscription).
    // La règle de calcul est volontairement identique à get_student_financial_summary.
    const BALANCES_CTE: &str = "
        WITH all_fees AS (
            SELECT COALESCE(SUM(amount), 0) AS amount
            FROM fee_structures
            WHERE school_id = ?1 AND academic_year_id = ?2 AND applies_to = 'ALL'
        ),
        class_fees AS (
            SELECT class_id, SUM(amount) AS amount
            FROM fee_structures
            WHERE school_id = ?1 AND academic_year_id = ?2
              AND applies_to IN ('CLASS', 'LEVEL') AND class_id IS NOT NULL
            GROUP BY class_id
        ),
        enrolled AS (
            SELECT e.id AS enrollment_id, e.student_id, e.class_id,
                   s.first_name, s.last_name,
                   COALESCE(c.name, 'Sans classe') AS class_name
            FROM enrollments e
            JOIN students s ON s.id = e.student_id
            LEFT JOIN classes c ON c.id = e.class_id
            WHERE e.school_id = ?1 AND e.academic_year_id = ?2 AND e.status = 'ACTIVE'
        ),
        paid AS (
            SELECT enrollment_id, SUM(amount) AS amount
            FROM payments
            WHERE school_id = ?1 AND academic_year_id = ?2 AND status = 'VALID'
            GROUP BY enrollment_id
        ),
        balances AS (
            SELECT en.enrollment_id, en.student_id, en.first_name, en.last_name,
                   en.class_name, en.class_id,
                   (SELECT amount FROM all_fees)
                     + COALESCE((SELECT amount FROM class_fees WHERE class_id = en.class_id), 0) AS total_due,
                   COALESCE(paid.amount, 0) AS total_paid
            FROM enrolled en
            LEFT JOIN paid ON paid.enrollment_id = en.enrollment_id
        )
    ";

    // 1. Totaux + répartition des situations
    let (total_due, total_paid, student_count, settled_count, partial_count, unpaid_count): (i64, i64, i64, i64, i64, i64) = conn.query_row(
        &format!("{} SELECT COALESCE(SUM(total_due), 0), COALESCE(SUM(total_paid), 0), COUNT(*), \
            COALESCE(SUM(CASE WHEN total_due - total_paid <= 0 THEN 1 ELSE 0 END), 0), \
            COALESCE(SUM(CASE WHEN total_due - total_paid > 0 AND total_paid > 0 THEN 1 ELSE 0 END), 0), \
            COALESCE(SUM(CASE WHEN total_paid <= 0 THEN 1 ELSE 0 END), 0) \
            FROM balances", BALANCES_CTE),
        rusqlite::params![school_id, academic_year_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
    ).map_err(|e| e.to_string())?;

    // 2. Répartition par classe
    let mut stmt = conn.prepare(&format!("{} \
        SELECT class_id, class_name, COUNT(*), \
               COALESCE(SUM(total_due), 0), COALESCE(SUM(total_paid), 0), \
               COALESCE(SUM(total_due - total_paid), 0) \
        FROM balances GROUP BY class_id, class_name \
        ORDER BY class_name ASC", BALANCES_CTE)).map_err(|e| e.to_string())?;

    let mut by_class = Vec::new();
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id], |row| {
        Ok(crate::models::ClassFinancialStat {
            class_id: row.get(0)?,
            class_name: row.get(1)?,
            student_count: row.get(2)?,
            total_due: row.get(3)?,
            total_paid: row.get(4)?,
            remaining_balance: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok(item) = r { by_class.push(item); }
    }
    drop(stmt);

    // 3. Élèves avec reliquat (les plus endettés d'abord)
    let mut stmt = conn.prepare(&format!("{} \
        SELECT student_id, enrollment_id, first_name, last_name, class_name, \
               total_due, total_paid, total_due - total_paid, \
               CASE WHEN total_due - total_paid <= 0 THEN 'SOLDE' \
                    WHEN total_paid > 0 THEN 'PARTIEL' ELSE 'IMPAYE' END \
        FROM balances WHERE total_due - total_paid > 0 \
        ORDER BY (total_due - total_paid) DESC, last_name ASC \
        LIMIT 100", BALANCES_CTE)).map_err(|e| e.to_string())?;

    let mut debtors = Vec::new();
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id], |row| {
        Ok(crate::models::StudentBalance {
            student_id: row.get(0)?,
            enrollment_id: row.get(1)?,
            first_name: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            last_name: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            class_name: row.get(4)?,
            total_due: row.get(5)?,
            total_paid: row.get(6)?,
            remaining_balance: row.get(7)?,
            status: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok(item) = r { debtors.push(item); }
    }
    drop(stmt);

    // 4. Répartition des encaissements par mode de paiement
    let mut stmt = conn.prepare(
        "SELECT payment_method, COALESCE(SUM(amount), 0), COUNT(*) FROM payments \
         WHERE school_id = ?1 AND academic_year_id = ?2 AND status = 'VALID' \
         GROUP BY payment_method ORDER BY SUM(amount) DESC"
    ).map_err(|e| e.to_string())?;

    let mut by_method = Vec::new();
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id], |row| {
        Ok(crate::models::MethodStat {
            method: row.get(0)?,
            amount: row.get(1)?,
            payment_count: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    for r in rows {
        if let Ok(item) = r { by_method.push(item); }
    }
    drop(stmt);

    // 5. Paiements annulés
    let cancelled_payment_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM payments WHERE school_id = ?1 AND academic_year_id = ?2 AND status = 'CANCELLED'",
        rusqlite::params![school_id, academic_year_id],
        |row| row.get(0)
    ).unwrap_or(0);

    let recovery_rate = if total_due > 0 {
        (total_paid as f64 / total_due as f64) * 100.0
    } else { 0.0 };

    Ok(crate::models::FinancialDashboard {
        total_due,
        total_paid,
        remaining_balance: total_due - total_paid,
        recovery_rate,
        student_count,
        settled_count,
        partial_count,
        unpaid_count,
        cancelled_payment_count,
        by_class,
        by_method,
        debtors,
    })
}

#[tauri::command]
pub fn cancel_payment(id: String, school_id: String, cancel_reason: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    let updated = conn.execute(
        "UPDATE payments SET status = 'CANCELLED', cancelled_at = ?1, cancel_reason = ?2, updated_at = ?1
         WHERE id = ?3 AND school_id = ?4 AND status = 'VALID'",
        rusqlite::params![now, cancel_reason, id, school_id]
    ).map_err(|e| e.to_string())?;

    if updated == 0 {
        return Err("Paiement introuvable ou déjà annulé.".to_string());
    }

    let payload = serde_json::json!({
        "id": id,
        "status": "CANCELLED",
        "cancelled_at": now,
        "cancel_reason": cancel_reason,
        "updated_at": now
    });
    
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, 'payments', ?2, 'UPDATE', ?3)",
        rusqlite::params![mutation_id, id, payload.to_string()]
    ).unwrap_or(0);

    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), school_id, "CANCEL_PAYMENT", "payments", payload.to_string()]
    ).unwrap_or(0);

    Ok(())
}


// ============================================================
// SESSION 5 : MODULE PÉDAGOGIQUE (Notes & Résultats)
// ============================================================

// ── Helpers internes ────────────────────────────────────────

/// Calcule l'appréciation textuelle à partir d'une moyenne sur 20.
fn appreciation(avg: f64) -> String {
    match avg as u32 {
        18..=20 => "Excellent".into(),
        15..=17 => "Bien".into(),
        12..=14 => "Assez Bien".into(),
        10..=11 => "Passable".into(),
        _        => "Insuffisant".into(),
    }
}

// ── SUBJECTS ────────────────────────────────────────────────

#[tauri::command]
pub fn get_subjects(school_id: String, state: State<'_, DbState>) -> Result<Vec<crate::models::Subject>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, school_id, name, code, color FROM subjects WHERE school_id = ?1 ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id], |row| {
        Ok(crate::models::Subject {
            id: row.get(0)?,
            school_id: row.get(1)?,
            name: row.get(2)?,
            code: row.get(3)?,
            color: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { if let Ok(s) = r { res.push(s); } }
    Ok(res)
}

#[tauri::command]
pub fn create_subject(
    school_id: String,
    name: String,
    code: String,
    color: Option<String>,
    state: State<'_, DbState>
) -> Result<crate::models::Subject, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO subjects (id, school_id, name, code, color, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)",
        rusqlite::params![id, school_id, name, code, color, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    let payload = serde_json::json!({"id":id,"school_id":school_id,"name":name,"code":code,"color":color,"created_at":now,"updated_at":now});
    enqueue_entity(&conn, "subjects", &school_id, &id);
    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1,?2,'CREATE_SUBJECT','subjects',?3)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), school_id, payload.to_string()]
    ).unwrap_or(0);
    Ok(crate::models::Subject { id, school_id, name, code, color })
}

#[tauri::command]
pub fn update_subject(
    id: String,
    school_id: String,
    name: String,
    code: String,
    color: Option<String>,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE subjects SET name=?1, code=?2, color=?3, updated_at=?4 WHERE id=?5 AND school_id=?6",
        rusqlite::params![name, code, color, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "subjects", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_subject(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM grades g JOIN class_subjects cs ON g.class_subject_id = cs.id WHERE cs.subject_id = ?1",
        rusqlite::params![id], |r| r.get(0)
    ).unwrap_or(0);
    if count > 0 {
        return Err("Impossible de supprimer : des notes existent pour cette matière.".into());
    }
    conn.execute("DELETE FROM subjects WHERE id=?1 AND school_id=?2", rusqlite::params![id, school_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── CLASS SUBJECTS ───────────────────────────────────────────

#[tauri::command]
pub fn get_class_subjects(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::ClassSubject>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT cs.id, cs.school_id, cs.academic_year_id, cs.class_id, cs.subject_id,
                cs.teacher_id, cs.coefficient,
                s.name, s.code, c.name,
                (st.prenoms || ' ' || st.nom),
                cs.weekly_hours, cs.subject_type, cs.is_mandatory, cs.order_index, cs.color_icon
         FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         JOIN classes c ON cs.class_id = c.id
         LEFT JOIN staff st ON cs.teacher_id = st.id AND st.school_id = cs.school_id
         WHERE cs.school_id=?1 AND cs.academic_year_id=?2 AND cs.class_id=?3
         ORDER BY s.name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, class_id], |row| {
        let is_mandatory_int: Option<i64> = row.get(13)?;
        Ok(crate::models::ClassSubject {
            id: row.get(0)?, school_id: row.get(1)?, academic_year_id: row.get(2)?,
            class_id: row.get(3)?, subject_id: row.get(4)?, teacher_id: row.get(5)?,
            coefficient: row.get(6)?,
            subject_name: row.get(7)?, subject_code: row.get(8)?,
            class_name: row.get(9)?, teacher_name: row.get(10)?,
            weekly_hours: row.get(11)?,
            subject_type: row.get(12)?,
            is_mandatory: is_mandatory_int.map(|v| v != 0),
            order_index: row.get(14)?,
            color_icon: row.get(15)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(cs) => res.push(cs),
            Err(e) => return Err(format!("Error mapping row: {:?}", e)),
        }
    }
    Ok(res)
}

/// Retourne toutes les affectations (matière + classe) d'un professeur donné
/// pour une année scolaire. Utilisé pour restreindre l'accès du professeur à
/// ses seules classes et matières.
#[tauri::command]
pub fn get_teacher_class_subjects(
    school_id: String,
    academic_year_id: String,
    teacher_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::ClassSubject>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT cs.id, cs.school_id, cs.academic_year_id, cs.class_id, cs.subject_id,
                cs.teacher_id, cs.coefficient,
                s.name, s.code, c.name,
                (st.prenoms || ' ' || st.nom),
                cs.weekly_hours, cs.subject_type, cs.is_mandatory, cs.order_index, cs.color_icon
         FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         JOIN classes c ON cs.class_id = c.id
         LEFT JOIN staff st ON cs.teacher_id = st.id AND st.school_id = cs.school_id
         WHERE cs.school_id=?1 AND cs.academic_year_id=?2 AND cs.teacher_id=?3
         ORDER BY c.name, s.name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, teacher_id], |row| {
        let is_mandatory_int: Option<i64> = row.get(13)?;
        Ok(crate::models::ClassSubject {
            id: row.get(0)?, school_id: row.get(1)?, academic_year_id: row.get(2)?,
            class_id: row.get(3)?, subject_id: row.get(4)?, teacher_id: row.get(5)?,
            coefficient: row.get(6)?,
            subject_name: row.get(7)?, subject_code: row.get(8)?,
            class_name: row.get(9)?, teacher_name: row.get(10)?,
            weekly_hours: row.get(11)?,
            subject_type: row.get(12)?,
            is_mandatory: is_mandatory_int.map(|v| v != 0),
            order_index: row.get(14)?,
            color_icon: row.get(15)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(cs) => res.push(cs),
            Err(e) => return Err(format!("Error mapping row: {:?}", e)),
        }
    }
    Ok(res)
}

#[tauri::command]
pub fn assign_subject_to_class(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    subject_id: String,
    teacher_id: Option<String>,
    coefficient: f64,
    weekly_hours: Option<f64>,
    subject_type: Option<String>,
    is_mandatory: Option<bool>,
    order_index: Option<i64>,
    color_icon: Option<String>,
    state: State<'_, DbState>
) -> Result<crate::models::ClassSubject, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    // Check if the subject is already assigned to this class for the given academic year
    let existing: Result<String, _> = conn.query_row(
        "SELECT id FROM class_subjects WHERE academic_year_id=?1 AND class_id=?2 AND subject_id=?3",
        rusqlite::params![academic_year_id, class_id, subject_id],
        |row| row.get(0)
    );
    if existing.is_ok() {
        return Err("Cette matière est déjà affectée à cette classe.".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO class_subjects (id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, subject_type, is_mandatory, order_index, color_icon, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)",
        rusqlite::params![id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, subject_type, is_mandatory.map(|v| if v { 1 } else { 0 }), order_index, color_icon, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "class_subjects", &school_id, &id);
    let subject_name: Option<String> = conn.query_row("SELECT name FROM subjects WHERE id=?1", rusqlite::params![subject_id], |r| r.get(0)).unwrap_or(None);
    let subject_code: Option<String> = conn.query_row("SELECT code FROM subjects WHERE id=?1", rusqlite::params![subject_id], |r| r.get(0)).unwrap_or(None);
    let class_name: Option<String> = conn.query_row("SELECT name FROM classes WHERE id=?1", rusqlite::params![class_id], |r| r.get(0)).unwrap_or(None);
    Ok(crate::models::ClassSubject {
        id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient,
        weekly_hours, subject_type, is_mandatory, order_index, color_icon,
        subject_name, subject_code, class_name, teacher_name: None,
    })
}

#[tauri::command]
pub fn update_class_subject(
    id: String,
    school_id: String,
    coefficient: f64,
    teacher_id: Option<String>,
    weekly_hours: Option<f64>,
    subject_type: Option<String>,
    is_mandatory: Option<bool>,
    order_index: Option<i64>,
    color_icon: Option<String>,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE class_subjects SET coefficient=?1, teacher_id=?2, weekly_hours=?3, subject_type=?4, is_mandatory=?5, order_index=?6, color_icon=?7, updated_at=?8 WHERE id=?9 AND school_id=?10",
        rusqlite::params![coefficient, teacher_id, weekly_hours, subject_type, is_mandatory.map(|v| if v { 1 } else { 0 }), order_index, color_icon, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "class_subjects", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn remove_class_subject(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM grades WHERE class_subject_id=?1",
        rusqlite::params![id], |r| r.get(0)
    ).unwrap_or(0);
    if count > 0 {
        return Err("Impossible de retirer cette matière : des notes y sont attachées.".into());
    }
    conn.execute("DELETE FROM class_subjects WHERE id=?1 AND school_id=?2", rusqlite::params![id, school_id])
        .map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "class_subjects", &school_id, &id);
    Ok(())
}

// ── GRADING PERIODS ──────────────────────────────────────────

#[tauri::command]
pub fn get_grading_periods(
    school_id: String,
    academic_year_id: String,
    class_id: Option<String>,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::GradingPeriod>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut query = "SELECT id, school_id, academic_year_id, class_id, name, period_order, start_date, end_date, is_active
         FROM grading_periods WHERE school_id=?1 AND academic_year_id=?2".to_string();

    if class_id.is_some() {
        query.push_str(" AND class_id=?3");
    }
    query.push_str(" ORDER BY period_order");

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let params: Vec<&dyn rusqlite::ToSql> = if let Some(ref cid) = class_id {
        vec![&school_id, &academic_year_id, cid]
    } else {
        vec![&school_id, &academic_year_id]
    };

    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok(crate::models::GradingPeriod {
            id: row.get(0)?, school_id: row.get(1)?, academic_year_id: row.get(2)?,
            class_id: row.get(3)?,
            name: row.get(4)?, period_order: row.get(5)?,
            start_date: row.get(6)?, end_date: row.get(7)?,
            is_active: row.get::<_, i64>(8)? != 0,
        })
    }).map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        if let Ok(p) = r { res.push(p); }
    }
    Ok(res)
}

#[tauri::command]
pub fn create_grading_period(
    school_id: String,
    academic_year_id: String,
    class_id: Option<String>,
    name: String,
    period_order: i64,
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<'_, DbState>
) -> Result<crate::models::GradingPeriod, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO grading_periods (id, school_id, academic_year_id, class_id, name, period_order, start_date, end_date, is_active, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,?9,?9)",
        rusqlite::params![id, school_id, academic_year_id, class_id, name, period_order, start_date, end_date, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "grading_periods", &school_id, &id);
    Ok(crate::models::GradingPeriod { id, school_id, academic_year_id, class_id, name, period_order, start_date, end_date, is_active: true })
}

#[tauri::command]
pub fn update_grading_period(
    id: String,
    school_id: String,
    class_id: Option<String>,
    name: String,
    period_order: i64,
    start_date: Option<String>,
    end_date: Option<String>,
    is_active: bool,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE grading_periods SET class_id=?1, name=?2, period_order=?3, start_date=?4, end_date=?5, is_active=?6, updated_at=?7 WHERE id=?8 AND school_id=?9",
        rusqlite::params![class_id, name, period_order, start_date, end_date, is_active, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "grading_periods", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_grading_period(
    id: String,
    school_id: String,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute(
        "DELETE FROM grading_periods WHERE id=?1 AND school_id=?2",
        rusqlite::params![id, school_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}
// Activation de toutes les périodes existantes (fix de migration is_active=0)
#[tauri::command]
pub fn activate_all_grading_periods(school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute(
        "UPDATE grading_periods SET is_active=1 WHERE school_id=?1",
        rusqlite::params![school_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── GRADE TYPES ──────────────────────────────────────────────

#[tauri::command]
pub fn get_grade_types(school_id: String, state: State<'_, DbState>) -> Result<Vec<crate::models::GradeType>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, school_id, name, max_score FROM grade_types WHERE school_id=?1 ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id], |row| {
        Ok(crate::models::GradeType { id: row.get(0)?, school_id: row.get(1)?, name: row.get(2)?, max_score: row.get(3)? })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { if let Ok(g) = r { res.push(g); } }
    Ok(res)
}

#[tauri::command]
pub fn create_grade_type(
    school_id: String,
    name: String,
    max_score: f64,
    state: State<'_, DbState>
) -> Result<crate::models::GradeType, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO grade_types (id, school_id, name, max_score, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
        rusqlite::params![id, school_id, name, max_score, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "grade_types", &school_id, &id);
    Ok(crate::models::GradeType { id, school_id, name, max_score })
}

#[tauri::command]
pub fn update_grade_type(
    id: String,
    school_id: String,
    name: String,
    max_score: f64,
    state: State<'_, DbState>
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE grade_types SET name=?1, max_score=?2, updated_at=?3 WHERE id=?4 AND school_id=?5",
        rusqlite::params![name, max_score, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "grade_types", &school_id, &id);
    Ok(())
}

// ── GRADES ───────────────────────────────────────────────────

#[tauri::command]
pub fn get_grades_by_class(
    school_id: String,
    academic_year_id: String,
    class_subject_id: String,
    grading_period_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::Grade>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT g.id, g.school_id, g.academic_year_id, g.enrollment_id, g.student_id,
                g.class_subject_id, g.grading_period_id, g.grade_type_id,
                g.score, g.max_score, g.evaluation_date, g.notes, g.recorded_by, g.is_absent,
                st.first_name, st.last_name, s.name, gt.name
         FROM grades g
         JOIN students st ON g.student_id = st.id
         JOIN class_subjects cs ON g.class_subject_id = cs.id
         JOIN subjects s ON cs.subject_id = s.id
         JOIN grade_types gt ON g.grade_type_id = gt.id
         WHERE g.school_id=?1 AND g.academic_year_id=?2
           AND g.class_subject_id=?3 AND g.grading_period_id=?4
         ORDER BY st.last_name, st.first_name, g.evaluation_date"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, class_subject_id, grading_period_id], |row| {
        Ok(crate::models::Grade {
            id: row.get(0)?, school_id: row.get(1)?, academic_year_id: row.get(2)?,
            enrollment_id: row.get(3)?, student_id: row.get(4)?, class_subject_id: row.get(5)?,
            grading_period_id: row.get(6)?, grade_type_id: row.get(7)?,
            score: row.get(8)?, max_score: row.get(9)?,
            evaluation_date: row.get(10)?, notes: row.get(11)?,
            recorded_by: row.get(12)?, is_absent: row.get::<_, i64>(13)? != 0,
            student_first_name: row.get(14)?, student_last_name: row.get(15)?,
            subject_name: row.get(16)?, grade_type_name: row.get(17)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(g) => res.push(g),
            Err(e) => return Err(format!("Erreur lecture note: {:?}", e)),
        }
    }
    Ok(res)
}

#[tauri::command]
pub fn get_grades_by_student(
    school_id: String,
    academic_year_id: String,
    student_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::Grade>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT g.id, g.school_id, g.academic_year_id, g.enrollment_id, g.student_id,
                g.class_subject_id, g.grading_period_id, g.grade_type_id,
                g.score, g.max_score, g.evaluation_date, g.notes, g.recorded_by, g.is_absent,
                st.first_name, st.last_name, s.name, gt.name
         FROM grades g
         JOIN students st ON g.student_id = st.id
         JOIN class_subjects cs ON g.class_subject_id = cs.id
         JOIN subjects s ON cs.subject_id = s.id
         JOIN grade_types gt ON g.grade_type_id = gt.id
         WHERE g.school_id=?1 AND g.academic_year_id=?2 AND g.student_id=?3
         ORDER BY g.grading_period_id, s.name, g.evaluation_date"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, student_id], |row| {
        Ok(crate::models::Grade {
            id: row.get(0)?, school_id: row.get(1)?, academic_year_id: row.get(2)?,
            enrollment_id: row.get(3)?, student_id: row.get(4)?, class_subject_id: row.get(5)?,
            grading_period_id: row.get(6)?, grade_type_id: row.get(7)?,
            score: row.get(8)?, max_score: row.get(9)?,
            evaluation_date: row.get(10)?, notes: row.get(11)?,
            recorded_by: row.get(12)?, is_absent: row.get::<_, i64>(13)? != 0,
            student_first_name: row.get(14)?, student_last_name: row.get(15)?,
            subject_name: row.get(16)?, grade_type_name: row.get(17)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { if let Ok(g) = r { res.push(g); } }
    Ok(res)
}

/// Crée ou corrige une note. Si une note du même (enrollment, class_subject, period, grade_type)
/// existe déjà, elle est mise à jour (audit trail) ; sinon elle est insérée.
#[tauri::command]
pub fn upsert_grade(
    school_id: String,
    academic_year_id: String,
    enrollment_id: String,
    student_id: String,
    class_subject_id: String,
    grading_period_id: String,
    grade_type_id: String,
    score: f64,
    max_score: f64,
    evaluation_date: Option<String>,
    notes: Option<String>,
    recorded_by: String,
    is_absent: bool,
    state: State<'_, DbState>
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;

    let now = chrono::Utc::now().to_rfc3339();

    // Cherche une note existante pour ce triplet (enrollment, class_subject, period, grade_type)
    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM grades WHERE enrollment_id=?1 AND class_subject_id=?2 AND grading_period_id=?3 AND grade_type_id=?4",
        rusqlite::params![enrollment_id, class_subject_id, grading_period_id, grade_type_id],
        |r| r.get(0)
    ).ok();

    let grade_id = if let Some(eid) = existing_id {
        conn.execute(
            "UPDATE grades SET score=?1, max_score=?2, evaluation_date=?3, notes=?4, recorded_by=?5, is_absent=?6, updated_at=?7 WHERE id=?8",
            rusqlite::params![score, max_score, evaluation_date, notes, recorded_by, is_absent, now, eid]
        ).map_err(|e| e.to_string())?;
        eid
    } else {
        let new_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO grades (id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id, grading_period_id, grade_type_id, score, max_score, evaluation_date, notes, recorded_by, is_absent, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)",
            rusqlite::params![new_id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id, grading_period_id, grade_type_id, score, max_score, evaluation_date, notes, recorded_by, is_absent, now]
        ).map_err(|e| format!("Erreur SQL: {}", e))?;
        new_id
    };

    enqueue_entity(&conn, "grades", &school_id, &grade_id);
    let payload = serde_json::json!({"id":grade_id,"student_id":student_id,"score":score,"is_absent":is_absent,"updated_at":now});
    conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, new_data) VALUES (?1,?2,'UPSERT_GRADE','grades',?3)",
        rusqlite::params![uuid::Uuid::new_v4().to_string(), school_id, payload.to_string()]
    ).unwrap_or(0);

    Ok(grade_id)
}

// ── MOYENNES & CLASSEMENTS ────────────────────────────────────

/// Calcule les moyennes d'un élève (par matière + générale) pour une période donnée.
/// Formule : Σ(score_i × weight_i) / Σ(weight_i) par matière, puis pondération par coefficient.
#[tauri::command]
pub fn get_student_averages(
    school_id: String,
    academic_year_id: String,
    enrollment_id: String,
    grading_period_id: String,
    state: State<'_, DbState>
) -> Result<crate::models::StudentAverages, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // Infos élève
    let (student_id, first_name, last_name): (String, String, String) = conn.query_row(
        "SELECT e.student_id, s.first_name, s.last_name FROM enrollments e JOIN students s ON e.student_id = s.id WHERE e.id=?1",
        rusqlite::params![enrollment_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
    ).map_err(|e| e.to_string())?;

    // Matières de la classe pour l'année
    let class_id: String = conn.query_row(
        "SELECT class_id FROM enrollments WHERE id=?1", rusqlite::params![enrollment_id], |r| r.get(0)
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT cs.id, s.name, s.code, cs.coefficient FROM class_subjects cs JOIN subjects s ON cs.subject_id=s.id
         WHERE cs.school_id=?1 AND cs.academic_year_id=?2 AND cs.class_id=?3 ORDER BY s.name"
    ).map_err(|e| e.to_string())?;
    let class_subjects: Vec<(String, String, String, f64)> = stmt.query_map(
        rusqlite::params![school_id, academic_year_id, class_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
    ).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    let mut subject_avgs: Vec<crate::models::SubjectAverage> = Vec::new();
    let mut weighted_sum = 0.0_f64;
    let mut coeff_sum = 0.0_f64;

    for (cs_id, s_name, s_code, coeff) in &class_subjects {
        // Notes de l'élève pour cette matière et cette période
        let mut g_stmt = conn.prepare(
            "SELECT g.score, g.max_score FROM grades g
             WHERE g.enrollment_id=?1 AND g.class_subject_id=?2 AND g.grading_period_id=?3"
        ).map_err(|e| e.to_string())?;
        let grade_rows: Vec<(f64, f64)> = g_stmt.query_map(
            rusqlite::params![enrollment_id, cs_id, grading_period_id], |r| Ok((r.get(0)?, r.get(1)?))
        ).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

        let grade_count = grade_rows.len() as i64;

        let avg: Option<f64> = if grade_count == 0 { None } else {
            let num: f64 = grade_rows.iter().map(|(sc, ms)| sc / ms * 20.0).sum();
            let den = grade_count as f64;
            if den > 0.0 { Some(num / den) } else { None }
        };

        // Moyenne de la classe pour la même matière/période
        let class_avg: Option<f64> = conn.query_row(
            "SELECT AVG(g.score / g.max_score * 20.0) FROM grades g WHERE g.class_subject_id=?1 AND g.grading_period_id=?2 AND g.school_id=?3",
            rusqlite::params![cs_id, grading_period_id, school_id], |r| r.get(0)
        ).unwrap_or(None);

        let appr = avg.map(|a| appreciation(a)).unwrap_or_else(|| "—".into());

        if let Some(a) = avg {
            weighted_sum += a * coeff;
            coeff_sum += coeff;
        }

        subject_avgs.push(crate::models::SubjectAverage {
            class_subject_id: cs_id.clone(), subject_name: s_name.clone(), subject_code: s_code.clone(),
            coefficient: *coeff, average: avg, class_average: class_avg, appreciation: appr, grade_count,
        });
    }

    let general_average = if coeff_sum > 0.0 { Some(weighted_sum / coeff_sum) } else { None };

    // Rang dans la classe pour cette période
    let rank: Option<i64> = if general_average.is_some() {
        let gen_avg_val = general_average.unwrap();
        conn.query_row(
            "SELECT COUNT(*)+1 FROM (
                SELECT e2.id, SUM(g2.score / g2.max_score * 20.0 * cs2.coefficient) / NULLIF(SUM(cs2.coefficient), 0) AS gavg
                FROM enrollments e2
                JOIN grades g2 ON e2.id = g2.enrollment_id
                JOIN class_subjects cs2 ON g2.class_subject_id = cs2.id
                WHERE e2.class_id=?1 AND g2.grading_period_id=?2 AND g2.academic_year_id=?3
                GROUP BY e2.id
             ) WHERE gavg > ?4",
            rusqlite::params![class_id, grading_period_id, academic_year_id, gen_avg_val],
            |r| r.get(0)
        ).ok()
    } else { None };

    let class_size: i64 = conn.query_row(
        "SELECT COUNT(*) FROM enrollments WHERE class_id=?1 AND academic_year_id=?2 AND status='ACTIVE'",
        rusqlite::params![class_id, academic_year_id], |r| r.get(0)
    ).unwrap_or(0);

    Ok(crate::models::StudentAverages {
        student_id, enrollment_id, first_name, last_name, grading_period_id,
        general_average, rank, class_size, subjects: subject_avgs,
    })
}

/// Retourne le classement complet d'une classe pour une période.
#[tauri::command]
pub fn get_class_rankings(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    grading_period_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::ClassRankingEntry>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT e.id, e.student_id, s.first_name, s.last_name,
                SUM(g.score / g.max_score * 20.0 * cs.coefficient) / NULLIF(SUM(cs.coefficient), 0) AS gavg
         FROM enrollments e
         JOIN students s ON e.student_id = s.id
         LEFT JOIN grades g ON e.id = g.enrollment_id AND g.grading_period_id = ?3 AND g.academic_year_id = ?2
         LEFT JOIN class_subjects cs ON g.class_subject_id = cs.id
         WHERE e.class_id=?1 AND e.academic_year_id=?2 AND e.status='ACTIVE' AND e.school_id=?4
         GROUP BY e.id, e.student_id, s.first_name, s.last_name
         ORDER BY gavg DESC NULLS LAST, s.last_name"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![class_id, academic_year_id, grading_period_id, school_id], |row| {
        let avg: Option<f64> = row.get(4)?;
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, avg))
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (rank, r) in rows.filter_map(Result::ok).enumerate() {
        let appr = r.4.map(|a| appreciation(a)).unwrap_or_else(|| "—".into());
        result.push(crate::models::ClassRankingEntry {
            rank: (rank + 1) as i64,
            enrollment_id: r.0, student_id: r.1, first_name: r.2, last_name: r.3,
            general_average: r.4, appreciation: appr,
        });
    }
    Ok(result)
}

/// Statistiques par matière pour une classe et une période.
#[tauri::command]
pub fn get_class_statistics(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    grading_period_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::SubjectStats>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT cs.id, s.name, s.code,
                COUNT(DISTINCT g.enrollment_id),
                AVG(g.score / g.max_score * 20.0),
                MIN(g.score / g.max_score * 20.0),
                MAX(g.score / g.max_score * 20.0),
                SUM(CASE WHEN (g.score / g.max_score * 20.0) >= 10 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(DISTINCT g.enrollment_id), 0)
         FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         LEFT JOIN grades g ON g.class_subject_id = cs.id AND g.grading_period_id = ?3 AND g.academic_year_id = ?2
         WHERE cs.school_id=?1 AND cs.academic_year_id=?2 AND cs.class_id=?4
         GROUP BY cs.id, s.name, s.code ORDER BY s.name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, grading_period_id, class_id], |row| {
        Ok(crate::models::SubjectStats {
            class_subject_id: row.get(0)?, subject_name: row.get(1)?, subject_code: row.get(2)?,
            grade_count: row.get(3)?, class_average: row.get(4)?,
            min_score: row.get(5)?, max_score: row.get(6)?,
            success_rate: row.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { if let Ok(s) = r { res.push(s); } }
    Ok(res)
}

// ── RÉCAP DES NOTES (matrice élèves × matières) ──────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct RecapSubjectColumn {
    pub class_subject_id: String,
    pub subject_name: String,
    pub subject_code: String,
    pub coefficient: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RecapStudentRow {
    pub enrollment_id: String,
    pub student_id: String,
    pub first_name: String,
    pub last_name: String,
    pub matricule: Option<String>,
    /// Moyenne /20 par matière, clé = class_subject_id (None si aucune note).
    pub averages: std::collections::HashMap<String, Option<f64>>,
    pub general_average: Option<f64>,
    pub rank: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ClassNotesRecap {
    pub subjects: Vec<RecapSubjectColumn>,
    pub students: Vec<RecapStudentRow>,
}

/// Construit la matrice « récap des notes » : pour chaque élève actif d'une
/// classe et une période donnée, la moyenne par matière et la moyenne générale
/// pondérée. Si `teacher_id` est fourni, seules les matières de ce professeur
/// sont incluses (restriction d'accès des enseignants).
#[tauri::command]
pub fn get_class_notes_recap(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    grading_period_id: String,
    teacher_id: Option<String>,
    state: State<'_, DbState>,
) -> Result<ClassNotesRecap, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // 1. Colonnes : matières de la classe (filtrées par professeur si besoin)
    let subjects: Vec<RecapSubjectColumn> = if let Some(tid) = teacher_id.as_ref() {
        let mut stmt = conn.prepare(
            "SELECT cs.id, s.name, s.code, cs.coefficient
             FROM class_subjects cs JOIN subjects s ON cs.subject_id = s.id
             WHERE cs.school_id=?1 AND cs.academic_year_id=?2 AND cs.class_id=?3 AND cs.teacher_id=?4
             ORDER BY s.name"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, class_id, tid], |row| {
            Ok(RecapSubjectColumn {
                class_subject_id: row.get(0)?, subject_name: row.get(1)?,
                subject_code: row.get(2)?, coefficient: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT cs.id, s.name, s.code, cs.coefficient
             FROM class_subjects cs JOIN subjects s ON cs.subject_id = s.id
             WHERE cs.school_id=?1 AND cs.academic_year_id=?2 AND cs.class_id=?3
             ORDER BY s.name"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, class_id], |row| {
            Ok(RecapSubjectColumn {
                class_subject_id: row.get(0)?, subject_name: row.get(1)?,
                subject_code: row.get(2)?, coefficient: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let allowed: std::collections::HashSet<String> =
        subjects.iter().map(|s| s.class_subject_id.clone()).collect();

    // 2. Élèves actifs de la classe
    let mut stmt = conn.prepare(
        "SELECT e.id, e.student_id, s.first_name, s.last_name, s.matricule
         FROM enrollments e JOIN students s ON e.student_id = s.id
         WHERE e.class_id=?1 AND e.academic_year_id=?2 AND e.status='ACTIVE' AND e.school_id=?3
         ORDER BY s.last_name, s.first_name"
    ).map_err(|e| e.to_string())?;
    let students_raw: Vec<(String, String, String, String, Option<String>)> = stmt.query_map(
        rusqlite::params![class_id, academic_year_id, school_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    // 3. Agrégation des notes : (enrollment_id, class_subject_id) -> (somme /20, nombre)
    let mut acc: std::collections::HashMap<(String, String), (f64, f64)> = std::collections::HashMap::new();
    {
        let mut g_stmt = conn.prepare(
            "SELECT g.enrollment_id, g.class_subject_id, g.score, g.max_score
             FROM grades g
             JOIN class_subjects cs ON g.class_subject_id = cs.id
             WHERE g.school_id=?1 AND g.academic_year_id=?2 AND g.grading_period_id=?3
               AND cs.class_id=?4 AND g.is_absent=0"
        ).map_err(|e| e.to_string())?;
        let rows = g_stmt.query_map(
            rusqlite::params![school_id, academic_year_id, grading_period_id, class_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?, row.get::<_, f64>(3)?)),
        ).map_err(|e| e.to_string())?;
        for (eid, csid, score, max_score) in rows.filter_map(Result::ok) {
            if !allowed.contains(&csid) { continue; }
            let on20 = if max_score > 0.0 { score / max_score * 20.0 } else { 0.0 };
            let entry = acc.entry((eid, csid)).or_insert((0.0, 0.0));
            entry.0 += on20;
            entry.1 += 1.0;
        }
    }

    // 4. Construction des lignes (moyennes par matière + moyenne générale)
    let mut rows_out: Vec<RecapStudentRow> = Vec::new();
    for (en_id, student_id, first_name, last_name, matricule) in students_raw {
        let mut averages: std::collections::HashMap<String, Option<f64>> = std::collections::HashMap::new();
        let mut weighted_sum = 0.0_f64;
        let mut coeff_sum = 0.0_f64;
        for s in &subjects {
            let avg = acc.get(&(en_id.clone(), s.class_subject_id.clone()))
                .map(|(sum, count)| if *count > 0.0 { sum / count } else { 0.0 });
            if let Some(a) = avg {
                weighted_sum += a * s.coefficient;
                coeff_sum += s.coefficient;
            }
            averages.insert(s.class_subject_id.clone(), avg);
        }
        let general_average = if coeff_sum > 0.0 { Some(weighted_sum / coeff_sum) } else { None };
        rows_out.push(RecapStudentRow {
            enrollment_id: en_id, student_id, first_name, last_name, matricule,
            averages, general_average, rank: 0,
        });
    }

    // 5. Calcul des rangs (ex-æquo partagent le même rang)
    let mut order: Vec<(usize, Option<f64>)> = rows_out.iter().enumerate()
        .map(|(i, r)| (i, r.general_average)).collect();
    order.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut rank = 0_i64;
    let mut prev: Option<f64> = None;
    for (idx, (i, avg)) in order.iter().enumerate() {
        let changed = match (prev, avg) {
            (None, None) => false,
            (Some(_), None) | (None, Some(_)) => true,
            (Some(p), Some(a)) => (p - a).abs() > 1e-9,
        };
        if changed {
            rank = (idx + 1) as i64;
            prev = *avg;
        }
        rows_out[*i].rank = rank;
    }

    Ok(ClassNotesRecap { subjects, students: rows_out })
}

// ── TEACHER ASSIGNMENTS ──────────────────────────────────────

#[tauri::command]
pub fn get_teacher_assignments(
    school_id: String,
    academic_year_id: String,
    teacher_id: String,
    state: State<'_, DbState>
) -> Result<Vec<crate::models::TeacherAssignment>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT ta.id, ta.school_id, ta.academic_year_id, ta.teacher_id, ta.class_subject_id,
                (u.first_name || ' ' || u.last_name), s.name, c.name
         FROM teacher_assignments ta
         JOIN class_subjects cs ON ta.class_subject_id = cs.id
         JOIN subjects s ON cs.subject_id = s.id
         JOIN classes c ON cs.class_id = c.id
         LEFT JOIN users u ON ta.teacher_id = u.id
         WHERE ta.school_id=?1 AND ta.academic_year_id=?2 AND ta.teacher_id=?3
         ORDER BY c.name, s.name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id, academic_year_id, teacher_id], |row| {
        Ok(crate::models::TeacherAssignment {
            id: row.get(0)?, school_id: row.get(1)?, academic_year_id: row.get(2)?,
            teacher_id: row.get(3)?, class_subject_id: row.get(4)?,
            teacher_name: row.get(5)?, subject_name: row.get(6)?, class_name: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { if let Ok(ta) = r { res.push(ta); } }
    Ok(res)
}

#[tauri::command]
pub fn assign_teacher_to_class_subject(
    school_id: String,
    academic_year_id: String,
    teacher_id: String,
    class_subject_id: String,
    state: State<'_, DbState>
) -> Result<crate::models::TeacherAssignment, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO teacher_assignments (id, school_id, academic_year_id, teacher_id, class_subject_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?6)",
        rusqlite::params![id, school_id, academic_year_id, teacher_id, class_subject_id, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "teacher_assignments", &school_id, &id);
    Ok(crate::models::TeacherAssignment { id, school_id, academic_year_id, teacher_id, class_subject_id, teacher_name: None, subject_name: None, class_name: None })
}

// ── STRUCTURE PÉDAGOGIQUE (Sections → Niveaux → Séries) ──────

#[tauri::command(async)]
pub fn get_sections(school_id: String, state: State<'_, DbState>) -> Result<Vec<crate::models::Section>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare("SELECT id, school_id, name FROM sections WHERE school_id = ? ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([school_id], |row| {
        Ok(crate::models::Section {
            id: row.get(0)?, school_id: row.get(1)?, name: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { if let Ok(s) = r { res.push(s); } }
    Ok(res)
}

#[tauri::command]
pub fn create_section(school_id: String, name: String, state: State<'_, DbState>) -> Result<crate::models::Section, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sections (id, school_id, name, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)",
        rusqlite::params![id, school_id, name, now]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "sections", &school_id, &id);
    Ok(crate::models::Section { id, school_id, name })
}

#[tauri::command]
pub fn update_section(id: String, school_id: String, name: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sections SET name = ?1, updated_at = ?2 WHERE id = ?3 AND school_id = ?4",
        rusqlite::params![name, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "sections", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_section(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute("DELETE FROM sections WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id]).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "sections", &school_id, &id);
    Ok(())
}

#[tauri::command(async)]
pub fn get_levels(school_id: String, section_id: Option<String>, state: State<'_, DbState>) -> Result<Vec<crate::models::Level>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut levels = Vec::new();
    if let Some(sid) = section_id {
        let mut stmt = conn.prepare("SELECT id, school_id, section_id, name, level_order FROM levels WHERE school_id = ? AND section_id = ? ORDER BY level_order").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id, sid], |row| {
            Ok(crate::models::Level {
                id: row.get(0)?, school_id: row.get(1)?, section_id: row.get(2)?,
                name: row.get(3)?, level_order: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { levels.push(row.map_err(|e| e.to_string())?); }
    } else {
        let mut stmt = conn.prepare("SELECT id, school_id, section_id, name, level_order FROM levels WHERE school_id = ? ORDER BY level_order").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id], |row| {
            Ok(crate::models::Level {
                id: row.get(0)?, school_id: row.get(1)?, section_id: row.get(2)?,
                name: row.get(3)?, level_order: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { levels.push(row.map_err(|e| e.to_string())?); }
    }
    Ok(levels)
}

#[tauri::command]
pub fn create_level(school_id: String, section_id: String, name: String, level_order: i64, state: State<'_, DbState>) -> Result<crate::models::Level, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO levels (id, school_id, section_id, name, level_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)",
        rusqlite::params![id, school_id, section_id, name, level_order, now]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "levels", &school_id, &id);
    Ok(crate::models::Level { id, school_id, section_id, name, level_order })
}

#[tauri::command]
pub fn update_level(id: String, school_id: String, name: String, level_order: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE levels SET name = ?1, level_order = ?2, updated_at = ?3 WHERE id = ?4 AND school_id = ?5",
        rusqlite::params![name, level_order, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "levels", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_level(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute("DELETE FROM levels WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id]).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "levels", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn get_series(school_id: String, level_id: Option<String>, state: State<'_, DbState>) -> Result<Vec<crate::models::Series>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut series = Vec::new();
    if let Some(lid) = level_id {
        let mut stmt = conn.prepare("SELECT id, school_id, level_id, name FROM series WHERE school_id = ? AND level_id = ?").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id, lid], |row| {
            Ok(crate::models::Series {
                id: row.get(0)?, school_id: row.get(1)?, level_id: row.get(2)?, name: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { series.push(row.map_err(|e| e.to_string())?); }
    } else {
        let mut stmt = conn.prepare("SELECT id, school_id, level_id, name FROM series WHERE school_id = ?").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id], |row| {
            Ok(crate::models::Series {
                id: row.get(0)?, school_id: row.get(1)?, level_id: row.get(2)?, name: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { series.push(row.map_err(|e| e.to_string())?); }
    }
    Ok(series)
}

#[tauri::command]
pub fn create_series(school_id: String, level_id: String, name: String, state: State<'_, DbState>) -> Result<crate::models::Series, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO series (id, school_id, level_id, name, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
        rusqlite::params![id, school_id, level_id, name, now]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "series", &school_id, &id);
    Ok(crate::models::Series { id, school_id, level_id, name })
}

#[tauri::command]
pub fn update_series(id: String, school_id: String, name: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE series SET name = ?1, updated_at = ?2 WHERE id = ?3 AND school_id = ?4",
        rusqlite::params![name, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "series", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_series(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute("DELETE FROM series WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id]).map_err(|e| e.to_string())?;
    enqueue_entity(&conn, "series", &school_id, &id);
    Ok(())
}

// ── MODULE PERSONNEL ──────────────────────────────────────────────────────────

fn row_to_staff(row: &rusqlite::Row<'_>) -> rusqlite::Result<crate::models::Staff> {
    Ok(crate::models::Staff {
        id: row.get(0)?,
        school_id: row.get(1)?,
        matricule: row.get(2)?,
        nom: row.get(3)?,
        prenoms: row.get(4)?,
        sexe: row.get(5)?,
        date_naissance: row.get(6)?,
        lieu_naissance: row.get(7)?,
        nationalite: row.get(8)?,
        photo_url: row.get(9)?,
        situation_matrimoniale: row.get(10)?,
        nombre_enfants: row.get(11)?,
        telephone_principal: row.get(12)?,
        telephone_secondaire: row.get(13)?,
        email: row.get(14)?,
        adresse: row.get(15)?,
        region: row.get(16)?,
        prefecture: row.get(17)?,
        commune: row.get(18)?,
        quartier: row.get(19)?,
        urgence_nom: row.get(20)?,
        urgence_telephone: row.get(21)?,
        type_personnel: row.get(22)?,
        fonction: row.get(23)?,
        statut_professionnel: row.get(24)?,
        matricule_professionnel: row.get(25)?,
        categorie: row.get(26)?,
        grade: row.get(27)?,
        classe_grade: row.get(28)?,
        echelon: row.get(29)?,
        indice: row.get(30)?,
        diplome_academique: row.get(31)?,
        diplome_professionnel: row.get(32)?,
        specialite: row.get(33)?,
        date_recrutement: row.get(34)?,
        date_entree_fonction_pub: row.get(35)?,
        etablissement: row.get(36)?,
        annee_scolaire_id: row.get(37)?,
        fonction_etablissement: row.get(38)?,
        decision_affectation_num: row.get(39)?,
        date_affectation: row.get(40)?,
        date_prise_service: row.get(41)?,
        date_arrivee_region: row.get(42)?,
        date_arrivee_etablissement: row.get(43)?,
        ancien_etablissement: row.get(44)?,
        service_direction: row.get(45)?,
        matiere_principale: row.get(46)?,
        matieres_secondaires: row.get(47)?,
        classes_principales: row.get(48)?,
        volume_horaire_hebdo: row.get(49)?,
        est_prof_principal: row.get::<_, i64>(50)? != 0,
        est_responsable_classe: row.get::<_, i64>(51)? != 0,
        heures_prevues: row.get(52)?,
        heures_effectuees: row.get(53)?,
        statut_administratif: row.get(54)?,
        date_debut_conge: row.get(55)?,
        date_fin_conge: row.get(56)?,
        date_disponibilite: row.get(57)?,
        date_mutation: row.get(58)?,
        date_suspension: row.get(59)?,
        date_retraite: row.get(60)?,
        date_depart: row.get(61)?,
        motif_depart: row.get(62)?,
        observations: row.get(63)?,
        est_actif: row.get::<_, i64>(64)? != 0,
        created_by: row.get(65)?,
        updated_by: row.get(66)?,
        created_at: row.get(67)?,
        updated_at: row.get(68)?,
    })
}

const STAFF_SELECT: &str = "
    SELECT staff.id, staff.school_id,
        staff.matricule, staff.nom, staff.prenoms, staff.sexe, staff.date_naissance, staff.lieu_naissance,
        staff.nationalite, staff.photo_url, staff.situation_matrimoniale, staff.nombre_enfants,
        staff.telephone_principal, staff.telephone_secondaire, staff.email, staff.adresse,
        staff.region, staff.prefecture, staff.commune, staff.quartier, staff.urgence_nom, staff.urgence_telephone,
        staff.type_personnel, staff.fonction, staff.statut_professionnel, staff.matricule_professionnel,
        staff.categorie, staff.grade, staff.classe_grade, staff.echelon, staff.indice,
        staff.diplome_academique, staff.diplome_professionnel, staff.specialite,
        staff.date_recrutement, staff.date_entree_fonction_pub,
        staff.etablissement, staff.annee_scolaire_id, staff.fonction_etablissement,
        staff.decision_affectation_num, staff.date_affectation, staff.date_prise_service,
        staff.date_arrivee_region, staff.date_arrivee_etablissement, staff.ancien_etablissement, staff.service_direction,
        staff.matiere_principale, staff.matieres_secondaires, 
        (SELECT GROUP_CONCAT(DISTINCT c.name) FROM class_subjects cs JOIN classes c ON cs.class_id = c.id WHERE cs.teacher_id = staff.id AND cs.school_id = staff.school_id) as classes_principales,
        staff.volume_horaire_hebdo, staff.est_prof_principal, staff.est_responsable_classe,
        staff.heures_prevues, staff.heures_effectuees,
        staff.statut_administratif, staff.date_debut_conge, staff.date_fin_conge, staff.date_disponibilite,
        staff.date_mutation, staff.date_suspension, staff.date_retraite, staff.date_depart, staff.motif_depart, staff.observations,
        staff.est_actif, staff.created_by, staff.updated_by, staff.created_at, staff.updated_at
    FROM staff";

/// Liste tout le personnel d'un établissement.
/// `include_photos = false` écarte les photos en base64 (plusieurs Mo) quand l'appelant
/// ne les affiche pas — c'est le cas des Archives.
#[tauri::command(async)]
pub fn get_staff(school_id: String, include_photos: Option<bool>, state: State<'_, DbState>) -> Result<Vec<crate::models::Staff>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let query = format!("{} WHERE school_id=?1 ORDER BY nom, prenoms", STAFF_SELECT);
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![school_id], row_to_staff).map_err(|e| e.to_string())?;
    let mut res = Vec::new();
    for r in rows { match r { Ok(s) => res.push(s), Err(e) => return Err(format!("Erreur lecture personnel: {:?}", e)) } }
    if include_photos == Some(false) {
        for s in res.iter_mut() { s.photo_url = None; }
    }
    Ok(res)
}

/// Photo d'un seul membre du personnel, chargée à la demande (fiche d'édition).
#[tauri::command(async)]
pub fn get_staff_photo(staff_id: String, state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.query_row(
        "SELECT photo_url FROM staff WHERE id = ?1",
        rusqlite::params![staff_id],
        |row| row.get::<_, Option<String>>(0),
    ).map_err(|e| format!("Erreur lecture photo du personnel: {}", e))
}

/// Crée un nouveau membre du personnel
#[tauri::command]
pub fn create_staff(
    school_id: String,
    nom: String,
    prenoms: String,
    sexe: Option<String>,
    matricule: Option<String>,
    type_personnel: Option<String>,
    fonction: Option<String>,
    statut_administratif: Option<String>,
    state: State<'_, DbState>
) -> Result<crate::models::Staff, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let statut = statut_administratif.unwrap_or_else(|| "Actif".to_string());
    conn.execute(
        "INSERT INTO staff (id, school_id, nom, prenoms, sexe, matricule, type_personnel, fonction, statut_administratif, est_actif, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?10)",
        rusqlite::params![id, school_id, nom, prenoms, sexe, matricule, type_personnel, fonction, statut, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "staff", &school_id, &id);
    let query = format!("{} WHERE id=?1", STAFF_SELECT);
    let staff = conn.query_row(&query, rusqlite::params![id], row_to_staff).map_err(|e| e.to_string())?;
    Ok(staff)
}

/// Met à jour toutes les informations d'un membre du personnel
#[tauri::command]
pub fn update_staff(staff: crate::models::Staff, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE staff SET
            matricule=?1, nom=?2, prenoms=?3, sexe=?4, date_naissance=?5, lieu_naissance=?6,
            nationalite=?7, photo_url=?8, situation_matrimoniale=?9, nombre_enfants=?10,
            telephone_principal=?11, telephone_secondaire=?12, email=?13, adresse=?14,
            region=?15, prefecture=?16, commune=?17, quartier=?18,
            urgence_nom=?19, urgence_telephone=?20,
            type_personnel=?21, fonction=?22, statut_professionnel=?23,
            matricule_professionnel=?24, categorie=?25, grade=?26, classe_grade=?27,
            echelon=?28, indice=?29, diplome_academique=?30, diplome_professionnel=?31,
            specialite=?32, date_recrutement=?33, date_entree_fonction_pub=?34,
            etablissement=?35, annee_scolaire_id=?36, fonction_etablissement=?37,
            decision_affectation_num=?38, date_affectation=?39, date_prise_service=?40,
            date_arrivee_region=?41, date_arrivee_etablissement=?42,
            ancien_etablissement=?43, service_direction=?44,
            matiere_principale=?45, matieres_secondaires=?46, classes_principales=?47,
            volume_horaire_hebdo=?48, est_prof_principal=?49, est_responsable_classe=?50,
            heures_prevues=?51, heures_effectuees=?52,
            statut_administratif=?53, date_debut_conge=?54, date_fin_conge=?55,
            date_disponibilite=?56, date_mutation=?57, date_suspension=?58,
            date_retraite=?59, date_depart=?60, motif_depart=?61, observations=?62,
            est_actif=?63, updated_by=?64, updated_at=?65
         WHERE id=?66 AND school_id=?67",
        rusqlite::params![
            staff.matricule, staff.nom, staff.prenoms, staff.sexe,
            staff.date_naissance, staff.lieu_naissance, staff.nationalite, staff.photo_url,
            staff.situation_matrimoniale, staff.nombre_enfants,
            staff.telephone_principal, staff.telephone_secondaire, staff.email, staff.adresse,
            staff.region, staff.prefecture, staff.commune, staff.quartier,
            staff.urgence_nom, staff.urgence_telephone,
            staff.type_personnel, staff.fonction, staff.statut_professionnel,
            staff.matricule_professionnel, staff.categorie, staff.grade, staff.classe_grade,
            staff.echelon, staff.indice, staff.diplome_academique, staff.diplome_professionnel,
            staff.specialite, staff.date_recrutement, staff.date_entree_fonction_pub,
            staff.etablissement, staff.annee_scolaire_id, staff.fonction_etablissement,
            staff.decision_affectation_num, staff.date_affectation, staff.date_prise_service,
            staff.date_arrivee_region, staff.date_arrivee_etablissement,
            staff.ancien_etablissement, staff.service_direction,
            staff.matiere_principale, staff.matieres_secondaires, staff.classes_principales,
            staff.volume_horaire_hebdo,
            if staff.est_prof_principal { 1i64 } else { 0i64 },
            if staff.est_responsable_classe { 1i64 } else { 0i64 },
            staff.heures_prevues, staff.heures_effectuees,
            staff.statut_administratif, staff.date_debut_conge, staff.date_fin_conge,
            staff.date_disponibilite, staff.date_mutation, staff.date_suspension,
            staff.date_retraite, staff.date_depart, staff.motif_depart, staff.observations,
            if staff.est_actif { 1i64 } else { 0i64 },
            staff.updated_by, now,
            staff.id, staff.school_id
        ]
    ).map_err(|e| format!("Erreur SQL update_staff: {}", e))?;
    enqueue_entity(&conn, "staff", &staff.school_id, &staff.id);
    Ok(())
}

/// Supprime un membre du personnel
#[tauri::command]
pub fn delete_staff(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute(
        "DELETE FROM staff WHERE id=?1 AND school_id=?2",
        rusqlite::params![id, school_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Met à jour la colonne `classes_principales` du staff en fonction de ses affectations de cours
#[tauri::command]
pub fn update_staff_classes(staff_id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    
    let mut stmt = conn.prepare("
        SELECT DISTINCT c.name 
        FROM class_subjects cs
        JOIN classes c ON cs.class_id = c.id
        WHERE cs.teacher_id = ?1 AND cs.school_id = ?2
        ORDER BY c.name ASC
    ").map_err(|e| e.to_string())?;
    
    let class_iter = stmt.query_map(rusqlite::params![staff_id, school_id], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| e.to_string())?;
    
    let mut classes: Vec<String> = Vec::new();
    for name in class_iter {
        if let Ok(n) = name {
            classes.push(n);
        }
    }
    
    let classes_str = if classes.is_empty() {
        None
    } else {
        Some(classes.join(", "))
    };
    
    let now = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "UPDATE staff SET classes_principales=?1, updated_at=?2 WHERE id=?3 AND school_id=?4",
        rusqlite::params![classes_str, now, staff_id, school_id]
    ).map_err(|e| e.to_string())?;
    
    enqueue_entity(&conn, "staff", &school_id, &staff_id);
    Ok(())
}



// ══════════════════════════════════════════════════════════════════════════════
// Emploi du temps
// ══════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize, Clone)]
pub struct TimetableSlot {
    pub id: String,
    pub class_id: String,
    pub day_of_week: i64,
    pub slot_index: i64,
    pub subject_id: Option<String>,
    pub subject_code: Option<String>,
    pub subject_name: Option<String>,
}

#[tauri::command]
pub fn get_timetable(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<TimetableSlot>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.class_id, t.day_of_week, t.slot_index, t.subject_id,
                s.code, s.name
         FROM timetable_slots t
         LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.school_id=?1 AND t.academic_year_id=?2 AND t.class_id=?3
         ORDER BY t.day_of_week, t.slot_index"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(
        rusqlite::params![school_id, academic_year_id, class_id],
        |row| Ok(TimetableSlot {
            id: row.get(0)?,
            class_id: row.get(1)?,
            day_of_week: row.get(2)?,
            slot_index: row.get(3)?,
            subject_id: row.get(4)?,
            subject_code: row.get(5)?,
            subject_name: row.get(6)?,
        }),
    ).map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

#[tauri::command]
pub fn save_timetable_slot(
    school_id: String,
    academic_year_id: String,
    class_id: String,
    day_of_week: i64,
    slot_index: i64,
    subject_id: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO timetable_slots (id, school_id, academic_year_id, class_id, day_of_week, slot_index, subject_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(academic_year_id, class_id, day_of_week, slot_index)
         DO UPDATE SET subject_id=excluded.subject_id, updated_at=excluded.updated_at",
        rusqlite::params![id, school_id, academic_year_id, class_id, day_of_week, slot_index, subject_id, now],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDE : Offline Auth
// ──────────────────────────────────────────────
use bcrypt::{hash, verify, DEFAULT_COST};

#[tauri::command]
pub fn store_offline_credentials(user_id: String, email: String, password: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    
    let password_hash = hash(&password, DEFAULT_COST).map_err(|e| format!("Erreur hash: {}", e))?;

    // Update if exists, or do we insert? Better to just update since sync_local_user already inserts it, 
    // but just in case sync_local_user is not finished, we can use an UPSERT.
    conn.execute(
        "INSERT INTO users (id, email, password_hash) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash",
        rusqlite::params![user_id, email, password_hash],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Supprime complètement une école et toutes ses données du SQLite local.
/// Appelé quand le SUPER_ADMIN supprime un établissement depuis Supabase,
/// pour que le SQLite de cette machine soit cohérent immédiatement.
#[tauri::command]
pub fn purge_local_school(school_id: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // Suppression dans l'ordre correct (enfants avant parents)
    let tables = [
        "grades", "teacher_assignments", "class_subjects",
        "grading_periods", "grade_types", "subjects",
        "payments", "fee_structures",
        "enrollment_history", "enrollments",
        "staff", "timetable_slots",
        "classes", "students",
        "academic_years",
        "pending_mutations", "sync_inbox",
        "audit_logs", "devices", "licenses",
        "user_roles", "profiles", "users",
        "schools",
    ];

    for table in &tables {
        // Certaines tables n'ont pas de colonne school_id → on ignore l'erreur
        let sql = if *table == "enrollment_history" {
            // enrollment_history n'a pas school_id, on passe par enrollments
            format!(
                "DELETE FROM enrollment_history WHERE enrollment_id IN \
                 (SELECT id FROM enrollments WHERE school_id = '{}')",
                school_id
            )
        } else {
            format!("DELETE FROM {} WHERE school_id = '{}'", table, school_id)
        };
        // On ignore silencieusement si la colonne n'existe pas dans cette table
        let _ = conn.execute(&sql, []);
    }

    Ok(())
}

/// Vérifie si une école existe encore dans la base SQLite locale.
/// Utilisé au démarrage pour invalider une session hors-ligne dont l'école a été supprimée.
#[tauri::command]
pub fn check_local_school_exists(school_id: String, state: tauri::State<'_, DbState>) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM schools WHERE id = ?1",
        rusqlite::params![school_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn login_offline(email: String, password: String, state: tauri::State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let (user_id, hash_str): (String, Option<String>) = conn.query_row(
        "SELECT id, password_hash FROM users WHERE email = ?1",
        rusqlite::params![email],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Utilisateur non trouvé hors-ligne".to_string())?;

    if let Some(h) = hash_str {
        if verify(&password, &h).unwrap_or(false) {
            Ok(user_id)
        } else {
            Err("Mot de passe incorrect".to_string())
        }
    } else {
        Err("Aucune connexion hors-ligne préalablement enregistrée pour cet utilisateur".to_string())
    }
}

// ── NOUVELLES COMMANDES POUR LE DASHBOARD DE SÉCURITÉ ──

#[derive(Serialize, Deserialize)]
pub struct DeviceRec {
    pub id: String,
    pub school_id: String,
    pub device_identifier: String,
    pub device_name: Option<String>,
    pub platform: Option<String>,
    pub status: String,
    pub last_seen_at: Option<String>,
}

#[tauri::command]
pub fn get_devices(school_id: String, state: State<'_, DbState>) -> Result<Vec<DeviceRec>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, school_id, device_identifier, device_name, platform, status, last_seen_at 
         FROM devices WHERE school_id = ?1 ORDER BY last_seen_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(rusqlite::params![school_id], |row| {
        Ok(DeviceRec {
            id: row.get(0)?,
            school_id: row.get(1)?,
            device_identifier: row.get(2)?,
            device_name: row.get(3)?,
            platform: row.get(4)?,
            status: row.get(5)?,
            last_seen_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut devices = Vec::new();
    for r in rows {
        if let Ok(d) = r {
            devices.push(d);
        }
    }
    Ok(devices)
}

#[derive(Serialize, Deserialize)]
pub struct LicenseRec {
    pub id: String,
    pub school_id: String,
    pub license_key: String,
    pub status: String,
    pub starts_at: Option<String>,
    pub expires_at: Option<String>,
    pub max_devices: Option<i64>,
}

#[tauri::command]
pub fn get_licenses(school_id: String, state: State<'_, DbState>) -> Result<Vec<LicenseRec>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, school_id, license_key, status, starts_at, expires_at, max_devices 
         FROM licenses WHERE school_id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map(rusqlite::params![school_id], |row| {
        Ok(LicenseRec {
            id: row.get(0)?,
            school_id: row.get(1)?,
            license_key: row.get(2)?,
            status: row.get(3)?,
            starts_at: row.get(4)?,
            expires_at: row.get(5)?,
            max_devices: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut licenses = Vec::new();
    for r in rows {
        if let Ok(l) = r {
            licenses.push(l);
        }
    }
    Ok(licenses)
}

#[tauri::command]
pub fn save_license(license: LicenseRec, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO licenses (id, school_id, license_key, status, starts_at, expires_at, max_devices, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)",
        rusqlite::params![
            license.id,
            license.school_id,
            license.license_key,
            license.status,
            license.starts_at,
            license.expires_at,
            license.max_devices,
        ],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_local_license(id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute("DELETE FROM licenses WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn purge_local_licenses(school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    conn.execute("DELETE FROM licenses WHERE school_id = ?1", rusqlite::params![school_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}



#[derive(Serialize, Deserialize)]
pub struct RoleRec {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

#[tauri::command]
pub fn get_roles(state: State<'_, DbState>) -> Result<Vec<RoleRec>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description FROM roles"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(RoleRec {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut roles = Vec::new();
    for r in rows {
        if let Ok(ro) = r {
            roles.push(ro);
        }
    }
    Ok(roles)
}

// ──────────────────────────────────────────────
// COMMANDES : Gestion multi-utilisateurs
// ──────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct LocalUserInfo {
    pub user_id: String,
    pub email: String,
    pub username: Option<String>,
    pub status: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phone: Option<String>,
    pub role_name: Option<String>,
    pub role_id: Option<String>,
    pub profile_id: Option<String>,
    pub staff_id: Option<String>,
    pub staff_name: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn get_school_users(school_id: String, state: State<'_, DbState>) -> Result<Vec<LocalUserInfo>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT u.id, u.email, u.username, u.status, p.first_name, p.last_name, p.phone,
                r.name as role_name, r.id as role_id, p.id as profile_id, u.created_at,
                p.staff_id, COALESCE(NULLIF(TRIM(s.nom || ' ' || s.prenoms), ''), NULL) as staff_name
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id AND p.school_id = ?1 AND p.deleted_at IS NULL
         LEFT JOIN staff s ON s.id = p.staff_id AND s.school_id = ?1
         LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.school_id = ?1
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE EXISTS (
             SELECT 1 FROM profiles p2 WHERE p2.user_id = u.id AND p2.school_id = ?1
             UNION
             SELECT 1 FROM user_roles ur2 WHERE ur2.user_id = u.id AND ur2.school_id = ?1
         )
         ORDER BY u.created_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![school_id], |row| {
        Ok(LocalUserInfo {
            user_id: row.get(0)?,
            email: row.get(1)?,
            username: row.get(2)?,
            status: row.get(3)?,
            first_name: row.get(4)?,
            last_name: row.get(5)?,
            phone: row.get(6)?,
            role_name: row.get(7)?,
            role_id: row.get(8)?,
            profile_id: row.get(9)?,
            created_at: row.get(10)?,
            staff_id: row.get(11)?,
            staff_name: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut users = Vec::new();
    for r in rows {
        if let Ok(u) = r { users.push(u); }
    }
    Ok(users)
}

/// Garde-fou : le rôle SUPER_ADMIN n'est plus attribuable depuis l'espace
/// direction (page Utilisateurs) — ni à la création d'un compte
/// (`create_local_user`), ni lors d'un changement de rôle (`assign_user_role`).
/// Ce rôle est réservé à la gouvernance de l'espace SUPER_ADMIN : il est
/// attribué automatiquement lors de la connexion en ligne
/// (cf. `set_local_user_role`), jamais depuis cette page.
fn guard_super_admin_assignment(
    conn: &rusqlite::Connection,
    _actor_id: &str,
    role_id: &str,
) -> Result<(), String> {
    let target_role: Option<String> = conn.query_row(
        "SELECT name FROM roles WHERE id = ?1",
        rusqlite::params![role_id],
        |row| row.get(0),
    ).ok();

    if target_role.as_deref() == Some("SUPER_ADMIN") {
        return Err(
            "Le rôle Super administrateur (SUPER_ADMIN) ne peut plus être créé ni attribué \
             depuis l'espace direction. Utilisez l'espace super administrateur."
                .to_string(),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn create_local_user(
    school_id: String,
    username: String,
    email: String,
    password: String,
    first_name: String,
    last_name: String,
    phone: Option<String>,
    role_id: String,
    actor_id: String,
    staff_id: Option<String>,
    state: State<'_, DbState>
) -> Result<LocalUserInfo, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base".to_string())?;

    guard_super_admin_assignment(&conn, &actor_id, &role_id)?;

    let username = username.trim().to_string();
    if username.is_empty() {
        return Err("Le nom d'utilisateur est obligatoire.".to_string());
    }
    if password.chars().count() < 6 {
        return Err("Le mot de passe doit contenir au moins 6 caractères.".to_string());
    }

    // Vérifier si l'email existe déjà
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE email = ?1",
        rusqlite::params![email],
        |row| row.get(0)
    ).unwrap_or(0);

    if exists > 0 {
        return Err(format!("Un utilisateur avec l'email {} existe déjà.", email));
    }

    // Vérifier si le nom d'utilisateur est déjà pris (insensible à la casse)
    let username_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE username = ?1 COLLATE NOCASE",
        rusqlite::params![username],
        |row| row.get(0)
    ).unwrap_or(0);

    if username_exists > 0 {
        return Err(format!("Le nom d'utilisateur « {} » est déjà utilisé.", username));
    }

    let password_hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Erreur de hachage du mot de passe: {}", e))?;

    // Résolution du lien avec le personnel : identifiant fourni par
    // l'interface, sinon rapprochement automatique par email.
    let mut resolved_staff_id: Option<String> = match staff_id {
        Some(sid) if !sid.trim().is_empty() => conn.query_row(
            "SELECT id FROM staff WHERE id = ?1 AND school_id = ?2 LIMIT 1",
            rusqlite::params![sid, school_id],
            |row| row.get::<_, String>(0),
        ).ok(),
        _ => None,
    };
    if resolved_staff_id.is_none() {
        resolved_staff_id = conn.query_row(
            "SELECT id FROM staff
              WHERE school_id = ?1 AND email IS NOT NULL AND lower(email) = lower(?2)
              LIMIT 1",
            rusqlite::params![school_id, email],
            |row| row.get::<_, String>(0),
        ).ok();
    }
    if let Some(sid) = &resolved_staff_id {
        let already_linked: i64 = conn.query_row(
            "SELECT COUNT(*) FROM profiles WHERE school_id = ?1 AND staff_id = ?2",
            rusqlite::params![school_id, sid],
            |row| row.get(0),
        ).unwrap_or(0);
        if already_linked > 0 {
            return Err("Ce membre du personnel est déjà rattaché à un compte utilisateur.".to_string());
        }
    }

    let user_id = format!("local-{}", uuid_v4());
    let profile_id = format!("prof-{}", uuid_v4());
    let role_assign_id = format!("ur-{}", uuid_v4());
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO users (id, email, username, password_hash, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'ACTIVE', ?5, ?5)",
        rusqlite::params![user_id, email, username, password_hash, now]
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO profiles (id, user_id, school_id, first_name, last_name, phone, staff_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        rusqlite::params![profile_id, user_id, school_id, first_name, last_name, phone, resolved_staff_id, now]
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO user_roles (id, user_id, school_id, role_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![role_assign_id, user_id, school_id, role_id, now]
    ).map_err(|e| e.to_string())?;

    let role_name: Option<String> = conn.query_row(
        "SELECT name FROM roles WHERE id = ?1",
        rusqlite::params![role_id],
        |row| row.get(0)
    ).ok();

    let staff_name: Option<String> = resolved_staff_id.as_ref().and_then(|sid| {
        conn.query_row(
            "SELECT NULLIF(TRIM(nom || ' ' || prenoms), '') FROM staff WHERE id = ?1",
            rusqlite::params![sid],
            |row| row.get::<_, Option<String>>(0),
        ).ok().flatten()
    });

    Ok(LocalUserInfo {
        user_id,
        email,
        username: Some(username),
        status: "ACTIVE".to_string(),
        first_name: Some(first_name),
        last_name: Some(last_name),
        phone,
        role_name,
        role_id: Some(role_id),
        profile_id: Some(profile_id),
        staff_id: resolved_staff_id,
        staff_name,
        created_at: now,
    })
}

fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        nanos,
        nanos & 0xffff,
        (nanos >> 4) & 0xfff,
        0x8000 | (nanos & 0x3fff),
        nanos as u64 * 0x1000000000
    )
}

#[tauri::command]
pub fn toggle_user_status(user_id: String, new_status: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base".to_string())?;
    conn.execute(
        "UPDATE users SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![new_status, user_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn assign_user_role(user_id: String, school_id: String, role_id: String, actor_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base".to_string())?;

    guard_super_admin_assignment(&conn, &actor_id, &role_id)?;

    // Supprimer l'ancien rôle pour cet école
    conn.execute(
        "DELETE FROM user_roles WHERE user_id = ?1 AND school_id = ?2",
        rusqlite::params![user_id, school_id]
    ).map_err(|e| e.to_string())?;
    // Attribuer le nouveau
    let id = format!("ur-{}-{}", user_id, role_id);
    conn.execute(
        "INSERT INTO user_roles (id, user_id, school_id, role_id, created_at) VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
        rusqlite::params![id, user_id, school_id, role_id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_local_user(user_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base".to_string())?;
    // Supprimer les dépendances dans l'ordre (user_roles, profiles, users)
    conn.execute("DELETE FROM user_roles WHERE user_id = ?1", rusqlite::params![user_id])
        .map_err(|e| format!("Erreur suppression rôles: {}", e))?;
    conn.execute("DELETE FROM profiles WHERE user_id = ?1", rusqlite::params![user_id])
        .map_err(|e| format!("Erreur suppression profil: {}", e))?;
    conn.execute("DELETE FROM users WHERE id = ?1", rusqlite::params![user_id])
        .map_err(|e| format!("Erreur suppression utilisateur: {}", e))?;
    Ok(())
}

// ──────────────────────────────────────────────
// COMMANDES : Authentification locale
// (identifiant + mot de passe attribués par la Direction)
// ──────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct LoginProfile {
    pub user_id: String,
    pub email: String,
    pub username: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub role_name: Option<String>,
}

/// Définit ou change le mot de passe d'un utilisateur (réservé à la Direction)
#[tauri::command]
pub fn set_user_password(user_id: String, password: String, state: State<'_, DbState>) -> Result<(), String> {
    use bcrypt::{hash, DEFAULT_COST};

    if password.chars().count() < 6 {
        return Err("Le mot de passe doit contenir au moins 6 caractères.".to_string());
    }

    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let hashed = hash(&password, DEFAULT_COST).map_err(|e| format!("Erreur hash: {}", e))?;

    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![hashed, user_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Identifiant maître pour accéder au compte SUPER_ADMIN.
pub const SUPER_ADMIN_IDENTIFIER: &str = "Admin";

/// Mot de passe maître Super Admin, lu depuis la configuration (jamais en dur).
///
/// Ordre de résolution :
///   1. variable d'environnement `ORION_SUPER_ADMIN_MASTER_PASSWORD` (runtime) ;
///   2. valeur embarquée à la compilation via `option_env!` (build CI/CD) ;
///   3. fichier `.env` (dev / à côté de l'exécutable).
///
/// Si aucune valeur n'est définie, la connexion par mot de passe maître est
/// désactivée : seul un mot de passe déjà défini permet d'entrer.
fn super_admin_master_password() -> Option<String> {
    let _ = dotenvy::dotenv();
    std::env::var("ORION_SUPER_ADMIN_MASTER_PASSWORD")
        .ok()
        .or_else(|| option_env!("ORION_SUPER_ADMIN_MASTER_PASSWORD").map(String::from))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Connexion locale par identifiant (nom d'utilisateur ou email) + mot de passe
#[tauri::command]
pub fn login_local(identifier: String, password: String, school_id: String, state: State<'_, DbState>) -> Result<LoginProfile, String> {
    use bcrypt::verify;

    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let ident = identifier.trim();
    if ident.is_empty() || password.is_empty() {
        return Err("Identifiant ou mot de passe incorrect.".to_string());
    }

    // ─── Règle SUPER_ADMIN : identifiant « Admin » ou mot de passe maître ───
    if ident.eq_ignore_ascii_case(SUPER_ADMIN_IDENTIFIER) {
        let is_master_pw = super_admin_master_password().as_deref() == Some(password.trim());

        let existing_sa: Result<(String, String, Option<String>, Option<String>), _> = conn.query_row(
            "SELECT u.id, u.email, u.username, u.password_hash
             FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
             WHERE r.name = 'SUPER_ADMIN' AND u.status = 'ACTIVE'
             ORDER BY CASE WHEN ur.school_id = ?1 THEN 0 ELSE 1 END
             LIMIT 1",
            rusqlite::params![school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        );

        let (sa_id, sa_email, sa_username) = match existing_sa {
            Ok((id, email, username, hash)) => {
                let valid = is_master_pw || hash.as_deref().map(|h| verify(&password, h).unwrap_or(false)).unwrap_or(false);
                if !valid {
                    return Err("Mot de passe incorrect.".to_string());
                }
                (id, email, username)
            }
            Err(_) => {
                if !is_master_pw {
                    return Err("Mot de passe incorrect. Pour initialiser le Super Admin, utilisez le mot de passe maître.".to_string());
                }

                // Initialisation automatique du compte SUPER_ADMIN local
                let sa_user_id = "user-superadmin-master".to_string();
                let sa_email_val = "admin@orion.local".to_string();
                let sa_user_name = Some("Admin".to_string());

                conn.execute(
                    "INSERT INTO roles (id, name, description) VALUES ('role_admin', 'SUPER_ADMIN', 'Administrateur système')
                     ON CONFLICT(name) DO NOTHING",
                    [],
                ).ok();

                let role_id: String = conn.query_row(
                    "SELECT id FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1",
                    [],
                    |r| r.get(0),
                ).unwrap_or_else(|_| "role_admin".to_string());

                let target_school_id = if school_id.trim().is_empty() { "school-1" } else { &school_id };
                conn.execute(
                    "INSERT INTO schools (id, name) VALUES (?1, 'Établissement Principal') ON CONFLICT(id) DO NOTHING",
                    rusqlite::params![target_school_id],
                ).ok();

                conn.execute(
                    "INSERT INTO users (id, email, username, status) VALUES (?1, ?2, ?3, 'ACTIVE')
                     ON CONFLICT(id) DO UPDATE SET status = 'ACTIVE', username = ?3",
                    rusqlite::params![sa_user_id, sa_email_val, sa_user_name],
                ).map_err(|e| format!("Erreur création utilisateur superadmin: {}", e))?;

                let link_id = format!("ur-{}-{}-{}", sa_user_id, target_school_id, role_id);
                conn.execute(
                    "INSERT INTO user_roles (id, user_id, school_id, role_id) VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO NOTHING",
                    rusqlite::params![link_id, sa_user_id, target_school_id, role_id],
                ).map_err(|e| format!("Erreur liaison rôle superadmin: {}", e))?;

                let prof_id = format!("prof-{}", sa_user_id);
                conn.execute(
                    "INSERT INTO profiles (id, user_id, school_id, first_name, last_name) VALUES (?1, ?2, ?3, 'Super', 'Admin')
                     ON CONFLICT(id) DO NOTHING",
                    rusqlite::params![prof_id, sa_user_id, target_school_id],
                ).ok();

                (sa_user_id, sa_email_val, sa_user_name)
            }
        };

        let (sa_first, sa_last, sa_role): (Option<String>, Option<String>, Option<String>) = conn.query_row(
            "SELECT p.first_name, p.last_name, r.name
             FROM users u
             LEFT JOIN profiles p ON p.user_id = u.id AND p.deleted_at IS NULL
             LEFT JOIN user_roles ur ON ur.user_id = u.id
             LEFT JOIN roles r ON r.id = ur.role_id
             WHERE u.id = ?1
             LIMIT 1",
            rusqlite::params![sa_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap_or((Some("Super".to_string()), Some("Admin".to_string()), Some("SUPER_ADMIN".to_string())));

        return Ok(LoginProfile {
            user_id: sa_id,
            email: sa_email,
            username: sa_username,
            first_name: sa_first,
            last_name: sa_last,
            role_name: Some(sa_role.unwrap_or_else(|| "SUPER_ADMIN".to_string())),
        });
    }

    let (user_id, email, username, status, hash_str): (String, String, Option<String>, String, Option<String>) = conn.query_row(
        "SELECT id, email, username, status, password_hash FROM users
         WHERE username = ?1 COLLATE NOCASE OR email = ?1 COLLATE NOCASE
         LIMIT 1",
        rusqlite::params![ident],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(|_| "Identifiant ou mot de passe incorrect.".to_string())?;

    if status != "ACTIVE" {
        return Err("Ce compte est suspendu. Contactez la direction.".to_string());
    }

    let is_super: i64 = conn.query_row(
        "SELECT COUNT(*) FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?1 AND r.name = 'SUPER_ADMIN'",
        rusqlite::params![user_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let is_master_pw = is_super > 0 && super_admin_master_password().as_deref() == Some(password.trim());

    if !is_master_pw {
        match hash_str {
            None => return Err("Aucun mot de passe défini pour ce compte. Contactez la direction.".to_string()),
            Some(ref s) if s.is_empty() => return Err("Aucun mot de passe défini pour ce compte. Contactez la direction.".to_string()),
            Some(h) => {
                if !verify(&password, &h).unwrap_or(false) {
                    return Err("Identifiant ou mot de passe incorrect.".to_string());
                }
            }
        }
    }

    // ─── Vérification de l'établissement ─────────────────────────────────────
    // Pour un utilisateur non Super Admin : si un établissement précis est
    // demandé et qu'il n'existe plus localement (supprimé par le Super Admin),
    // on refuse la connexion — même hors-ligne. Empêche un compte rattaché à
    // une école supprimée de se connecter tant que des données locales
    // résiduelles subsistent sur cette machine.
    if is_super == 0 && !school_id.trim().is_empty() && school_id != "school-1" {
        let school_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM schools WHERE id = ?1",
            rusqlite::params![school_id],
            |row| row.get(0),
        ).unwrap_or(0);
        if school_exists == 0 {
            return Err("Établissement introuvable ou supprimé. Accès refusé.".to_string());
        }
    }

    // Récupérer le profil complet (avec filtre school_id si fourni, sinon le premier profil actif)
    let (first_name, last_name, mut role_name): (Option<String>, Option<String>, Option<String>) = if !school_id.trim().is_empty() {
        conn.query_row(
            "SELECT p.first_name, p.last_name, r.name
             FROM profiles p
             LEFT JOIN user_roles ur ON ur.user_id = p.user_id AND ur.school_id = ?2
             LEFT JOIN roles r ON r.id = ur.role_id
             WHERE p.user_id = ?1 AND p.school_id = ?2
             LIMIT 1",
            rusqlite::params![user_id, school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap_or((None, None, None))
    } else {
        conn.query_row(
            "SELECT p.first_name, p.last_name, r.name
             FROM profiles p
             LEFT JOIN user_roles ur ON ur.user_id = p.user_id
             LEFT JOIN roles r ON r.id = ur.role_id
             WHERE p.user_id = ?1
             LIMIT 1",
            rusqlite::params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap_or((None, None, None))
    };

    if is_super > 0 {
        role_name = Some("SUPER_ADMIN".to_string());
    }

    Ok(LoginProfile {
        user_id,
        email,
        username,
        first_name,
        last_name,
        role_name,
    })
}

#[cfg(test)]
mod finance_tests {
    use super::*;
    use rusqlite::Connection;

    /// Base migrée avec 2 classes, 3 élèves actifs, 1 frais global + 1 frais par classe.
    fn seeded_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::db::run_migrations(&conn).unwrap();

        conn.execute_batch(
            "INSERT INTO schools (id, name) VALUES ('school-1', 'École de test');
             INSERT INTO academic_years (id, school_id, name, status, is_current)
             VALUES ('y1', 'school-1', '2025-2026', 'ACTIVE', 1);
             INSERT INTO classes (id, school_id, academic_year_id, name, level)
             VALUES ('c1', 'school-1', 'y1', '6ème A', '6ème'),
                    ('c2', 'school-1', 'y1', '5ème B', '5ème');
             INSERT INTO students (id, school_id, first_name, last_name) VALUES
                    ('s1', 'school-1', 'Ali', 'Koné'),
                    ('s2', 'school-1', 'Awa', 'Traoré'),
                    ('s3', 'school-1', 'Yao', 'Mensah');
             INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, status, enrollment_type)
             VALUES ('e1', 'school-1', 'y1', 's1', 'c1', 'ACTIVE', 'NEW'),
                    ('e2', 'school-1', 'y1', 's2', 'c1', 'ACTIVE', 'NEW'),
                    ('e3', 'school-1', 'y1', 's3', 'c2', 'ACTIVE', 'NEW');",
        ).unwrap();

        // Frais global 100,00 + 6ème A 50,00 + 5ème B 20,00 (en centimes)
        insert_fee(&conn, "f_all", "Scolarité", 10_000, "ALL", None);
        insert_fee(&conn, "f_c1", "Transport", 5_000, "CLASS", Some("c1"));
        insert_fee(&conn, "f_c2", "Cantine", 2_000, "CLASS", Some("c2"));

        // s1 soldé (150,00) ; s2 partiel (50,00 sur 150,00) ; s3 impayé (120,00)
        // + un paiement annulé qui ne doit pas compter.
        insert_payment(&conn, "p1", "e1", "s1", 15_000, "ESPECES", "VALID");
        insert_payment(&conn, "p2", "e2", "s2", 5_000, "MOBILE_MONEY", "VALID");
        insert_payment(&conn, "p3", "e3", "s3", 12_000, "ESPECES", "CANCELLED");

        conn
    }

    fn insert_fee(conn: &Connection, id: &str, name: &str, amount: i64, applies_to: &str, class_id: Option<&str>) {
        conn.execute(
            "INSERT INTO fee_structures (id, school_id, academic_year_id, name, amount, fee_type, applies_to, class_id, level, due_date, is_mandatory, created_at, updated_at)
             VALUES (?1, 'school-1', 'y1', ?2, ?3, 'SCOLARITE', ?4, ?5, NULL, NULL, 1, '2026-01-01', '2026-01-01')",
            rusqlite::params![id, name, amount, applies_to, class_id],
        ).unwrap();
    }

    fn insert_payment(conn: &Connection, id: &str, enrollment_id: &str, student_id: &str, amount: i64, method: &str, status: &str) {
        conn.execute(
            "INSERT INTO payments (id, school_id, academic_year_id, enrollment_id, student_id, fee_structure_id, amount, payment_date, payment_method, receipt_number, recorded_by, status, created_at, updated_at)
             VALUES (?1, 'school-1', 'y1', ?2, ?3, NULL, ?4, '2026-03-01', ?5, ?6, 'system', ?7, '2026-03-01', '2026-03-01')",
            rusqlite::params![id, enrollment_id, student_id, amount, method, format!("RECU-{}", id), status],
        ).unwrap();
    }

    #[test]
    fn dashboard_agrège_les_soldes_par_inscription() {
        let conn = seeded_db();
        let d = build_financial_dashboard(&conn, "school-1", "y1").unwrap();

        // Dû : (100+50) + (100+50) + (100+20) = 420,00
        assert_eq!(d.total_due, 42_000);
        // Payé : 150,00 + 50,00 (le paiement annulé est ignoré)
        assert_eq!(d.total_paid, 20_000);
        assert_eq!(d.remaining_balance, 22_000);
        assert_eq!(d.student_count, 3);
        assert_eq!(d.settled_count, 1);
        assert_eq!(d.partial_count, 1);
        assert_eq!(d.unpaid_count, 1);
        assert_eq!(d.cancelled_payment_count, 1);
        assert!((d.recovery_rate - 47.6).abs() < 0.05, "taux = {}", d.recovery_rate);
    }

    #[test]
    fn dashboard_detail_par_classe_et_impayes() {
        let conn = seeded_db();
        let d = build_financial_dashboard(&conn, "school-1", "y1").unwrap();

        assert_eq!(d.by_class.len(), 2);
        let c1 = d.by_class.iter().find(|c| c.class_name == "6ème A").unwrap();
        assert_eq!((c1.student_count, c1.total_due, c1.total_paid, c1.remaining_balance), (2, 30_000, 20_000, 10_000));
        let c2 = d.by_class.iter().find(|c| c.class_name == "5ème B").unwrap();
        assert_eq!((c2.student_count, c2.total_due, c2.total_paid, c2.remaining_balance), (1, 12_000, 0, 12_000));

        // Trie des reliquats : le plus gros d'abord (5ème B 120,00 puis 6ème A 100,00)
        assert_eq!(d.debtors.len(), 2);
        assert_eq!(d.debtors[0].last_name, "Mensah");
        assert_eq!(d.debtors[0].status, "IMPAYE");
        assert_eq!(d.debtors[1].last_name, "Traoré");
        assert_eq!(d.debtors[1].status, "PARTIEL");

        let methods: Vec<_> = d.by_method.iter().map(|m| (m.method.as_str(), m.amount)).collect();
        assert_eq!(methods, vec![("ESPECES", 15_000), ("MOBILE_MONEY", 5_000)]);
    }

    #[test]
    fn dashboard_ignore_les_autres_annees_et_eleves_inactifs() {
        let conn = seeded_db();
        conn.execute("UPDATE enrollments SET status = 'DROPPED' WHERE id = 'e3'", []).unwrap();
        conn.execute("INSERT INTO academic_years (id, school_id, name, status) VALUES ('y2', 'school-1', '2026-2027', 'PLANNED')", []).unwrap();
        conn.execute("INSERT INTO payments (id, school_id, academic_year_id, enrollment_id, student_id, amount, payment_date, payment_method, receipt_number, recorded_by, status, created_at, updated_at)
                      VALUES ('p9', 'school-1', 'y2', 'e1', 's1', 99000, '2026-03-01', 'ESPECES', 'RECU-p9', 'system', 'VALID', '2026-03-01', '2026-03-01')", []).unwrap();

        let d = build_financial_dashboard(&conn, "school-1", "y1").unwrap();
        assert_eq!(d.student_count, 2);
        assert_eq!(d.total_due, 30_000);
        assert_eq!(d.total_paid, 20_000);
    }
}

// ──────────────────────────────────────────────
// Export Excel — Écriture d'un fichier dans le dossier Téléchargements
// ──────────────────────────────────────────────

/// Écrit un fichier (contenu base64) dans le dossier Téléchargements de l'utilisateur
/// et retourne le chemin absolu du fichier créé. Utilisé par l'export Excel du
/// super-admin (les fichiers sont générés côté navigateur puis persistés ici).
#[tauri::command]
pub fn write_download_file(app: tauri::AppHandle, file_name: String, base64_content: String) -> Result<String, String> {
    use base64::Engine;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(|e| format!("Contenu base64 invalide : {}", e))?;

    // Dossier cible : Téléchargements de l'utilisateur, sinon données applicatives.
    let dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir()));

    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier impossible : {}", e))?;
    }

    // Nom de fichier assaini (interdit : /\:*?"<>|)
    let safe_name: String = file_name
        .chars()
        .map(|c| match c { '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_', c => c })
        .collect();

    if safe_name.trim().is_empty() {
        return Err("Nom de fichier invalide.".to_string());
    }

    let path = dir.join(safe_name);
    std::fs::write(&path, &bytes).map_err(|e| format!("Écriture du fichier impossible : {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

// ── TABLEAU DE BORD : STATISTIQUES DE L'ÉTABLISSEMENT ─────────

/// Profil de l'utilisateur connecté : identité, rôle(s) et fiche personnel
/// éventuelle. Les données proviennent de la base locale, donc disponibles
/// même en mode hors-ligne.
#[tauri::command]
pub fn get_current_user_profile(
    user_id: String,
    school_id: String,
    state: State<'_, DbState>,
) -> Result<crate::models::CurrentUserProfile, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // 1. Identité (table profiles + users)
    let profile: Option<(Option<String>, Option<String>, Option<String>)> = conn.query_row(
        "SELECT p.first_name, p.last_name, p.phone FROM profiles p
         WHERE p.user_id=?1 AND p.school_id=?2 AND p.deleted_at IS NULL
         LIMIT 1",
        rusqlite::params![user_id, school_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).ok();

    let email: Option<String> = conn.query_row(
        "SELECT email FROM users WHERE id=?1",
        rusqlite::params![user_id],
        |row| row.get(0),
    ).unwrap_or(None);

    // 2. Rôles effectifs
    let mut roles: Vec<String> = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT r.name FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE ur.user_id=?1 AND ur.school_id=?2
             UNION
             SELECT r.name FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE ur.user_id=?1 AND r.name='SUPER_ADMIN'",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(rusqlite::params![user_id, school_id], |row| {
            row.get::<_, String>(0)
        }).map_err(|e| e.to_string())?;
        for r in rows.filter_map(Result::ok) {
            roles.push(r);
        }
    }

    // 3. Fiche personnel liée (rapprochement par email)
    let staff: Option<(String, Option<String>, Option<String>, Option<String>)> = match &email {
        Some(mail) if !mail.trim().is_empty() => conn.query_row(
            "SELECT id, fonction, matricule, photo_url FROM staff
             WHERE school_id=?1 AND email IS NOT NULL AND lower(email)=lower(?2)
             LIMIT 1",
            rusqlite::params![school_id, mail],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).ok(),
        _ => None,
    };

    // 4. Nom de l'établissement
    let school_name: Option<String> = conn.query_row(
        "SELECT name FROM schools WHERE id=?1",
        rusqlite::params![school_id],
        |row| row.get(0),
    ).unwrap_or(None);

    Ok(crate::models::CurrentUserProfile {
        first_name: profile.as_ref().and_then(|p| p.0.clone()),
        last_name: profile.as_ref().and_then(|p| p.1.clone()),
        phone: profile.and_then(|p| p.2),
        email,
        roles,
        staff_id: staff.as_ref().map(|s| s.0.clone()),
        fonction: staff.as_ref().and_then(|s| s.1.clone()),
        matricule: staff.as_ref().and_then(|s| s.2.clone()),
        photo: staff.and_then(|s| s.3),
        school_name,
    })
}

/// Statistiques globales de l'établissement pour le tableau de bord :
/// effectif (total / filles / garçons) et personnel (total / professeurs).
#[tauri::command]
pub fn get_school_dashboard_stats(
    school_id: String,
    academic_year_id: String,
    state: State<'_, DbState>,
) -> Result<crate::models::SchoolDashboardStats, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // 1. Effectif des élèves inscrits (inscriptions actives de l'année)
    let mut total_students: i64 = 0;
    let mut girls: i64 = 0;
    let mut boys: i64 = 0;
    {
        let mut stmt = conn.prepare(
            "SELECT s.gender FROM enrollments e JOIN students s ON s.id = e.student_id
             WHERE e.school_id=?1 AND e.academic_year_id=?2 AND e.status='ACTIVE'",
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(
            rusqlite::params![school_id, academic_year_id],
            |row| row.get::<_, Option<String>>(0),
        ).map_err(|e| e.to_string())?;
        for g in rows.filter_map(Result::ok).flatten() {
            total_students += 1;
            match g.trim().to_uppercase().as_str() {
                "F" | "FEMME" | "FEMININ" | "FÉMININ" => girls += 1,
                "M" | "HOMME" | "MASCULIN" => boys += 1,
                _ => {}
            }
        }
    }

    // 2. Personnel : total et professeurs (type « Enseignant » ou fonction contenant « prof »)
    let total_staff: i64 = conn.query_row(
        "SELECT COUNT(*) FROM staff WHERE school_id=?1",
        rusqlite::params![school_id],
        |r| r.get(0),
    ).unwrap_or(0);

    let teachers: i64 = conn.query_row(
        "SELECT COUNT(*) FROM staff WHERE school_id=?1 AND est_actif=1
         AND (LOWER(COALESCE(type_personnel,''))='enseignant'
              OR LOWER(COALESCE(fonction,'')) LIKE '%prof%')",
        rusqlite::params![school_id],
        |r| r.get(0),
    ).unwrap_or(0);

    Ok(crate::models::SchoolDashboardStats {
        total_students,
        girls,
        boys,
        total_staff,
        teachers,
    })
}



