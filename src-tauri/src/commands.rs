use tauri::State;
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
    
    let mutation_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pending_mutations (id, entity_type, entity_id, operation, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![mutation_id, "school", "school-1", "UPSERT", &payload]
    ).map_err(|e| format!("Erreur SQLite: {}", e))?;
    
    // On enregistre également cette action sensible dans l'audit
    // Dans une version plus avancée, on récupérait l'ID de l'utilisateur actif
    conn.execute(
        "INSERT INTO audit_logs (user_id, action, entity, details) VALUES (?1, ?2, ?3, ?4)",
        ["current_user", "UPDATE_SETTINGS", "schools", &payload]
    ).unwrap_or(0);

    Ok(())
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
    
    conn.execute(
        "UPDATE academic_years SET status = 'CLOSED', is_current = 0, closed_at = CURRENT_TIMESTAMP WHERE id = ?1 AND school_id = ?2",
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

#[tauri::command]
pub fn get_classes(school_id: String, academic_year_id: String, state: State<'_, DbState>) -> Result<Vec<Class>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, school_id, academic_year_id, name, level FROM classes WHERE school_id = ?1 AND academic_year_id = ?2 ORDER BY name ASC").map_err(|e| e.to_string())?;
    let classes_iter = stmt.query_map(rusqlite::params![school_id, academic_year_id], |row| {
        Ok(Class {
            id: row.get(0)?,
            school_id: row.get(1)?,
            academic_year_id: row.get(2)?,
            name: row.get(3)?,
            level: row.get(4)?,
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
    let id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO classes (id, school_id, academic_year_id, name, level) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, school_id, academic_year_id, name, level],
    ).map_err(|e| e.to_string())?;
    
    Ok(Class {
        id, school_id, academic_year_id, name, level
    })
}

// ──────────────────────────────────────────────
// COMMANDE : Élèves et Inscriptions
// ──────────────────────────────────────────────
#[tauri::command]
pub fn get_students(school_id: String, academic_year_id: String, class_id: Option<String>, state: State<'_, DbState>) -> Result<Vec<StudentEnrollment>, String> {
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let mut query = "
        SELECT e.id, e.student_id, e.class_id, e.enrollment_type, e.status, 
               s.first_name, s.last_name, c.name as class_name
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
            class_name: row.get(7)?,
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
    
    let class_name: Option<String> = if let Some(ref cid) = class_id {
        conn.query_row("SELECT name FROM classes WHERE id = ?1", rusqlite::params![cid], |row| row.get(0)).ok()
    } else {
        None
    };

    Ok(StudentEnrollment {
        id: enrollment_id,
        student_id,
        class_id,
        enrollment_type: "NEW".to_string(),
        status: "ACTIVE".to_string(),
        first_name: Some(first_name),
        last_name: Some(last_name),
        class_name,
    })
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
    let conn = state.0.lock().map_err(|_| "Impossible de verrouiller la base de données".to_string())?;
    
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM enrollments WHERE academic_year_id = ?1 AND student_id = ?2",
        rusqlite::params![target_academic_year_id, student_id],
        |row| row.get::<_, i64>(0)
    ).unwrap_or(0) > 0;

    if exists {
        return Err("Cet élève est déjà inscrit dans l'année cible.".to_string());
    }

    let enrollment_id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_type, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ACTIVE')",
        rusqlite::params![enrollment_id, school_id, target_academic_year_id, student_id, target_class_id, enrollment_type],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}
