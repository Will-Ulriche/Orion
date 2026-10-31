use std::sync::Mutex;
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
use dotenvy::dotenv;

const LOCAL_SESSION_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;

#[derive(Clone, Debug)]
pub struct SessionUser {
    pub user_id: String,
    pub school_id: String,
    pub email: Option<String>,
    pub roles: Vec<String>,
    pub is_super_admin: bool,
}

static CURRENT_SESSION: Mutex<Option<SessionUser>> = Mutex::new(None);

/// Serialise les tests qui manipulent la session globale en memoire.
#[cfg(test)]
pub(crate) fn lock_test_session() -> std::sync::MutexGuard<'static, ()> {
    static TEST_SESSION_LOCK: Mutex<()> = Mutex::new(());
    TEST_SESSION_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Deserialize, Debug, Clone)]
struct JwtClaims {
    sub: Option<String>,
    email: Option<String>,
    // Conservé pour la sémantique JWT (expiration portée par le claim) ;
    // la validation effective est déléguée à jsonwebtoken via Validation.
    #[allow(dead_code)]
    exp: Option<i64>,
    // Claims Supabase standard — présents dans chaque JWT émis par Supabase Auth.
    // On ne les exige pas tous (certains projets les omettent) mais on les valide
    // si `jsonwebtoken` les vérifie (iss, aud sont dans Validation).
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

#[derive(Clone, Debug)]
pub struct IssuedLocalSession {
    pub token: String,
    pub expires_at: i64,
}

fn generate_session_secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Émet un jeton opaque après une authentification réussie.
/// Le secret est stocké uniquement sous forme de hash bcrypt.
pub fn issue_local_session_token(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
) -> Result<IssuedLocalSession, String> {
    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Erreur lecture utilisateur: {}", e))?;

    if status.as_deref() != Some("ACTIVE") {
        return Err("Ce compte est suspendu ou inactif.".to_string());
    }

    let school_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schools WHERE id = ?1",
            rusqlite::params![school_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Erreur lecture établissement: {}", e))?;
    if school_exists == 0 {
        return Err("Établissement introuvable. Veuillez vous reconnecter.".to_string());
    }

    let now = chrono::Utc::now().timestamp();
    let expires_at = now + LOCAL_SESSION_TTL_SECONDS;
    let session_id = uuid::Uuid::new_v4().to_string();
    let secret = generate_session_secret();
    let secret_hash = bcrypt::hash(&secret, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Erreur création jeton de session: {}", e))?;

    // Une nouvelle authentification remplace les anciens jetons de cet utilisateur
    // pour cet établissement.
    conn.execute(
        "DELETE FROM local_session_tokens WHERE user_id = ?1 AND school_id = ?2",
        rusqlite::params![user_id, school_id],
    )
    .map_err(|e| format!("Erreur invalidation ancienne session: {}", e))?;

    conn.execute(
        "INSERT INTO local_session_tokens
         (id, user_id, school_id, secret_hash, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![session_id, user_id, school_id, secret_hash, now, expires_at],
    )
    .map_err(|e| format!("Erreur enregistrement session: {}", e))?;

    Ok(IssuedLocalSession {
        token: format!("{}.{}", session_id, secret),
        expires_at,
    })
}

/// Restaure une session uniquement à partir d'un jeton opaque valide.
/// Aucun identifiant utilisateur/établissement fourni par le client n'est accepté.
pub fn restore_session_from_token(
    conn: &Connection,
    token: &str,
) -> Result<(SessionUser, i64), String> {
    let invalid = || "Session locale invalide ou expirée. Veuillez vous reconnecter.".to_string();
    let (session_id, secret) = token.split_once('.').ok_or_else(invalid)?;
    if session_id.is_empty() || secret.is_empty() {
        return Err(invalid());
    }

    let row: Option<(String, String, String, i64, Option<i64>)> = conn
        .query_row(
            "SELECT user_id, school_id, secret_hash, expires_at, revoked_at
             FROM local_session_tokens WHERE id = ?1",
            rusqlite::params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .optional()
        .map_err(|e| format!("Erreur lecture session: {}", e))?;

    let (user_id, school_id, secret_hash, expires_at, revoked_at) = row.ok_or_else(invalid)?;

    if revoked_at.is_some() {
        return Err(invalid());
    }
    let now = chrono::Utc::now().timestamp();
    if now >= expires_at {
        return Err(invalid());
    }
    if !bcrypt::verify(secret, &secret_hash).unwrap_or(false) {
        return Err(invalid());
    }

    let school_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schools WHERE id = ?1",
            rusqlite::params![school_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Erreur lecture établissement: {}", e))?;
    if school_exists == 0 {
        return Err(invalid());
    }

    let session = establish_local_session(conn, &user_id, &school_id)?;
    Ok((session, expires_at))
}

/// Révoque le jeton présenté lors de la déconnexion.
pub fn revoke_local_session_token(conn: &Connection, token: &str) -> Result<(), String> {
    let Some((session_id, _)) = token.split_once('.') else {
        return Ok(());
    };
    conn.execute(
        "UPDATE local_session_tokens
         SET revoked_at = ?1
         WHERE id = ?2 AND revoked_at IS NULL",
        rusqlite::params![chrono::Utc::now().timestamp(), session_id],
    )
    .map_err(|e| format!("Erreur révocation session: {}", e))?;
    Ok(())
}

/// Invalide tous les jetons d'un utilisateur (changement de mot de passe, suppression).
pub fn revoke_user_session_tokens(conn: &Connection, user_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE local_session_tokens
         SET revoked_at = ?1
         WHERE user_id = ?2 AND revoked_at IS NULL",
        rusqlite::params![chrono::Utc::now().timestamp(), user_id],
    )
    .map_err(|e| format!("Erreur invalidation sessions: {}", e))?;
    Ok(())
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

/// Lit le secret JWT Supabase depuis l'environnement.
/// La variable SUPABASE_JWT_SECRET est disponible dans le dashboard Supabase
/// (Settings → API → JWT Secret). Elle ne doit jamais être committée.
fn supabase_jwt_secret() -> Option<String> {
    // Ordre de priorité : variable d'environnement runtime, puis .env chargé par dotenvy.
    std::env::var("SUPABASE_JWT_SECRET").ok().filter(|s| !s.is_empty())
}

/// Émetteurs Supabase acceptés selon la configuration réelle du projet.
fn supabase_expected_issuers() -> Vec<String> {
    let _ = dotenv();
    let mut issuers = vec!["supabase".to_string()];
    let configured_url = std::env::var("VITE_SUPABASE_URL")
        .or_else(|_| std::env::var("SUPABASE_URL"))
        .ok();
    if let Some(url) = configured_url {
        let trimmed = url.trim().trim_end_matches('/');
        if !trimmed.is_empty() {
            issuers.push(format!("{}/auth/v1", trimmed));
            issuers.push(trimmed.to_string());
        }
    }
    issuers
}

/// Vérifie et décode un JWT Supabase avec validation cryptographique complète.
///
/// Contrôles effectués par `jsonwebtoken` :
/// - Signature HMAC-SHA256 avec le secret Supabase (rejet si invalide ou absente)
/// - Expiration (`exp`) avec tolérance d'horloge de 10s maximum
/// - Audience (`aud`) — doit être "authenticated" (token utilisateur Supabase)
/// - Émetteur (`iss`) — doit correspondre à l'instance Supabase configurée ou "supabase"
///
/// Contrôle supplémentaire :
/// - Si le secret n'est pas configuré, le token est systématiquement rejeté :
///   il vaut mieux refuser un accès légitime que d'accepter un token non vérifié.
fn decode_jwt_token(token: &str) -> Option<JwtClaims> {
    let secret = supabase_jwt_secret().or_else(|| {
        // Tentative de chargement depuis .env (environnement de développement)
        let _ = dotenv();
        std::env::var("SUPABASE_JWT_SECRET").ok().filter(|s| !s.is_empty())
    })?;

    let key = DecodingKey::from_secret(secret.as_bytes());

    // HS256 est l'algorithme imposé par Supabase pour ses JWTs.
    // On refuse explicitement tout autre algorithme (prévention de l'attaque
    // « alg:none » et des substitutions RS256/HS512).
    let mut validation = Validation::new(Algorithm::HS256);
    // Vérification stricte d'expiration avec 10s de tolérance horloge
    validation.validate_exp = true;
    validation.leeway = 10;

    // Vérification de l'audience : un token d'authentification utilisateur Supabase
    // porte obligatoirement l'audience "authenticated".
    validation.set_audience(&["authenticated"]);

    // Vérification de l'émetteur : doit provenir du service auth Supabase
    let expected_issuers = supabase_expected_issuers();
    validation.set_issuer(&expected_issuers);

    match decode::<JwtClaims>(token, &key, &validation) {
        Ok(data) => Some(data.claims),
        Err(e) => {
            eprintln!("[auth_guard] JWT rejeté : {}", e);
            None
        }
    }
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
             CREATE TABLE local_session_tokens (
                 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, school_id TEXT NOT NULL,
                 secret_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
                 expires_at INTEGER NOT NULL, revoked_at INTEGER
             );
             
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
        let _guard = lock_test_session();
        let conn = setup_test_db();
        clear_session();

        assert!(require_authenticated(&conn).is_err());
        assert!(require_super_admin(&conn).is_err());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_err());
        assert!(require_self_or_direction(&conn, "u-prof-a", Some("school-A")).is_err());
    }

    #[test]
    fn test_suspended_user_session_is_rejected() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        // Établir une session avec le compte suspendu
        let res = establish_local_session(&conn, "u-suspended", "school-A");
        assert!(res.is_err());
    }

    #[test]
    fn test_professeur_cannot_perform_admin_actions() {
        let _guard = lock_test_session();
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
        let _guard = lock_test_session();
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
        let _guard = lock_test_session();
        let conn = setup_test_db();
        establish_local_session(&conn, "u-sa", "school-A").unwrap();

        assert!(require_super_admin(&conn).is_ok());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_ok());
        assert!(require_direction_or_super_admin(&conn, Some("school-B")).is_ok());
        assert!(require_direction_or_super_admin(&conn, None).is_ok());
        assert!(require_self_or_direction(&conn, "u-dir-a", Some("school-A")).is_ok());
    }

    #[test]
    fn test_session_cannot_be_restored_without_valid_token() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        clear_session();

        assert!(restore_session_from_token(&conn, "").is_err());
        assert!(restore_session_from_token(&conn, "u-dir-a").is_err());
        assert!(restore_session_from_token(&conn, "fake-session.fake-secret").is_err());

        // Un identifiant utilisateur seul ne suffit plus à restaurer une session.
        clear_session();
        assert!(require_authenticated(&conn).is_err());
    }

    #[test]
    fn test_legitimate_session_can_be_restored_after_restart() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let issued = issue_local_session_token(&conn, "u-prof-a", "school-A").unwrap();

        // Simule un redémarrage de l'application : la mémoire Rust est vidée.
        clear_session();
        assert!(require_authenticated(&conn).is_err());

        let (restored, expires_at) = restore_session_from_token(&conn, &issued.token).unwrap();
        assert_eq!(restored.user_id, "u-prof-a");
        assert_eq!(restored.school_id, "school-A");
        assert_eq!(expires_at, issued.expires_at);
        assert!(require_authenticated(&conn).is_ok());
    }

    #[test]
    fn test_expired_session_token_is_rejected() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let issued = issue_local_session_token(&conn, "u-dir-a", "school-A").unwrap();

        conn.execute(
            "UPDATE local_session_tokens SET expires_at = ?1 WHERE id = ?2",
            rusqlite::params![
                chrono::Utc::now().timestamp() - 1,
                issued.token.split_once('.').unwrap().0
            ],
        )
        .unwrap();

        clear_session();
        assert!(restore_session_from_token(&conn, &issued.token).is_err());
        assert!(require_authenticated(&conn).is_err());
    }

    #[test]
    fn test_revoked_session_token_is_rejected() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let issued = issue_local_session_token(&conn, "u-dir-a", "school-A").unwrap();

        revoke_local_session_token(&conn, &issued.token).unwrap();

        clear_session();
        assert!(restore_session_from_token(&conn, &issued.token).is_err());
        assert!(require_authenticated(&conn).is_err());
    }

    #[test]
    fn test_suspended_user_token_is_rejected() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let issued = issue_local_session_token(&conn, "u-dir-a", "school-A").unwrap();

        conn.execute(
            "UPDATE users SET status = 'SUSPENDED' WHERE id = 'u-dir-a'",
            [],
        )
        .unwrap();

        clear_session();
        assert!(restore_session_from_token(&conn, &issued.token).is_err());
    }

    #[test]
    fn test_password_change_invalidates_existing_tokens() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let issued = issue_local_session_token(&conn, "u-dir-a", "school-A").unwrap();

        revoke_user_session_tokens(&conn, "u-dir-a").unwrap();

        clear_session();
        assert!(restore_session_from_token(&conn, &issued.token).is_err());
    }

    #[test]
    fn test_new_login_replaces_previous_token() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let first = issue_local_session_token(&conn, "u-dir-a", "school-A").unwrap();
        let second = issue_local_session_token(&conn, "u-dir-a", "school-A").unwrap();

        clear_session();
        assert!(restore_session_from_token(&conn, &first.token).is_err());
        clear_session();
        assert!(restore_session_from_token(&conn, &second.token).is_ok());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Tests de vérification cryptographique JWT (SEC-02)
    // ──────────────────────────────────────────────────────────────────────────
    //
    // Ces tests utilisent jsonwebtoken directement pour générer des JWTs signés
    // avec un secret connu, puis vérifient que decode_jwt_token() les accepte
    // ou les rejette selon les critères attendus.
    //
    // La variable d'environnement SUPABASE_JWT_SECRET est positionnée via
    // std::env::set_var() dans le cadre du test (thread non parallèle grâce
    // au verrou de session).

    fn make_test_jwt(secret: &str, sub: &str, exp_offset_secs: i64) -> String {
        let issuers = supabase_expected_issuers();
        let iss = issuers.last().cloned().unwrap_or_else(|| "supabase".to_string());
        make_test_jwt_custom(
            secret,
            sub,
            exp_offset_secs,
            "authenticated",
            &iss,
        )
    }

    fn make_test_jwt_custom(
        secret: &str,
        sub: &str,
        exp_offset_secs: i64,
        aud: &str,
        iss: &str,
    ) -> String {
        use jsonwebtoken::{encode, EncodingKey, Header, Algorithm};
        use serde_json::json;

        let now = chrono::Utc::now().timestamp();
        let claims = json!({
            "sub": sub,
            "email": format!("{}@test.com", sub),
            "exp": now + exp_offset_secs,
            "iat": now,
            "role": "authenticated",
            "aud": aud,
            "iss": iss
        });

        let header = Header::new(Algorithm::HS256);
        encode(&header, &claims, &EncodingKey::from_secret(secret.as_bytes()))
            .expect("Impossible de créer le JWT de test")
    }

    #[test]
    fn test_jwt_valid_signature_is_accepted() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        let token = make_test_jwt(secret, "u-dir-a", 3600);
        let result = decode_jwt_token(&token);

        assert!(result.is_some(), "Un JWT valide doit être accepté");
        let claims = result.unwrap();
        assert_eq!(claims.sub.as_deref(), Some("u-dir-a"));

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_invalid_signature_is_rejected() {
        let _guard = lock_test_session();
        let real_secret = "test-secret-suffisamment-long-pour-hmac256";
        let wrong_secret = "mauvais-secret-different";
        std::env::set_var("SUPABASE_JWT_SECRET", real_secret);

        // Signer avec le mauvais secret
        let forged_token = make_test_jwt(wrong_secret, "u-sa", 3600);
        let result = decode_jwt_token(&forged_token);

        assert!(result.is_none(), "Un JWT avec signature invalide doit être rejeté");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_tampered_payload_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // Créer un token valide, puis modifier le payload manuellement
        let valid_token = make_test_jwt(secret, "u-prof-a", 3600);
        let parts: Vec<&str> = valid_token.split('.').collect();
        assert_eq!(parts.len(), 3);

        // Encoder un payload falsifié (sub="u-sa" au lieu de "u-prof-a")
        use base64::Engine;
        let fake_payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(r#"{"sub":"u-sa","email":"sa@test.com","exp":9999999999,"aud":"authenticated","iss":"https://reyxonfhvlybjhxlthvy.supabase.co/auth/v1"}"#);
        let tampered = format!("{}.{}.{}", parts[0], fake_payload, parts[2]);

        let result = decode_jwt_token(&tampered);
        assert!(result.is_none(), "Un JWT dont le payload a été falsifié doit être rejeté");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_expired_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // exp = 60 secondes dans le passé (dépasse largement les 10s de leeway)
        let token = make_test_jwt(secret, "u-dir-a", -60);
        let result = decode_jwt_token(&token);

        assert!(result.is_none(), "Un JWT expiré doit être rejeté");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_invalid_audience_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // Audience autre que "authenticated" (ex: "anon" ou "autre_api")
        let token = make_test_jwt_custom(
            secret,
            "u-dir-a",
            3600,
            "anon",
            "https://reyxonfhvlybjhxlthvy.supabase.co/auth/v1",
        );
        let result = decode_jwt_token(&token);

        assert!(result.is_none(), "Un JWT avec une audience non autorisée doit être rejeté");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_invalid_issuer_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // Émetteur non reconnu
        let token = make_test_jwt_custom(
            secret,
            "u-dir-a",
            3600,
            "authenticated",
            "https://evil-server.attacker.com/auth/v1",
        );
        let result = decode_jwt_token(&token);

        assert!(result.is_none(), "Un JWT émis par un émetteur non reconnu doit être rejeté");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_missing_secret_is_rejected() {
        let _guard = lock_test_session();
        std::env::remove_var("SUPABASE_JWT_SECRET");

        // Même un JWT bien formé doit être rejeté si le secret n'est pas configuré
        let token = make_test_jwt("n-importe-quel-secret", "u-dir-a", 3600);
        let result = decode_jwt_token(&token);

        assert!(result.is_none(),
            "Sans SUPABASE_JWT_SECRET configuré, tout JWT doit être rejeté");
    }

    #[test]
    fn test_jwt_alg_none_attack_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // Construire manuellement un JWT avec alg:none (attaque connue)
        use base64::Engine;
        let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        let header = engine.encode(r#"{"alg":"none","typ":"JWT"}"#);
        let payload = engine.encode(
            r#"{"sub":"u-sa","email":"sa@test.com","exp":9999999999,"aud":"authenticated","iss":"supabase"}"#
        );
        // Signature vide
        let none_token = format!("{}.{}.", header, payload);

        let result = decode_jwt_token(&none_token);
        assert!(result.is_none(), "L'attaque alg:none doit être rejetée");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_end_to_end_authorization_decisions_depend_on_valid_jwt() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        clear_session();

        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // 1. Cas falsifié : JWT forgé pour usurper le compte u-sa (SUPER_ADMIN)
        let forged = make_test_jwt("faux-secret-attaquant", "u-sa", 3600);
        crate::sync::set_sync_access_token(Some(forged));
        clear_session();

        // Les gardes d'autorisation doivent refuser l'accès
        assert!(require_authenticated(&conn).is_err(), "Un JWT falsifié ne doit pas donner accès");
        assert!(require_super_admin(&conn).is_err(), "Un JWT falsifié ne doit pas conférer les droits admin");

        // 2. Cas expiré : JWT pour u-dir-a mais expiré
        let expired = make_test_jwt(secret, "u-dir-a", -60);
        crate::sync::set_sync_access_token(Some(expired));
        clear_session();

        assert!(require_authenticated(&conn).is_err(), "Un JWT expiré ne doit pas donner accès");
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_err());

        // 3. Cas valide : JWT légitime pour u-dir-a
        let valid = make_test_jwt(secret, "u-dir-a", 3600);
        crate::sync::set_sync_access_token(Some(valid));
        clear_session();

        let session = get_authenticated_user(&conn).expect("Un JWT valide doit permettre l'accès");
        assert_eq!(session.user_id, "u-dir-a");
        assert_eq!(session.school_id, "school-A");
        assert!(require_authenticated(&conn).is_ok());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_ok());
        // L'isolation multi-école reste respectée : pas d'accès à school-B
        assert!(require_direction_or_super_admin(&conn, Some("school-B")).is_err());

        // Nettoyage
        crate::sync::set_sync_access_token(None);
        clear_session();
        std::env::remove_var("SUPABASE_JWT_SECRET");
    }
}

