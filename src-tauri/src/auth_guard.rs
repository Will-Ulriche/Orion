use std::sync::Mutex;
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
#[cfg(test)]
use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
#[cfg(test)]
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

#[cfg(test)]
#[allow(unused_imports)]
pub(crate) use tests::{make_test_jwt, make_test_jwt_with_role};

#[derive(Deserialize, serde::Serialize, Debug, Clone)]
pub struct JwtClaims {
    pub sub: Option<String>,
    pub email: Option<String>,
    // Conservé pour la sémantique JWT (expiration portée par le claim) ;
    // la validation effective est déléguée à jsonwebtoken via Validation.
    #[allow(dead_code)]
    pub exp: Option<i64>,
    pub role: Option<String>,
    pub user_metadata: Option<serde_json::Value>,
    pub app_metadata: Option<serde_json::Value>,
}

/// Enregistre ou efface la session utilisateur courante en mÃ©moire Rust
pub fn set_current_session(session: Option<SessionUser>) {
    if let Ok(mut lock) = CURRENT_SESSION.lock() {
        *lock = session;
    }
}

/// Invalide la session courante
pub fn clear_session() {
    set_current_session(None);
}

/// Ã‰tablit une session locale Ã  partir d'un utilisateur vÃ©rifiÃ© dans la base SQLite
pub fn establish_local_session(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
) -> Result<SessionUser, String> {
    // 1. VÃ©rifier existence et statut actif du compte
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

    // 2. Extraire les rÃ´les effectifs
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

/// Ã‰met un jeton opaque aprÃ¨s une authentification rÃ©ussie.
/// Le secret est stockÃ© uniquement sous forme de hash bcrypt.
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
        .map_err(|e| format!("Erreur lecture Ã©tablissement: {}", e))?;
    if school_exists == 0 {
        return Err("Ã‰tablissement introuvable. Veuillez vous reconnecter.".to_string());
    }

    let now = chrono::Utc::now().timestamp();
    let expires_at = now + LOCAL_SESSION_TTL_SECONDS;
    let session_id = uuid::Uuid::new_v4().to_string();
    let secret = generate_session_secret();
    let secret_hash = bcrypt::hash(&secret, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Erreur crÃ©ation jeton de session: {}", e))?;

    // Une nouvelle authentification remplace les anciens jetons de cet utilisateur
    // pour cet Ã©tablissement.
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

/// Restaure une session uniquement Ã  partir d'un jeton opaque valide.
/// Aucun identifiant utilisateur/Ã©tablissement fourni par le client n'est acceptÃ©.
pub fn restore_session_from_token(
    conn: &Connection,
    token: &str,
) -> Result<(SessionUser, i64), String> {
    let invalid = || "Session locale invalide ou expirÃ©e. Veuillez vous reconnecter.".to_string();
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
        .map_err(|e| format!("Erreur lecture Ã©tablissement: {}", e))?;
    if school_exists == 0 {
        return Err(invalid());
    }

    let session = establish_local_session(conn, &user_id, &school_id)?;
    Ok((session, expires_at))
}

/// RÃ©voque le jeton prÃ©sentÃ© lors de la dÃ©connexion.
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
    .map_err(|e| format!("Erreur rÃ©vocation session: {}", e))?;
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

/// Extrait les rÃ´les d'un utilisateur dans la base locale
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
/// (Settings â†’ API â†’ JWT Secret). Elle ne doit jamais Ãªtre committÃ©e.
#[cfg(test)]
fn supabase_jwt_secret() -> Option<String> {
    // Ordre de priorité : variable d'environnement runtime, puis .env chargé par dotenvy.
    std::env::var("SUPABASE_JWT_SECRET").ok().filter(|s| !s.is_empty())
}

#[cfg(test)]
fn supabase_expected_issuers() -> Vec<String> {
    let _ = dotenv();
    let mut issuers = vec!["supabase".to_string()];
    let configured_url = std::env::var("VITE_SUPABASE_URL")
        .or_else(|_| std::env::var("SUPABASE_URL"))
        .unwrap_or_else(|_| "https://reyxonfhvlybjhxlthvy.supabase.co".to_string());
    let trimmed = configured_url.trim().trim_end_matches('/');
    if !trimmed.is_empty() {
        issuers.push(format!("{}/auth/v1", trimmed));
        issuers.push(trimmed.to_string());
    }
    issuers
}

#[cfg(test)]
pub(crate) fn decode_jwt_token(token: &str) -> Option<JwtClaims> {
    let secret = supabase_jwt_secret().or_else(|| {
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

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct CloudAuthUser {
    pub id: String,
    pub email: Option<String>,
}

/// Analyse et valide la réponse brute de Supabase Auth (`GET /auth/v1/user`).
/// Rejette tout statut non-200 (401, 403, 500...) et toute charge utile sans id valide.
pub fn parse_supabase_auth_user_response(
    status_code: u16,
    body: &str,
) -> Result<CloudAuthUser, String> {
    if status_code != 200 {
        return Err(format!(
            "Jeton d'authentification cloud invalide ou expiré (statut HTTP {}).",
            status_code
        ));
    }

    let payload: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| format!("Réponse Supabase Auth invalide ou malformée : {}", e))?;

    let user_id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "La réponse Supabase Auth ne contient aucun identifiant utilisateur valide.".to_string())?
        .to_string();

    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(CloudAuthUser { id: user_id, email })
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq, Eq)]
pub struct CloudUserRole {
    pub school_id: Option<String>,
    pub role_name: String,
}

/// Analyse et valide la réponse brute de PostgREST (`GET /rest/v1/user_roles?select=school_id,roles(name)&user_id=eq.{id}`).
/// Retourne la liste des couples (school_id, role_name) autorisés dans la base PostgreSQL sous RLS.
/// Ignore totalement user_metadata ou tout autre claim non validé par la base.
pub fn parse_cloud_user_roles_response(
    status_code: u16,
    body: &str,
) -> Result<Vec<CloudUserRole>, String> {
    if status_code != 200 {
        return Err(format!(
            "Vérification des autorisations cloud échouée (statut HTTP {}).",
            status_code
        ));
    }

    let json: serde_json::Value = serde_json::from_str(body)
        .map_err(|e| format!("Réponse PostgREST malformée : {}", e))?;

    let array = json
        .as_array()
        .ok_or_else(|| "Format de réponse inattendu pour les rôles utilisateur (tableau attendu).".to_string())?;

    let mut user_roles = Vec::new();
    for item in array {
        let role_name = item
            .get("roles")
            .and_then(|r| r.get("name"))
            .and_then(|n| n.as_str())
            .map(|s| s.trim().to_string());

        if let Some(r_name) = role_name {
            if !r_name.is_empty() {
                let school_id = item
                    .get("school_id")
                    .and_then(|s| s.as_str())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());

                user_roles.push(CloudUserRole {
                    school_id,
                    role_name: r_name,
                });
            }
        }
    }

    Ok(user_roles)
}

/// Analyse et valide la réponse brute de PostgREST (`GET /rest/v1/user_roles?select=roles(name)&user_id=eq.{id}`).
/// Vérifie la présence effective de SUPER_ADMIN dans les rôles canoniques de la base.
/// Ignore totalement user_metadata ou tout autre claim non validé par la base.
pub fn parse_cloud_super_admin_roles_response(
    status_code: u16,
    body: &str,
) -> Result<(), String> {
    let roles = parse_cloud_user_roles_response(status_code, body)?;
    let has_super_admin = roles.iter().any(|r| r.role_name.eq_ignore_ascii_case("SUPER_ADMIN"));

    if !has_super_admin {
        return Err("Privilèges insuffisants : l'utilisateur authentifié ne possède pas le rôle SUPER_ADMIN dans le cloud.".to_string());
    }

    Ok(())
}

/// Vérifie l'authenticité et l'identité du jeton auprès de Supabase Auth
/// via l'endpoint officiel `GET /auth/v1/user`.
///
/// Utilise uniquement l'URL Supabase et la clé anonyme publique (apikey).
/// Supabase Auth valide la signature, l'audience, l'émetteur et l'expiration côté serveur.
/// Tout jeton invalide, expiré ou forgé entraîne un refus HTTP (ex: 401 Unauthorized).
pub async fn verify_supabase_user_token(
    supabase_url: &str,
    supabase_anon_key: &str,
    token: &str,
    client: &reqwest::Client,
) -> Result<CloudAuthUser, String> {
    let trimmed_token = token.trim();
    if trimmed_token.is_empty() {
        return Err("Jeton d'authentification absent ou vide.".to_string());
    }

    let trimmed_url = supabase_url.trim().trim_end_matches('/');
    let trimmed_key = supabase_anon_key.trim();
    if trimmed_url.is_empty() || trimmed_key.is_empty() {
        return Err("Configuration Supabase manquante (URL ou clé anonyme absente).".to_string());
    }

    let endpoint = format!("{}/auth/v1/user", trimmed_url);
    let resp = client
        .get(&endpoint)
        .header("apikey", trimmed_key)
        .header("Authorization", format!("Bearer {}", trimmed_token))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Impossible de contacter le service Supabase Auth : {}", e))?;

    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Impossible de lire la réponse Supabase Auth : {}", e))?;

    parse_supabase_auth_user_response(status, &body)
}

/// Récupère auprès de PostgREST sous contrôle RLS les rôles et établissements effectifs
/// associés à l'utilisateur connecté via son jeton Bearer.
pub async fn fetch_cloud_user_roles(
    supabase_url: &str,
    supabase_anon_key: &str,
    user_id: &str,
    token: &str,
    client: &reqwest::Client,
) -> Result<Vec<CloudUserRole>, String> {
    let trimmed_token = token.trim();
    let trimmed_url = supabase_url.trim().trim_end_matches('/');
    let trimmed_key = supabase_anon_key.trim();

    if trimmed_token.is_empty() {
        return Err("Jeton d'authentification absent ou vide.".to_string());
    }
    if user_id.trim().is_empty() {
        return Err("Identifiant utilisateur manquant pour la vérification des rôles.".to_string());
    }
    if trimmed_url.is_empty() || trimmed_key.is_empty() {
        return Err("Configuration Supabase manquante (URL ou clé anonyme absente).".to_string());
    }

    let endpoint = format!(
        "{}/rest/v1/user_roles?select=school_id,roles(name)&user_id=eq.{}",
        trimmed_url,
        user_id
    );

    let resp = client
        .get(&endpoint)
        .header("apikey", trimmed_key)
        .header("Authorization", format!("Bearer {}", trimmed_token))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Impossible de contacter l'API Supabase PostgREST : {}", e))?;

    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Impossible de lire la réponse PostgREST : {}", e))?;

    parse_cloud_user_roles_response(status, &body)
}

/// Vérifie que l'utilisateur authentifié possède formellement le rôle SUPER_ADMIN
/// dans la table PostgreSQL `public.user_roles` via PostgREST `/rest/v1/user_roles`.
///
/// Cette requête s'exécute avec le jeton Bearer de l'utilisateur sous le contrôle strict
/// des politiques RLS PostgreSQL distantes (sec007_user_roles_select_self).
/// Les données de profil modifiables (user_metadata) sont TOTALEMENT ignorées.
pub async fn verify_cloud_super_admin_role(
    supabase_url: &str,
    supabase_anon_key: &str,
    user_id: &str,
    token: &str,
    client: &reqwest::Client,
) -> Result<(), String> {
    let roles = fetch_cloud_user_roles(supabase_url, supabase_anon_key, user_id, token, client).await?;
    let has_super_admin = roles.iter().any(|r| r.role_name.eq_ignore_ascii_case("SUPER_ADMIN"));

    if !has_super_admin {
        return Err("Privilèges insuffisants : l'utilisateur authentifié ne possède pas le rôle SUPER_ADMIN dans le cloud.".to_string());
    }

    Ok(())
}

/// Vérifie de bout en bout l'identité et le privilège SUPER_ADMIN auprès de Supabase
/// en utilisant exclusivement la configuration publique du projet (sans secret maître).
pub async fn verify_cloud_super_admin_credentials(
    token: &str,
) -> Result<CloudAuthUser, String> {
    let (supabase_url, supabase_anon_key) = crate::sync::get_supabase_config()?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Erreur création client HTTP : {}", e))?;

    // 1. Validation d'authenticité et extraction de l'identité via Supabase Auth
    let auth_user = verify_supabase_user_token(&supabase_url, &supabase_anon_key, token, &client).await?;

    // 2. Validation d'autorité via les rôles réels en base PostgreSQL protégés par RLS
    verify_cloud_super_admin_role(&supabase_url, &supabase_anon_key, &auth_user.id, token, &client).await?;

    Ok(auth_user)
}

/// Récupère l'utilisateur actuellement authentifié via la session locale Rust en mémoire.
/// Vérifie toujours que le compte est actif dans SQLite et rafraîchit ses rôles.
/// Aucun secret symétrique maître n'est requis.
pub fn get_authenticated_user(conn: &Connection) -> Result<SessionUser, String> {
    // 1. Session locale en mémoire (établie après validation explicite en ligne ou hors-ligne)
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
                // Rafraîchir les rôles pour prendre en compte toute mise à jour locale
                let mut refreshed = session.clone();
                refreshed.roles = fetch_user_roles(conn, &session.user_id, Some(&session.school_id));
                refreshed.is_super_admin = refreshed.roles.iter().any(|r| r == "SUPER_ADMIN");
                return Ok(refreshed);
            }
        }
    }

    Err("Non authentifié : aucune session active. Veuillez vous connecter.".to_string())
}

/// Exige que l'appelant soit authentifiÃ©
pub fn require_authenticated(conn: &Connection) -> Result<SessionUser, String> {
    get_authenticated_user(conn)
}

/// Exige le rÃ´le SUPER_ADMIN
pub fn require_super_admin(conn: &Connection) -> Result<SessionUser, String> {
    let session = get_authenticated_user(conn)?;
    if session.is_super_admin {
        Ok(session)
    } else {
        Err("Action refusÃ©e : privilÃ¨ges de Super Administrateur requis.".to_string())
    }
}

/// Exige le rÃ´le DIRECTION pour l'Ã©tablissement cible (ou SUPER_ADMIN global)
pub fn require_direction_or_super_admin(
    conn: &Connection,
    target_school_id: Option<&str>,
) -> Result<SessionUser, String> {
    let session = get_authenticated_user(conn)?;

    // Le SUPER_ADMIN a tous les droits sur toutes les Ã©coles
    if session.is_super_admin {
        return Ok(session);
    }

    // VÃ©rifier si l'utilisateur possÃ¨de le rÃ´le DIRECTION
    let has_direction = session.roles.iter().any(|r| r == "DIRECTION");
    if !has_direction {
        return Err("Action refusÃ©e : privilÃ¨ges de Direction ou Super Administrateur requis.".to_string());
    }

    // VÃ©rifier le pÃ©rimÃ¨tre d'Ã©tablissement
    if let Some(target_sch) = target_school_id {
        if !target_sch.trim().is_empty() && target_sch != "school-1" && target_sch != "school-main" {
            // L'utilisateur doit Ãªtre rattachÃ© Ã  cet Ã©tablissement en tant que Direction
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
                    "Action refusÃ©e : vous n'avez pas autoritÃ© sur l'Ã©tablissement '{}'.",
                    target_sch
                ));
            }
        }
    }

    Ok(session)
}

/// Exige que l'appelant soit soit l'utilisateur cible lui-mÃªme, soit la Direction de son Ã©cole,
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

/// Helper universel d'autorisation pour les commandes Tauri sensibles.
///
/// Vérifie dans l'ordre :
/// 1. L'appelant est authentifié (session active).
/// 2. Si SUPER_ADMIN : accès global accordé immédiatement.
/// 3. Le school_id de la session correspond au school_id cible (isolation multi-école).
/// 4. L'appelant possède au moins un des rôles requis.
///
/// Retourne le SessionUser vérifié dont user_id sert de ecorded_by côté serveur.
pub fn authorize(
    conn: &Connection,
    school_id: &str,
    roles: &[&str],
) -> Result<SessionUser, String> {
    let s = require_authenticated(conn)?;
    if s.is_super_admin {
        return Ok(s);
    }
    if s.school_id != school_id {
        return Err(format!(
            "Accès refusé : vous n'avez pas autorité sur l'établissement '{}'.",
            school_id
        ));
    }
    if !s.roles.iter().any(|r| roles.contains(&r.as_str())) {
        return Err(format!(
            "Action refusée : rôle(s) requis — {}.",
            roles.join(", ")
        ));
    }
    Ok(s)
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
             
             INSERT INTO schools (id, name) VALUES ('school-A', 'Ã‰cole A'), ('school-B', 'Ã‰cole B');
             INSERT INTO roles (id, name) VALUES ('r-sa', 'SUPER_ADMIN'), ('r-dir', 'DIRECTION'), ('r-prof', 'PROFESSEUR');
             
             -- Utilisateurs
             INSERT INTO users (id, email, username, status) VALUES 
                ('u-sa', 'sa@test.com', 'admin', 'ACTIVE'),
                ('u-dir-a', 'dira@test.com', 'dira', 'ACTIVE'),
                ('u-dir-b', 'dirb@test.com', 'dirb', 'ACTIVE'),
                ('u-prof-a', 'profa@test.com', 'profa', 'ACTIVE'),
                ('u-suspended', 'susp@test.com', 'susp', 'SUSPENDED');
                
             -- RÃ´les
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
        // Ã‰tablir une session avec le compte suspendu
        let res = establish_local_session(&conn, "u-suspended", "school-A");
        assert!(res.is_err());
    }

    #[test]
    fn test_professeur_cannot_perform_admin_actions() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        establish_local_session(&conn, "u-prof-a", "school-A").unwrap();

        // L'utilisateur est authentifiÃ©
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

        // Direction A est autorisÃ©e sur school-A
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_ok());

        // Direction A est REJETÃ‰E sur school-B
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

        // Un identifiant utilisateur seul ne suffit plus Ã  restaurer une session.
        clear_session();
        assert!(require_authenticated(&conn).is_err());
    }

    #[test]
    fn test_legitimate_session_can_be_restored_after_restart() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        let issued = issue_local_session_token(&conn, "u-prof-a", "school-A").unwrap();

        // Simule un redÃ©marrage de l'application : la mÃ©moire Rust est vidÃ©e.
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

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Tests de vÃ©rification cryptographique JWT (SEC-02)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    // Ces tests utilisent jsonwebtoken directement pour gÃ©nÃ©rer des JWTs signÃ©s
    // avec un secret connu, puis vÃ©rifient que decode_jwt_token() les accepte
    // ou les rejette selon les critÃ¨res attendus.
    //
    // La variable d'environnement SUPABASE_JWT_SECRET est positionnÃ©e via
    // std::env::set_var() dans le cadre du test (thread non parallÃ¨le grÃ¢ce
    // au verrou de session).

    pub(crate) fn make_test_jwt(secret: &str, sub: &str, exp_offset_secs: i64) -> String {
        let issuers = supabase_expected_issuers();
        let iss = issuers.last().cloned().unwrap_or_else(|| "supabase".to_string());
        make_test_jwt_custom(
            secret,
            sub,
            exp_offset_secs,
            "authenticated",
            &iss,
            None,
        )
    }

    #[allow(dead_code)]
    pub(crate) fn make_test_jwt_with_role(
        secret: &str,
        sub: &str,
        role: &str,
        exp_offset_secs: i64,
    ) -> String {
        let issuers = supabase_expected_issuers();
        let iss = issuers.last().cloned().unwrap_or_else(|| "supabase".to_string());
        make_test_jwt_custom(
            secret,
            sub,
            exp_offset_secs,
            "authenticated",
            &iss,
            Some(role),
        )
    }

    pub(crate) fn make_test_jwt_custom(
        secret: &str,
        sub: &str,
        exp_offset_secs: i64,
        aud: &str,
        iss: &str,
        meta_role: Option<&str>,
    ) -> String {
        use jsonwebtoken::{encode, EncodingKey, Header, Algorithm};
        use serde_json::json;

        let now = chrono::Utc::now().timestamp();
        let mut claims = json!({
            "sub": sub,
            "email": format!("{}@test.com", sub),
            "exp": now + exp_offset_secs,
            "iat": now,
            "role": "authenticated",
            "aud": aud,
            "iss": iss
        });

        if let Some(r) = meta_role {
            claims["user_metadata"] = json!({ "role": r });
        }

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

        assert!(result.is_some(), "Un JWT valide doit Ãªtre acceptÃ©");
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

        assert!(result.is_none(), "Un JWT avec signature invalide doit Ãªtre rejetÃ©");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_tampered_payload_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // CrÃ©er un token valide, puis modifier le payload manuellement
        let valid_token = make_test_jwt(secret, "u-prof-a", 3600);
        let parts: Vec<&str> = valid_token.split('.').collect();
        assert_eq!(parts.len(), 3);

        // Encoder un payload falsifiÃ© (sub="u-sa" au lieu de "u-prof-a")
        use base64::Engine;
        let fake_payload = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(r#"{"sub":"u-sa","email":"sa@test.com","exp":9999999999,"aud":"authenticated","iss":"https://reyxonfhvlybjhxlthvy.supabase.co/auth/v1"}"#);
        let tampered = format!("{}.{}.{}", parts[0], fake_payload, parts[2]);

        let result = decode_jwt_token(&tampered);
        assert!(result.is_none(), "Un JWT dont le payload a Ã©tÃ© falsifiÃ© doit Ãªtre rejetÃ©");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_expired_is_rejected() {
        let _guard = lock_test_session();
        let secret = "test-secret-suffisamment-long-pour-hmac256";
        std::env::set_var("SUPABASE_JWT_SECRET", secret);

        // exp = 60 secondes dans le passÃ© (dÃ©passe largement les 10s de leeway)
        let token = make_test_jwt(secret, "u-dir-a", -60);
        let result = decode_jwt_token(&token);

        assert!(result.is_none(), "Un JWT expirÃ© doit Ãªtre rejetÃ©");

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
            None,
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
            None,
        );
        let result = decode_jwt_token(&token);

        assert!(result.is_none(), "Un JWT Ã©mis par un Ã©metteur non reconnu doit Ãªtre rejetÃ©");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_jwt_missing_secret_is_rejected() {
        let _guard = lock_test_session();
        std::env::remove_var("SUPABASE_JWT_SECRET");

        // MÃªme un JWT bien formÃ© doit Ãªtre rejetÃ© si le secret n'est pas configurÃ©
        let token = make_test_jwt("n-importe-quel-secret", "u-dir-a", 3600);
        let result = decode_jwt_token(&token);

        assert!(result.is_none(),
            "Sans SUPABASE_JWT_SECRET configurÃ©, tout JWT doit Ãªtre rejetÃ©");
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
        assert!(result.is_none(), "L'attaque alg:none doit Ãªtre rejetÃ©e");

        std::env::remove_var("SUPABASE_JWT_SECRET");
    }

    #[test]
    fn test_end_to_end_authorization_decisions_depend_on_valid_jwt() {
        let _guard = lock_test_session();
        let conn = setup_test_db();
        clear_session();

        // 1. Un jeton placé arbitrairement dans sync_access_token ne suffit plus sans validation explicite
        let arbitrary_token = "fake.bearer.jwt";
        crate::sync::set_sync_access_token(Some(arbitrary_token.to_string()));
        clear_session();

        // Les gardes d'autorisation doivent refuser l'accès sans session locale établie
        assert!(require_authenticated(&conn).is_err(), "Un jeton non validé ne doit pas donner accès");
        assert!(require_super_admin(&conn).is_err(), "Un jeton non validé ne doit pas conférer les droits admin");

        // 2. Session établie légitimement pour u-dir-a
        establish_local_session(&conn, "u-dir-a", "school-A").expect("La session légitime doit s'établir");

        let session = get_authenticated_user(&conn).expect("Une session active doit permettre l'accès");
        assert_eq!(session.user_id, "u-dir-a");
        assert_eq!(session.school_id, "school-A");
        assert!(require_authenticated(&conn).is_ok());
        assert!(require_direction_or_super_admin(&conn, Some("school-A")).is_ok());
        // L'isolation multi-école reste respectée : pas d'accès à school-B
        assert!(require_direction_or_super_admin(&conn, Some("school-B")).is_err());

        // Nettoyage
        crate::sync::set_sync_access_token(None);
        clear_session();
    }

    // ──────────────────────────────────────────────
    // Tests de validation cloud sans secret maître (ORI-SEC-01A-FIX2)
    // ──────────────────────────────────────────────

    #[test]
    fn test_parse_supabase_auth_user_rejected_on_401() {
        let res = parse_supabase_auth_user_response(401, r#"{"message":"Invalid or expired JWT"}"#);
        assert!(res.is_err(), "Un jeton renvoyant 401 doit être rejeté");
        assert!(res.unwrap_err().contains("invalide ou expiré"));
    }

    #[test]
    fn test_parse_supabase_auth_user_rejected_on_http_errors() {
        let res_403 = parse_supabase_auth_user_response(403, r#"{"error":"Forbidden"}"#);
        assert!(res_403.is_err());
        assert!(res_403.unwrap_err().contains("403"));

        let res_500 = parse_supabase_auth_user_response(500, r#"{"error":"Internal Server Error"}"#);
        assert!(res_500.is_err());
        assert!(res_500.unwrap_err().contains("500"));
    }

    #[test]
    fn test_parse_supabase_auth_user_success_extracts_id() {
        let res = parse_supabase_auth_user_response(
            200,
            r#"{"id":"user-uuid-123","email":"admin@orion.app"}"#,
        );
        assert!(res.is_ok(), "Un jeton validé par Supabase Auth doit être accepté : {:?}", res);
        let user = res.unwrap();
        assert_eq!(user.id, "user-uuid-123");
        assert_eq!(user.email.as_deref(), Some("admin@orion.app"));
    }

    #[test]
    fn test_parse_supabase_auth_user_rejects_missing_or_empty_id() {
        let res_missing = parse_supabase_auth_user_response(200, r#"{"email":"admin@orion.app"}"#);
        assert!(res_missing.is_err());
        assert!(res_missing.unwrap_err().contains("aucun identifiant utilisateur valide"));

        let res_empty = parse_supabase_auth_user_response(200, r#"{"id":"   ","email":"admin@orion.app"}"#);
        assert!(res_empty.is_err());
        assert!(res_empty.unwrap_err().contains("aucun identifiant utilisateur valide"));
    }

    #[test]
    fn test_parse_supabase_auth_user_rejects_malformed_json() {
        let res = parse_supabase_auth_user_response(200, r#"{malformed_json"#);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("invalide ou malformée"));
    }

    #[test]
    fn test_parse_cloud_super_admin_roles_rejects_user_metadata_injection() {
        // L'attaquant prétend être SUPER_ADMIN dans ses user_metadata,
        // mais n'a AUCUN rôle SUPER_ADMIN dans la table PostgreSQL user_roles (renvoie [])
        let res = parse_cloud_super_admin_roles_response(200, r#"[]"#);
        assert!(res.is_err(), "Un utilisateur sans entrée SUPER_ADMIN dans PostgreSQL doit être rejeté");
        assert!(res.unwrap_err().contains("Privilèges insuffisants"));
    }

    #[test]
    fn test_parse_cloud_super_admin_roles_rejects_other_roles() {
        let body = r#"[{"roles":{"name":"DIRECTION"}},{"roles":{"name":"PROFESSEUR"}}]"#;
        let res = parse_cloud_super_admin_roles_response(200, body);
        assert!(res.is_err(), "Les rôles autres que SUPER_ADMIN ne doivent pas suffire");
        assert!(res.unwrap_err().contains("Privilèges insuffisants"));
    }

    #[test]
    fn test_parse_cloud_super_admin_roles_accepts_when_present_in_db() {
        let body = r#"[{"roles":{"name":"SUPER_ADMIN"}}]"#;
        let res = parse_cloud_super_admin_roles_response(200, body);
        assert!(res.is_ok(), "Un utilisateur avec SUPER_ADMIN dans PostgreSQL doit être accepté : {:?}", res);

        let body_case_insensitive = r#"[{"roles":{"name":"super_admin"}}]"#;
        let res_ci = parse_cloud_super_admin_roles_response(200, body_case_insensitive);
        assert!(res_ci.is_ok(), "La comparaison doit être insensible à la casse");
    }

    #[test]
    fn test_parse_cloud_super_admin_roles_rejects_http_errors() {
        let res_403 = parse_cloud_super_admin_roles_response(403, r#"{"message":"Forbidden"}"#);
        assert!(res_403.is_err());
        assert!(res_403.unwrap_err().contains("403"));

        let res_500 = parse_cloud_super_admin_roles_response(500, r#"{"message":"Internal Server Error"}"#);
        assert!(res_500.is_err());
        assert!(res_500.unwrap_err().contains("500"));
    }

    #[test]
    fn test_parse_cloud_super_admin_roles_rejects_malformed_json_and_shapes() {
        let res_malformed = parse_cloud_super_admin_roles_response(200, r#"{not a valid json"#);
        assert!(res_malformed.is_err());

        let res_object = parse_cloud_super_admin_roles_response(200, r#"{"roles":{"name":"SUPER_ADMIN"}}"#);
        assert!(res_object.is_err());
        assert!(res_object.unwrap_err().contains("tableau attendu"));
    }

    #[test]
    fn test_verify_cloud_functions_validate_input_parameters() {
        let client = reqwest::Client::new();

        // 1. Token vide
        let res_empty_token = tauri::async_runtime::block_on(async {
            verify_supabase_user_token("https://example.supabase.co", "anon-key", "   ", &client).await
        });
        assert!(res_empty_token.is_err());
        assert!(res_empty_token.unwrap_err().contains("Jeton d'authentification absent ou vide"));

        // 2. URL ou clé vide
        let res_missing_config = tauri::async_runtime::block_on(async {
            verify_supabase_user_token("", "anon-key", "valid-token", &client).await
        });
        assert!(res_missing_config.is_err());
        assert!(res_missing_config.unwrap_err().contains("Configuration Supabase manquante"));

        // 3. user_id manquant pour les rôles
        let res_missing_user = tauri::async_runtime::block_on(async {
            verify_cloud_super_admin_role("https://example.supabase.co", "anon-key", "", "valid-token", &client).await
        });
        assert!(res_missing_user.is_err());
        assert!(res_missing_user.unwrap_err().contains("Identifiant utilisateur manquant"));
    }

    #[test]
    fn test_parse_cloud_user_roles_response_extracts_roles_and_schools() {
        let body = r#"[
            {"school_id":"school-alpha","roles":{"name":"DIRECTION"}},
            {"school_id":"school-beta","roles":{"name":"PROFESSEUR"}},
            {"school_id":null,"roles":{"name":"SUPER_ADMIN"}}
        ]"#;

        let res = parse_cloud_user_roles_response(200, body);
        assert!(res.is_ok());
        let roles = res.unwrap();
        assert_eq!(roles.len(), 3);
        assert_eq!(roles[0], CloudUserRole { school_id: Some("school-alpha".to_string()), role_name: "DIRECTION".to_string() });
        assert_eq!(roles[1], CloudUserRole { school_id: Some("school-beta".to_string()), role_name: "PROFESSEUR".to_string() });
        assert_eq!(roles[2], CloudUserRole { school_id: None, role_name: "SUPER_ADMIN".to_string() });
    }

    #[test]
    fn test_parse_cloud_user_roles_response_handles_empty_array() {
        let body = r#"[]"#;
        let res = parse_cloud_user_roles_response(200, body);
        assert!(res.is_ok());
        let roles = res.unwrap();
        assert!(roles.is_empty());
    }

    #[test]
    fn test_get_authenticated_user_works_from_current_session_without_secret() {
        let _guard = lock_test_session();
        clear_session();
        let conn = setup_test_db();

        std::env::remove_var("SUPABASE_JWT_SECRET");

        // 1. Sans session en mémoire : rejeté
        let res_no_session = get_authenticated_user(&conn);
        assert!(res_no_session.is_err());

        // 2. Session établie explicitement dans SQLite
        establish_local_session(&conn, "u-dir-a", "school-A").unwrap();

        // 3. get_authenticated_user réussit et extrait les rôles réels de SQLite
        let user = get_authenticated_user(&conn).expect("Session active doit être acceptée");
        assert_eq!(user.user_id, "u-dir-a");
        assert_eq!(user.school_id, "school-A");
        assert!(user.roles.contains(&"DIRECTION".to_string()));
        assert!(!user.is_super_admin);

        clear_session();
    }
}

