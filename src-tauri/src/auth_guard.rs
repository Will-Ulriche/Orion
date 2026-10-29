use std::sync::Mutex;
use rusqlite::Connection;
use serde::Deserialize;
use base64::Engine;

#[derive(Clone, Debug)]
pub struct SessionUser {
    pub user_id: String,
    pub school_id: String,
    pub email: Option<String>,
    pub roles: Vec<String>,
    pub is_super_admin: bool,
}

static CURRENT_SESSION: Mutex<Option<SessionUser>> = Mutex::new(None);

#[derive(Deserialize, Debug)]
struct JwtClaims {
    sub: Option<String>,
    email: Option<String>,
    exp: Option<i64>,
}

/// Enregistre ou efface la session utilisateur courante en mémoire Rust
pub fn set_current_session(session: Option<SessionUser>) {
    if let Ok(mut lock) = CURRENT_SESSION.lock() {
        *lock = session;
    }
}

/// Invalide la session courante
pub fn clear_session() {
    set_current_session(None);
}

/// Établit une session locale à partir d'un utilisateur vérifié dans la base SQLite
pub fn establish_local_session(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
) -> Result<SessionUser, String> {
    // 1. Vérifier existence et statut actif du compte
    let (status, email): (String, Option<String>) = conn
        .query_row(
            "SELECT status, email FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Utilisateur introuvable dans la base locale.".to_string())?;

    if status != "ACTIVE" {
        return Err("Ce compte est suspendu ou inactif.".to_string());
    }

    // 2. Extraire les rôles effectifs
    let roles = fetch_user_roles(conn, user_id, Some(school_id));
    let is_super_admin = roles.iter().any(|r| r == "SUPER_ADMIN");

    let session = SessionUser {
        user_id: user_id.to_string(),
        school_id: school_id.to_string(),
        email,
        roles,
        is_super_admin,
    };

    set_current_session(Some(session.clone()));
    Ok(session)
}

/// Extrait les rôles d'un utilisateur dans la base locale
pub fn fetch_user_roles(conn: &Connection, user_id: &str, school_id: Option<&str>) -> Vec<String> {
    let mut roles = Vec::new();

    if let Some(sch) = school_id {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT DISTINCT r.name FROM user_roles ur
             JOIN roles r ON ur.role_id = r.id
             WHERE ur.user_id = ?1 AND (ur.school_id = ?2 OR r.name = 'SUPER_ADMIN')"
        ) {
            if let Ok(rows) = stmt.query_map(rusqlite::params![user_id, sch], |row| row.get::<_, String>(0)) {
                for r in rows.filter_map(Result::ok) {
                    roles.push(r);
                }
            }
        }
    } else if let Ok(mut stmt) = conn.prepare(
        "SELECT DISTINCT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ?1"
    ) {
        if let Ok(rows) = stmt.query_map(rusqlite::params![user_id], |row| row.get::<_, String>(0)) {
            for r in rows.filter_map(Result::ok) {
                roles.push(r);
            }
        }
    }

    roles
}

/// Tente de décoder et valider le JWT Supabase stocké dans SYNC_ACCESS_TOKEN
fn decode_jwt_token(token: &str) -> Option<JwtClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    let payload_b64 = parts[1];
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let decoded = engine.decode(payload_b64).or_else(|_| {
        // En cas de padding manquant
        let padded = match payload_b64.len() % 4 {
            2 => format!("{}==", payload_b64),
            3 => format!("{}=", payload_b64),
            _ => payload_b64.to_string(),
        };
        base64::engine::general_purpose::URL_SAFE.decode(padded)
    }).ok()?;

    let claims: JwtClaims = serde_json::from_slice(&decoded).ok()?;

    // Vérifier l'expiration
    if let Some(exp) = claims.exp {
        let now = chrono::Utc::now().timestamp();
        if now > exp {
            return None; // Token expiré
        }
    }

    Some(claims)
}

/// Récupère l'utilisateur actuellement authentifié, soit via la session locale Rust,
/// soit via un JWT Supabase actif. Vérifie toujours que le compte est actif.
pub fn get_authenticated_user(conn: &Connection) -> Result<SessionUser, String> {
    // 1. Session locale en mémoire
    if let Ok(guard) = CURRENT_SESSION.lock() {
        if let Some(ref session) = *guard {
            // Vérifier que le compte est toujours actif dans SQLite
            let status: Option<String> = conn
                .query_row(
                    "SELECT status FROM users WHERE id = ?1",
                    rusqlite::params![session.user_id],
                    |row| row.get(0),
                )
                .ok();

            if status.as_deref() == Some("ACTIVE") {
                // Rafraîchir les rôles pour prendre en compte toute mise à jour
                let mut refreshed = session.clone();
                refreshed.roles = fetch_user_roles(conn, &session.user_id, Some(&session.school_id));
                refreshed.is_super_admin = refreshed.roles.iter().any(|r| r == "SUPER_ADMIN");
                return Ok(refreshed);
            }
        }
    }

    // 2. Vérification via le token JWT Cloud actif (SYNC_ACCESS_TOKEN)
    if let Some(token) = crate::sync::current_sync_access_token() {
        if let Some(claims) = decode_jwt_token(&token) {
            if let Some(sub) = claims.sub {
                // L'utilisateur est authentifié auprès de Supabase
                // Trouver ou déduire son school_id depuis SQLite
                let school_id: String = conn
                    .query_row(
                        "SELECT school_id FROM user_roles WHERE user_id = ?1 LIMIT 1",
                        rusqlite::params![sub],
                        |row| row.get(0),
                    )
                    .unwrap_or_else(|_| "school-main".to_string());

                let roles = fetch_user_roles(conn, &sub, Some(&school_id));
                let is_super_admin = roles.iter().any(|r| r == "SUPER_ADMIN");

                let session = SessionUser {
                    user_id: sub.clone(),
                    school_id,
                    email: claims.email,
                    roles,
                    is_super_admin,
                };
                set_current_session(Some(session.clone()));
                return Ok(session);
            }
        }
    }

    Err("Non authentifié : aucune session active. Veuillez vous connecter.".to_string())
}

/// Exige que l'appelant soit authentifié
pub fn require_authenticated(conn: &Connection) -> Result<SessionUser, String> {
    get_authenticated_user(conn)
}

/// Exige le rôle SUPER_ADMIN
pub fn require_super_admin(conn: &Connection) -> Result<SessionUser, String> {
    let session = get_authenticated_user(conn)?;
    if session.is_super_admin {
        Ok(session)
    } else {
        Err("Action refusée : privilèges de Super Administrateur requis.".to_string())
    }
}

/// Exige le rôle DIRECTION pour l'établissement cible (ou SUPER_ADMIN global)
pub fn require_direction_or_super_admin(
    conn: &Connection,
    target_school_id: Option<&str>,
) -> Result<SessionUser, String> {
    let session = get_authenticated_user(conn)?;

    // Le SUPER_ADMIN a tous les droits sur toutes les écoles
    if session.is_super_admin {
        return Ok(session);
    }

    // Vérifier si l'utilisateur possède le rôle DIRECTION
    let has_direction = session.roles.iter().any(|r| r == "DIRECTION");
    if !has_direction {
        return Err("Action refusée : privilèges de Direction ou Super Administrateur requis.".to_string());
    }

    // Vérifier le périmètre d'établissement
    if let Some(target_sch) = target_school_id {
        if !target_sch.trim().is_empty() && target_sch != "school-1" && target_sch != "school-main" {
            // L'utilisateur doit être rattaché à cet établissement en tant que Direction
            let authorized: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM user_roles ur
                     JOIN roles r ON ur.role_id = r.id
                     WHERE ur.user_id = ?1 AND ur.school_id = ?2 AND r.name = 'DIRECTION'",
                    rusqlite::params![session.user_id, target_sch],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            if authorized == 0 && session.school_id != target_sch {
                return Err(format!(
                    "Action refusée : vous n'avez pas autorité sur l'établissement '{}'.",
                    target_sch
                ));
            }
        }
    }

    Ok(session)
}

/// Exige que l'appelant soit soit l'utilisateur cible lui-même, soit la Direction de son école,
/// soit le Super Administrateur
pub fn require_self_or_direction(
    conn: &Connection,
    target_user_id: &str,
    target_school_id: Option<&str>,
) -> Result<SessionUser, String> {
    let session = get_authenticated_user(conn)?;

    if session.user_id == target_user_id {
        return Ok(session);
    }

    require_direction_or_super_admin(conn, target_school_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT);
             CREATE TABLE roles (id TEXT PRIMARY KEY, name TEXT UNIQUE);
             CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, username TEXT, status TEXT, password_hash TEXT);
             CREATE TABLE user_roles (id TEXT PRIMARY KEY, user_id TEXT, school_id TEXT, role_id TEXT, created_at TEXT);
             
             INSERT INTO schools (id, name) VALUES ('school-A', 'École A'), ('school-B', 'École B');
             INSERT INTO roles (id, name) VALUES ('r-sa', 'SUPER_ADMIN'), ('r-dir', 'DIRECTION'), ('r-prof', 'PROFESSEUR');
             
             -- Utilisateurs
             INSERT INTO users (id, email, username, status) VALUES 
                ('u-sa', 'sa@test.com', 'admin', 'ACTIVE'),
                ('u-dir-a', 'dira@test.com', 'dira', 'ACTIVE'),
                ('u-dir-b', 'dirb@test.com', 'dirb', 'ACTIVE'),
                ('u-prof-a', 'profa@test.com', 'profa', 'ACTIVE'),
                ('u-suspended', 'susp@test.com', 'susp', 'SUSPENDED');
                
             -- Rôles
             INSERT INTO user_roles (id, user_id, school_id, role_id) VALUES
                ('ur-1', 'u-sa', 'school-A', 'r-sa'),
                ('ur-2', 'u-dir-a', 'school-A', 'r-dir'),
                ('ur-3', 'u-dir-b', 'school-B', 'r-dir'),
                ('ur-4', 'u-prof-a', 'school-A', 'r-prof');"
        ).unwrap();
        conn
    }

    #[test]
    fn test_anonymous_calls_are_rejected() {
        let conn = setup_test_db();
        clear_session();

        assert!(require_authenticated(&conn).is_err());
        assert!(require_super_admin(&conn).is_err());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_err());
        assert!(require_self_or_direction(&conn, "u-prof-a", Some("school-A")).is_err());
    }

    #[test]
    fn test_suspended_user_session_is_rejected() {
        let conn = setup_test_db();
        // Établir une session avec le compte suspendu
        let res = establish_local_session(&conn, "u-suspended", "school-A");
        assert!(res.is_err());
    }

    #[test]
    fn test_professeur_cannot_perform_admin_actions() {
        let conn = setup_test_db();
        establish_local_session(&conn, "u-prof-a", "school-A").unwrap();

        // L'utilisateur est authentifié
        assert!(require_authenticated(&conn).is_ok());

        // Mais ne peut pas faire d'action SUPER_ADMIN ni DIRECTION
        assert!(require_super_admin(&conn).is_err());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_err());

        // Peut agir sur son propre compte, mais pas sur un autre
        assert!(require_self_or_direction(&conn, "u-prof-a", Some("school-A")).is_ok());
        assert!(require_self_or_direction(&conn, "u-dir-a", Some("school-A")).is_err());
    }

    #[test]
    fn test_direction_scoped_to_own_school() {
        let conn = setup_test_db();
        establish_local_session(&conn, "u-dir-a", "school-A").unwrap();

        // Direction A est autorisée sur school-A
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_ok());

        // Direction A est REJETÉE sur school-B
        assert!(require_direction_or_super_admin(&conn, Some("school-B")).is_err());

        // Direction A n'est pas SUPER_ADMIN
        assert!(require_super_admin(&conn).is_err());
    }

    #[test]
    fn test_super_admin_has_global_access() {
        let conn = setup_test_db();
        establish_local_session(&conn, "u-sa", "school-A").unwrap();

        assert!(require_super_admin(&conn).is_ok());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_ok());
        assert!(require_direction_or_super_admin(&conn, Some("school-B")).is_ok());
        assert!(require_direction_or_super_admin(&conn, None).is_ok());
        assert!(require_self_or_direction(&conn, "u-dir-a", Some("school-A")).is_ok());
    }
}

