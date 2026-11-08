// ============================================================
// sync.rs — Moteur Offline-First & Synchronisation
// Session 3 — Orion
// ============================================================
//
// Architecture :
//   Outbox (pending_mutations)  →  Supabase   (SQLite → Cloud)
//   Supabase                    →  Inbox       (Cloud → SQLite)
//
// Déclenchement :
//   - Automatique : toutes les 5 minutes si connexion disponible
//   - Manuel      : via la commande Tauri `trigger_sync`
//
// Règles fondamentales respectées :
//   - SQLite est la base opérationnelle, jamais contournée
//   - Mutation non confirmée → reste PENDING (jamais perdue)
//   - Idempotence : re-envoi safe grâce aux UUIDs stables
//   - Conflits critiques jamais écrasés silencieusement
// ============================================================

use base64::{engine::general_purpose::STANDARD, Engine as _};
use dotenvy::dotenv;
use reqwest::Client;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

/// JWT utilisateur courant pour les appels REST (jamais persisté, jamais service_role).
static SYNC_ACCESS_TOKEN: Mutex<Option<String>> = Mutex::new(None);

/// Identifiant canonique de la ligne d'état du moteur.
/// Toutes les lectures/écritures sur `sync_state` ciblent cette ligne, ce qui
/// rend les compteurs et le statut persistants même quand aucun cycle n'a
/// encore réussi.
const SYNC_STATE_ID: &str = "local-device";

/// Tables parentes dont l'insertion doit précéder celle des enfants,
/// sinon PostgreSQL rejette l'enfant sur une violation de clé étrangère.
pub(crate) const DEPENDENCY_ORDER: [(&str, u8); 26] = [
    ("schools", 0),
    ("sections", 1),
    ("levels", 2),
    ("series", 2),
    ("academic_years", 1),
    ("classes", 3),
    ("staff", 3),
    ("students", 4),
    ("enrollments", 5),
    ("enrollment_history", 6),
    ("fee_structures", 7),
    ("payments", 8),
    // Session 5 — Module pédagogique
    ("subjects", 7),
    ("grade_types", 7),
    ("grading_periods", 8),
    ("class_subjects", 8),
    ("teacher_assignments", 8),
    ("grades", 9),
    // Session 6 — Module bibliothèque
    ("library_categories", 10),
    ("library_books", 11),
    ("library_readers", 11),
    ("library_copies", 12),
    ("library_loans", 13),
    ("library_returns", 14),
    ("library_penalties", 14),
    ("library_reservations", 14),
];

// ──────────────────────────────────────────────
// Types publics exposés aux Tauri commands
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub engine_status: String, // IDLE | SYNCING | ERROR | OFFLINE
    pub last_sync_at: Option<String>,
    pub pending_count: i64,  // Mutations en attente d'envoi
    pub failed_count: i64,   // Mutations échouées
    pub conflict_count: i64, // Conflits en attente de résolution
    pub inbox_pending: i64,  // Changements entrants non appliqués
    pub is_online: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingMutation {
    pub id: String,
    pub school_id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub status: String,
    pub attempt_count: i64,
    pub created_at: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxConflict {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub local_data: Option<Value>,
    pub remote_data: Value,
    pub received_at: String,
}

// ──────────────────────────────────────────────
// Boucle de synchronisation automatique
// Tournera en arrière-plan toutes les 5 minutes
// ──────────────────────────────────────────────

/// Refuse une clé JWT dont le claim `role` est `service_role`.
/// Une variable d'environnement non préfixée `VITE_` n'est pas secrète
/// dans un binaire Tauri distribué : on ne l'utilise jamais si elle est privilégiée.
fn jwt_role_claim(token: &str) -> Option<String> {
    let payload = token.split('.').nth(1)?;
    let padded = match payload.len() % 4 {
        2 => format!("{}==", payload.replace('-', "+").replace('_', "/")),
        3 => format!("{}=", payload.replace('-', "+").replace('_', "/")),
        0 => payload.replace('-', "+").replace('_', "/"),
        _ => return None,
    };
    let bytes = STANDARD.decode(padded).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    value
        .get("role")
        .and_then(|r| r.as_str())
        .map(str::to_string)
}

fn reject_privileged_jwt(token: &str) -> Result<(), String> {
    if jwt_role_claim(token).as_deref() == Some("service_role") {
        Err("Clé Supabase privilégiée refusée. Utilisez uniquement la clé anon et le JWT utilisateur.".into())
    } else {
        Ok(())
    }
}

pub fn set_sync_access_token(token: Option<String>) {
    let sanitized = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && t != "offline");
    if let Some(ref t) = sanitized {
        if reject_privileged_jwt(t).is_err() {
            if let Ok(mut guard) = SYNC_ACCESS_TOKEN.lock() {
                *guard = None;
            }
            return;
        }
    }
    if let Ok(mut guard) = SYNC_ACCESS_TOKEN.lock() {
        *guard = sanitized;
    }
}

pub fn current_sync_access_token() -> Option<String> {
    SYNC_ACCESS_TOKEN.lock().ok().and_then(|g| g.clone())
}

fn get_supabase_config() -> Result<(String, String), String> {
    let _ = dotenv();
    // Compile-time : uniquement les variables publiques VITE_*.
    // Runtime : URL + clé anon. Jamais SUPABASE_SERVICE_ROLE_KEY.
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .ok()
        .or_else(|| env::var("SUPABASE_URL").ok())
        .or_else(|| option_env!("VITE_SUPABASE_URL").map(String::from))
        .ok_or_else(|| {
            "VITE_SUPABASE_URL (ou SUPABASE_URL) doit être définie pour la sync".to_string()
        })?;

    let supabase_anon_key = env::var("VITE_SUPABASE_ANON_KEY")
        .ok()
        .or_else(|| env::var("SUPABASE_ANON_KEY").ok())
        .or_else(|| option_env!("VITE_SUPABASE_ANON_KEY").map(String::from))
        .ok_or_else(|| {
            "VITE_SUPABASE_ANON_KEY (ou SUPABASE_ANON_KEY) doit être définie pour la sync"
                .to_string()
        })?;

    reject_privileged_jwt(&supabase_anon_key)?;
    Ok((supabase_url, supabase_anon_key))
}

pub fn start_sync_loop(db_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let (supabase_url, supabase_anon_key) = match get_supabase_config() {
            Ok(cfg) => cfg,
            Err(e) => {
                println!(
                    "[Sync] Configuration Supabase absente ({}). Moteur en attente.",
                    e
                );
                return;
            }
        };

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("[Sync] Impossible de construire le client HTTP");

        println!("[Sync] Moteur démarré. Cycle : 5 minutes.");

        loop {
            // Attendre 5 minutes entre chaque cycle automatique
            tokio::time::sleep(Duration::from_secs(300)).await;

            println!("[Sync] Cycle automatique démarré.");
            let access_token = current_sync_access_token();
            run_sync_cycle(
                &db_path,
                &client,
                &supabase_url,
                &supabase_anon_key,
                access_token.as_deref(),
            )
            .await;
        }
    });
}

// ──────────────────────────────────────────────
// Cycle de synchronisation complet
// Appelé par la boucle automatique ET par le bouton manuel
// ──────────────────────────────────────────────

pub async fn run_sync_cycle(
    db_path: &PathBuf,
    client: &Client,
    supabase_url: &str,
    supabase_anon_key: &str,
    // JWT de l'utilisateur connecté. Utilisé dans Authorization pour que RLS
    // s'applique avec l'identité réelle de l'utilisateur (pas le rôle anon).
    // Si absent (hors-ligne ou session expirée), le cycle est annulé.
    access_token: Option<&str>,
) {
    ensure_sync_state(db_path);

    // Sans JWT utilisateur, impossible de respecter RLS — on ne synchronise pas.
    let bearer_token = match access_token {
        Some(t) if !t.is_empty() => t,
        _ => {
            update_engine_status(
                db_path,
                "OFFLINE",
                Some("Session utilisateur absente. Connectez-vous pour synchroniser."),
            );
            println!("[Sync] Pas de JWT utilisateur. Cycle annulé.");
            return;
        }
    };

    // 1. Vérifier la connectivité avant de commencer
    if !check_connectivity(client, supabase_url, supabase_anon_key).await {
        update_engine_status(db_path, "OFFLINE", Some("Supabase inaccessible."));
        println!("[Sync] Hors ligne. Cycle annulé.");
        return;
    }

    update_engine_status(db_path, "SYNCING", None);

    // 2. Outbound : envoyer les mutations locales vers Supabase
    let outbound_result = process_outbox(
        db_path,
        client,
        supabase_url,
        supabase_anon_key,
        bearer_token,
    )
    .await;

    // 3. Inbound : récupérer les changements distants depuis Supabase
    let inbound_result = process_inbox(
        db_path,
        client,
        supabase_url,
        supabase_anon_key,
        bearer_token,
    )
    .await;

    // 4. Résumer les échecs résiduels : le cycle peut être « réussi » côté
    //    réseau tout en laissant des mutations en FAILED. Sans ça, `last_error`
    //    restait nul et l'interface n'affichait aucun signal d'échec.
    let residual = residual_failure_summary(db_path);

    let has_error = outbound_result.is_err() || inbound_result.is_err() || residual.is_some();
    let status = if has_error { "ERROR" } else { "IDLE" };
    let error_msg = match (outbound_result, inbound_result) {
        (Err(e), _) => Some(e),
        (_, Err(e)) => Some(e),
        (Ok(_), Ok(warning)) => warning.or(residual),
    };

    update_engine_status(db_path, status, error_msg.as_deref());
    update_last_sync_timestamp(db_path);

    println!("[Sync] Cycle terminé. Statut : {}", status);
}

// ──────────────────────────────────────────────
// Vérification de connectivité
// Un HEAD vers l'endpoint Supabase suffit
// ──────────────────────────────────────────────

async fn check_connectivity(client: &Client, supabase_url: &str, supabase_key: &str) -> bool {
    let health_url = format!("{}/rest/v1/", supabase_url);
    match client
        .get(&health_url)
        .header("apikey", supabase_key)
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(res) => !res.status().is_server_error(),
        Err(_) => false,
    }
}

// ──────────────────────────────────────────────
// OUTBOUND — Envoi des mutations locales vers Supabase
// Traitement par lot de 20 pour éviter les timeouts
// ──────────────────────────────────────────────

async fn process_outbox(
    db_path: &PathBuf,
    client: &Client,
    supabase_url: &str,
    supabase_anon_key: &str,
    bearer_token: &str,
) -> Result<(), String> {
    let mutations = load_pending_mutations(db_path)?;

    if mutations.is_empty() {
        println!("[Outbox] Aucune mutation à envoyer.");
        return Ok(());
    }

    println!("[Outbox] {} mutation(s) à traiter.", mutations.len());

    for (id, entity_type, operation, payload_str, attempt_count) in mutations {
        // Limiter les tentatives : après 5 échecs, on passe en FAILED définitif
        if attempt_count >= 5 {
            mark_mutation(
                db_path,
                &id,
                "FAILED",
                Some("Trop de tentatives. Intervention requise."),
            );
            continue;
        }

        // Ne pas envoyer d'enfant tant qu'un parent n'est pas passé : l'erreur
        // foreign key qui en résulterait serait sans rapport avec la cause réelle.
        let blocked_by = blocking_parents(db_path, &entity_type);
        if !blocked_by.is_empty() {
            let reason = format!("En attente du parent : {}", blocked_by.join(", "));
            mark_mutation_error(db_path, &id, &reason);
            println!("[Outbox] ⏸ {} ({}) — {}", entity_type, id, reason);
            continue;
        }

        increment_attempt(db_path, &id);

        let payload: Value = match serde_json::from_str(&payload_str) {
            Ok(v) => v,
            Err(e) => {
                mark_mutation(
                    db_path,
                    &id,
                    "FAILED",
                    Some(&format!("JSON invalide : {}", e)),
                );
                continue;
            }
        };

        let endpoint = format!("{}/rest/v1/{}", supabase_url, entity_type);

        let headers = |b: reqwest::RequestBuilder| {
            // apikey : clé anon publique (identificateur du projet Supabase).
            // Authorization : JWT utilisateur → RLS s'applique avec son identité réelle.
            b.header("apikey", supabase_anon_key)
                .header("Authorization", format!("Bearer {}", bearer_token))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
                // En-tête d'idempotence : permet au serveur d'ignorer un doublon
                .header("X-Mutation-Id", &id)
        };

        let is_write = operation == "INSERT" || operation == "UPSERT" || operation == "UPDATE";
        let record_id = payload
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::to_string);

        let res = match operation.as_str() {
            "INSERT" | "UPSERT" => {
                headers(
                    client
                        .post(format!("{}?on_conflict=id", endpoint))
                        .json(&payload),
                )
                .send()
                .await
            }
            "UPDATE" => match &record_id {
                Some(rid) => {
                    headers(
                        client
                            .patch(format!("{}?id=eq.{}", endpoint, rid))
                            .json(&payload),
                    )
                    .send()
                    .await
                }
                None => {
                    mark_mutation(db_path, &id, "FAILED", Some("UPDATE sans champ 'id'"));
                    continue;
                }
            },
            "DELETE" => match &record_id {
                Some(rid) => {
                    headers(client.delete(format!("{}?id=eq.{}", endpoint, rid)))
                        .send()
                        .await
                }
                None => {
                    mark_mutation(db_path, &id, "FAILED", Some("DELETE sans champ 'id'"));
                    continue;
                }
            },
            _ => {
                mark_mutation(db_path, &id, "FAILED", Some("Opération inconnue"));
                continue;
            }
        };

        let mut res = match res {
            Ok(r) => r,
            Err(e) => {
                // Erreur réseau → on s'arrête immédiatement pour ce cycle
                eprintln!("[Outbox] Erreur réseau : {}", e);
                return Err(format!("Erreur réseau : {}", e));
            }
        };

        // Repli d'idempotence : PostgREST n'honore pas `on_conflict` selon la
        // version déployée, et un rejeu d'une création déjà appliquée répond
        // alors 409 (doublon de clé primaire). On repasse en PATCH ciblé, ce
        // qui est correct sur toutes les versions.
        if res.status().as_u16() == 409 && is_write {
            if let Some(rid) = &record_id {
                eprintln!(
                    "[Outbox] Doublon {} {} — bascule en mise à jour.",
                    entity_type, rid
                );
                res = match headers(
                    client
                        .patch(format!("{}?id=eq.{}", endpoint, rid))
                        .json(&payload),
                )
                .send()
                .await
                {
                    Ok(r) => r,
                    Err(e) => {
                        eprintln!("[Outbox] Erreur réseau (repli PATCH) : {}", e);
                        return Err(format!("Erreur réseau : {}", e));
                    }
                };
            }
        }

        // Idempotence : une suppression rejouée sur une ligne déjà absente côté
        // serveur est un succès (l'état final est celui attendu).
        if res.status().as_u16() == 404 && operation == "DELETE" {
            println!(
                "[Outbox] ✓ Mutation {} déjà absente côté serveur (DELETE idempotent).",
                id
            );
            mark_mutation(db_path, &id, "SYNCED", None);
            continue;
        }

        if res.status().is_success() {
            println!("[Outbox] ✓ Mutation {} synchronisée.", id);
            mark_mutation(db_path, &id, "SYNCED", None);
        } else if res.status().is_client_error() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            if status == 408 || status == 429 {
                // Erreur temporaire côté client : on réessaie au cycle suivant.
                let error = format!("Erreur temporaire {} — Nouvelle tentative prévue.", status);
                eprintln!("[Outbox] ✗ Mutation {} : {}", id, error);
                mark_mutation_error(db_path, &id, &error);
            } else {
                let error = format!("Erreur client {}: {}", status, body);
                eprintln!("[Outbox] ✗ Mutation {} : {}", id, error);
                mark_mutation(db_path, &id, "FAILED", Some(&error));
            }
        } else {
            // Erreur serveur (5xx) → on réessaie au prochain cycle
            let status = res.status().as_u16();
            let error = format!("Erreur serveur {} — Nouvelle tentative prévue.", status);
            eprintln!("[Outbox] ✗ Mutation {} : {}", id, error);
            mark_mutation_error(db_path, &id, &error);
        }
    }

    Ok(())
}

// ──────────────────────────────────────────────
// INBOUND — Récupération des changements distants
// Utilise un cursor (dernière version connue) pour l'incrémental
// ──────────────────────────────────────────────

/// Taille de page pour la synchronisation entrante (PostgREST REST API)
pub const INBOUND_PAGE_SIZE: usize = 500;

/// Récupère les changements distants avec pagination complète par table.
/// Retourne `Ok(None)` si tout s'est bien passé, `Ok(Some(avertissement))`
/// si au moins une table a été ignorée pour incompatibilité de schéma,
/// et `Err` en cas de panne réseau ou serveur (le curseur n'est alors PAS avancé).
pub(crate) async fn process_inbox(
    db_path: &PathBuf,
    client: &Client,
    supabase_url: &str,
    supabase_anon_key: &str,
    bearer_token: &str,
) -> Result<Option<String>, String> {
    let last_cursor = load_inbound_cursor(db_path).unwrap_or_default();

    // Tables synchronisables et colonne servant de curseur incrémental.
    // `enrollment_history` n'a pas de `updated_at` côté Supabase : son
    // horodatage est `changed_at`.
    let tables: [(&str, &str); 22] = [
        ("staff", "updated_at"),
        ("academic_years", "updated_at"),
        ("classes", "updated_at"),
        ("students", "updated_at"),
        ("enrollments", "updated_at"),
        ("enrollment_history", "changed_at"),
        ("fee_structures", "updated_at"),
        ("payments", "updated_at"),
        // Session 5 — Module pédagogique
        ("subjects", "updated_at"),
        ("grade_types", "updated_at"),
        ("grading_periods", "updated_at"),
        ("class_subjects", "updated_at"),
        ("teacher_assignments", "updated_at"),
        ("grades", "updated_at"),
        // Session 6 — Module bibliothèque (l'ordre suit les clés étrangères)
        ("library_categories", "updated_at"),
        ("library_books", "updated_at"),
        ("library_readers", "updated_at"),
        ("library_copies", "updated_at"),
        ("library_loans", "updated_at"),
        ("library_returns", "updated_at"),
        ("library_penalties", "updated_at"),
        ("library_reservations", "updated_at"),
    ];

    let mut degraded: Vec<String> = Vec::new();
    let mut storage_ok = true;

    for (table, version_col) in &tables {
        let mut offset = 0usize;
        let mut total_table_records = 0usize;

        // Pagination complète jusqu'à épuisement des résultats
        loop {
            let url = if last_cursor.is_empty() {
                // Première sync : tout récupérer page par page avec tri déterministe
                format!(
                    "{}/rest/v1/{}?order={}.asc,id.asc&limit={}&offset={}",
                    supabase_url, table, version_col, INBOUND_PAGE_SIZE, offset
                )
            } else {
                // Sync incrémentale : enregistrements modifiés après last_cursor
                format!(
                    "{}/rest/v1/{}?{}=gt.{}&order={}.asc,id.asc&limit={}&offset={}",
                    supabase_url,
                    table,
                    version_col,
                    last_cursor,
                    version_col,
                    INBOUND_PAGE_SIZE,
                    offset
                )
            };

            let res = client
                .get(&url)
                // apikey : clé anon publique. Authorization : JWT utilisateur pour RLS.
                .header("apikey", supabase_anon_key)
                .header("Authorization", format!("Bearer {}", bearer_token))
                .send()
                .await;

            match res {
                Ok(response) if response.status().is_success() => {
                    let rows = response.json::<Vec<Value>>().await.map_err(|e| {
                        format!(
                            "Erreur décodage JSON pour {} (offset {}) : {}",
                            table, offset, e
                        )
                    })?;

                    let page_len = rows.len();
                    total_table_records += page_len;

                    if !store_inbox_items(db_path, table, &rows) {
                        storage_ok = false;
                    }

                    println!(
                        "[Inbox] {} : page reçue (offset {}, {} enregistrement(s), total {}).",
                        table, offset, page_len, total_table_records
                    );

                    offset += page_len;

                    // Si la page contient moins de INBOUND_PAGE_SIZE éléments,
                    // tous les enregistrements disponibles ont été épuisés.
                    if page_len < INBOUND_PAGE_SIZE {
                        break;
                    }
                }
                Ok(response) if response.status().as_u16() == 404 => {
                    // Table non encore dans Supabase → on ignore silencieusement
                    break;
                }
                // Incompatibilité de schéma (table ou colonne absente) : on signale
                // mais on ne bloque pas les autres tables.
                Ok(response) if response.status().is_client_error() => {
                    let status = response.status().as_u16();
                    let body = response.text().await.unwrap_or_default();
                    eprintln!("[Inbox] Table {} ignorée ({}): {}", table, status, body);
                    degraded.push(format!("{} ({})", table, status));
                    break;
                }
                Ok(response) => {
                    // Erreur serveur : échec réel du cycle, on remonte sans avancer le curseur
                    let status = response.status().as_u16();
                    let body = response.text().await.unwrap_or_default();
                    eprintln!(
                        "[Inbox] Erreur {} pour la table {} (offset {}) : {}",
                        status, table, offset, body
                    );
                    return Err(format!(
                        "Erreur {} sur la table {} (offset {}) : {}",
                        status, table, offset, body
                    ));
                }
                Err(e) => {
                    eprintln!(
                        "[Inbox] Erreur réseau pour {} (offset {}) : {}",
                        table, offset, e
                    );
                    return Err(format!(
                        "Erreur réseau inbound (table {}, offset {}) : {}",
                        table, offset, e
                    ));
                }
            }
        }
    }

    if !storage_ok {
        return Err("Erreur stockage sync_inbox : curseur non avancé.".to_string());
    }

    // Appliquer tous les items de l'inbox dans SQLite jusqu'à épuisement
    let apply_failures = apply_inbox_items(db_path);
    if apply_failures > 0 {
        return Err(format!(
            "{} item(s) inbox non appliqué(s) : curseur non avancé.",
            apply_failures
        ));
    }

    // Avancer le curseur de synchronisation SEULEMENT si toutes les pages
    // et tables nécessaires ont été traitées avec succès.
    let new_cursor = inbound_cursor();
    save_inbound_cursor(db_path, &new_cursor);

    if degraded.is_empty() {
        Ok(None)
    } else {
        Ok(Some(format!(
            "Synchronisation entrante partielle — table(s) ignorée(s) : {}.",
            degraded.join(", ")
        )))
    }
}

// ──────────────────────────────────────────────
// Application des items de l'inbox dans SQLite
// ──────────────────────────────────────────────

fn apply_inbox_items(db_path: &PathBuf) -> usize {
    let db = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[Inbox] Impossible d'ouvrir SQLite : {}", e);
            return 1;
        }
    };

    let mut failed = 0usize;

    // Traiter l'ensemble des items en attente par lots jusqu'à épuisement complet
    loop {
        let items: Vec<(String, String, String, String, String)> = {
            let mut stmt = match db.prepare(
                "SELECT id, entity_type, entity_id, operation, payload
                 FROM sync_inbox
                 WHERE status = 'PENDING'
                 ORDER BY received_at ASC
                 LIMIT 200",
            ) {
                Ok(s) => s,
                Err(_) => return 1,
            };

            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            });

            match rows {
                Ok(iter) => iter.filter_map(Result::ok).collect(),
                Err(_) => return 1,
            }
        };

        if items.is_empty() {
            break;
        }

        for (inbox_id, entity_type, entity_id, operation, payload_str) in items {
            let payload: Value = match serde_json::from_str(&payload_str) {
                Ok(v) => v,
                Err(e) => {
                    let _ = db.execute(
                        "UPDATE sync_inbox SET status = 'FAILED', error_message = ?1 WHERE id = ?2",
                        rusqlite::params![format!("JSON invalide : {}", e), inbox_id],
                    );
                    failed += 1;
                    continue;
                }
            };

            // Résolution de conflit basée sur l'horodatage :
            // Si une mutation locale PENDING/SYNCING existe pour la même entité,
            // on compare les `updated_at` pour décider qui gagne.
            //   - Distant ≥ Local  → appliquer le distant (remote wins)
            //   - Local > Distant  → garder le local (local wins, APPLIED sans écriture)
            // Cela élimine les faux conflits qui bloquaient l'inbox.
            let conflict_winner =
                check_and_resolve_conflict(&db, &entity_type, &entity_id, &payload);

            match conflict_winner {
                ConflictResolution::LocalWins => {
                    // Le local est plus récent — on ignore le distant et on marque APPLIED
                    // (la donnée locale est déjà correcte dans SQLite)
                    let _ = db.execute(
                    "UPDATE sync_inbox SET status = 'APPLIED', applied_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    rusqlite::params![inbox_id],
                );
                    println!(
                        "[Inbox] LOCAL wins pour {}/{} — distant ignoré",
                        entity_type, entity_id
                    );
                    continue;
                }
                ConflictResolution::RemoteWins | ConflictResolution::NoConflict => {
                    // Pas de conflit ou le distant est plus récent → on applique normalement
                }
            }

            // Appliquer l'upsert/delete dans SQLite
            let result = match operation.as_str() {
                "INSERT" | "UPDATE" => upsert_entity(&db, &entity_type, &payload),
                "DELETE" => soft_delete_entity(&db, &entity_type, &entity_id),
                _ => Ok(()),
            };

            match result {
                Ok(_) => {
                    let _ = db.execute(
                    "UPDATE sync_inbox SET status = 'APPLIED', applied_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    rusqlite::params![inbox_id],
                );
                }
                Err(e) => {
                    let _ = db.execute(
                        "UPDATE sync_inbox SET status = 'FAILED', error_message = ?1 WHERE id = ?2",
                        rusqlite::params![e, inbox_id],
                    );
                    failed += 1;
                }
            }
        }
    }
    failed
}

// ──────────────────────────────────────────────
// Résolution intelligente de conflit par horodatage
// ──────────────────────────────────────────────

#[derive(Debug)]
enum ConflictResolution {
    NoConflict, // Pas de mutation locale en cours
    LocalWins,  // Local plus récent → on garde le local
    RemoteWins, // Distant plus récent ou égal → on applique le distant
}

/// Compare l'horodatage de la mutation locale avec celui du payload distant.
/// Retourne la résolution appropriée sans intervention manuelle.
fn check_and_resolve_conflict(
    db: &Connection,
    entity_type: &str,
    entity_id: &str,
    remote_payload: &Value,
) -> ConflictResolution {
    // Récupérer la mutation locale la plus récente pour cette entité
    let local_ts: Option<String> = db
        .query_row(
            "SELECT MAX(created_at) FROM pending_mutations
         WHERE entity_type = ?1 AND entity_id = ?2 AND status IN ('PENDING', 'SYNCING')",
            rusqlite::params![entity_type, entity_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .unwrap_or(None);

    let local_ts = match local_ts {
        Some(ts) if !ts.is_empty() => ts,
        _ => return ConflictResolution::NoConflict, // Aucune mutation locale
    };

    // Extraire l'horodatage distant (updated_at ou created_at)
    let remote_ts = remote_payload
        .get("updated_at")
        .or_else(|| remote_payload.get("created_at"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if remote_ts.is_empty() {
        // Pas d'horodatage distant → prudence, on garde le local
        return ConflictResolution::LocalWins;
    }

    // Comparaison lexicographique ISO-8601 (fonctionnel car format fixe)
    if local_ts.as_str() > remote_ts {
        ConflictResolution::LocalWins
    } else {
        ConflictResolution::RemoteWins
    }
}

// ──────────────────────────────────────────────
// Upsert d'une entité dans SQLite depuis un payload distant
// ──────────────────────────────────────────────

fn upsert_entity(db: &Connection, entity_type: &str, payload: &Value) -> Result<(), String> {
    let id = payload
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Champ 'id' manquant dans le payload.")?;

    match entity_type {
        "academic_years" => {
            db.execute(
                "INSERT INTO academic_years (id, school_id, name, start_date, end_date, status, is_current, closed_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(id) DO UPDATE SET
                     name       = excluded.name,
                     start_date = excluded.start_date,
                     end_date   = excluded.end_date,
                     status     = excluded.status",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "name"),
                    str_field(payload, "start_date"),
                    str_field(payload, "end_date"),
                    str_field(payload, "status").unwrap_or_else(|| "PLANNED".to_string()),
                    payload.get("is_current").and_then(|v| v.as_bool()).unwrap_or(false),
                    str_field(payload, "closed_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "students" => {
            db.execute(
                "INSERT INTO students (
                    id, school_id, first_name, last_name, birth_date, birth_place,
                    gender, photo_url, matricule, address, phone,
                    parent_name, parent_phone, parent_email, blood_type, medical_notes
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
                ON CONFLICT(id) DO UPDATE SET
                    first_name = excluded.first_name,
                    last_name  = excluded.last_name,
                    birth_date = excluded.birth_date,
                    address    = excluded.address,
                    matricule  = excluded.matricule",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "first_name"),
                    str_field(payload, "last_name"),
                    str_field(payload, "birth_date"),
                    str_field(payload, "birth_place"),
                    str_field(payload, "gender"),
                    str_field(payload, "photo_url"),
                    str_field(payload, "matricule"),
                    str_field(payload, "address"),
                    str_field(payload, "phone"),
                    str_field(payload, "parent_name"),
                    str_field(payload, "parent_phone"),
                    str_field(payload, "parent_email"),
                    str_field(payload, "blood_type"),
                    str_field(payload, "medical_notes"),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "enrollments" => {
            db.execute(
                "INSERT INTO enrollments (id, school_id, academic_year_id, student_id, class_id, enrollment_type, status)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)
                 ON CONFLICT(id) DO UPDATE SET
                    class_id        = excluded.class_id,
                    enrollment_type = excluded.enrollment_type,
                    status          = excluded.status",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "student_id"),
                    str_field(payload, "class_id"),
                    str_field(payload, "enrollment_type"),
                    str_field(payload, "status"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "classes" => {
            // `max_students` n'existe pas dans le schéma SQLite local :
            // l'inclure faisait échouer tout upsert de classe entrant.
            db.execute(
                "INSERT INTO classes (id, school_id, academic_year_id, name, level)
                 VALUES (?1,?2,?3,?4,?5)
                 ON CONFLICT(id) DO UPDATE SET
                    name         = excluded.name,
                    level        = excluded.level",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "name"),
                    str_field(payload, "level"),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "enrollment_history" => {
            db.execute(
                "INSERT INTO enrollment_history (id, enrollment_id, student_id, academic_year_id,
                     from_class_id, to_class_id, reason, changed_by)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(id) DO UPDATE SET
                    from_class_id = excluded.from_class_id,
                    to_class_id   = excluded.to_class_id,
                    reason        = excluded.reason",
                rusqlite::params![
                    id,
                    str_field(payload, "enrollment_id"),
                    str_field(payload, "student_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "from_class_id"),
                    str_field(payload, "to_class_id"),
                    str_field(payload, "reason"),
                    str_field(payload, "changed_by"),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "library_categories" => {
            db.execute(
                "INSERT INTO library_categories (id, school_id, name, code, description, color, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
                 ON CONFLICT(id) DO UPDATE SET
                     name        = excluded.name,
                     code        = excluded.code,
                     description = excluded.description,
                     color       = excluded.color",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "name").unwrap_or_default(),
                    str_field(payload, "code"),
                    str_field(payload, "description"),
                    str_field(payload, "color"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "library_books" => {
            db.execute(
                "INSERT INTO library_books (id, school_id, category_id, isbn, title, author, publisher,
                     publication_year, language, edition, pages, description, shelf_location,
                     is_reference, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
                 ON CONFLICT(id) DO UPDATE SET
                     category_id      = excluded.category_id,
                     isbn             = excluded.isbn,
                     title            = excluded.title,
                     author           = excluded.author,
                     publisher        = excluded.publisher,
                     publication_year = excluded.publication_year,
                     language         = excluded.language,
                     edition          = excluded.edition,
                     pages            = excluded.pages,
                     description      = excluded.description,
                     shelf_location   = excluded.shelf_location,
                     is_reference     = excluded.is_reference",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "category_id"),
                    str_field(payload, "isbn"),
                    str_field(payload, "title").unwrap_or_default(),
                    str_field(payload, "author"),
                    str_field(payload, "publisher"),
                    int_field(payload, "publication_year"),
                    str_field(payload, "language"),
                    str_field(payload, "edition"),
                    int_field(payload, "pages"),
                    str_field(payload, "description"),
                    str_field(payload, "shelf_location"),
                    bool_field(payload, "is_reference"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "library_readers" => {
            db.execute(
                "INSERT INTO library_readers (id, school_id, reader_type, student_id, staff_id, full_name,
                     email, phone, card_number, class_name, max_loans, status, registered_at,
                     expires_at, notes, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
                 ON CONFLICT(id) DO UPDATE SET
                     reader_type   = excluded.reader_type,
                     full_name     = excluded.full_name,
                     email         = excluded.email,
                     phone         = excluded.phone,
                     card_number   = excluded.card_number,
                     class_name    = excluded.class_name,
                     max_loans     = excluded.max_loans,
                     status        = excluded.status,
                     registered_at = excluded.registered_at,
                     expires_at    = excluded.expires_at,
                     notes         = excluded.notes",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "reader_type").unwrap_or_else(|| "ELEVE".to_string()),
                    str_field(payload, "student_id"),
                    str_field(payload, "staff_id"),
                    str_field(payload, "full_name").unwrap_or_default(),
                    str_field(payload, "email"),
                    str_field(payload, "phone"),
                    str_field(payload, "card_number").unwrap_or_default(),
                    str_field(payload, "class_name"),
                    int_field(payload, "max_loans").unwrap_or(3),
                    str_field(payload, "status").unwrap_or_else(|| "ACTIF".to_string()),
                    str_field(payload, "registered_at"),
                    str_field(payload, "expires_at"),
                    str_field(payload, "notes"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "library_copies" => {
            db.execute(
                "INSERT INTO library_copies (id, school_id, book_id, inventory_code, barcode, status,
                     condition, acquisition_date, acquisition_source, price, location, notes,
                     created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
                 ON CONFLICT(id) DO UPDATE SET
                     inventory_code     = excluded.inventory_code,
                     barcode            = excluded.barcode,
                     status             = excluded.status,
                     condition          = excluded.condition,
                     acquisition_date   = excluded.acquisition_date,
                     acquisition_source = excluded.acquisition_source,
                     price              = excluded.price,
                     location           = excluded.location,
                     notes              = excluded.notes",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "book_id"),
                    str_field(payload, "inventory_code").unwrap_or_default(),
                    str_field(payload, "barcode"),
                    str_field(payload, "status").unwrap_or_else(|| "DISPONIBLE".to_string()),
                    str_field(payload, "condition"),
                    str_field(payload, "acquisition_date"),
                    str_field(payload, "acquisition_source"),
                    num_field(payload, "price"),
                    str_field(payload, "location"),
                    str_field(payload, "notes"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "library_loans" => {
            db.execute(
                "INSERT INTO library_loans (id, school_id, copy_id, reader_id, book_id, loan_date,
                     due_date, returned_at, status, loan_condition, notes, created_by,
                     created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
                 ON CONFLICT(id) DO UPDATE SET
                     due_date       = excluded.due_date,
                     returned_at    = excluded.returned_at,
                     status         = excluded.status,
                     loan_condition = excluded.loan_condition,
                     notes          = excluded.notes",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "copy_id"),
                    str_field(payload, "reader_id"),
                    str_field(payload, "book_id"),
                    ts_field(payload, "loan_date"),
                    ts_field(payload, "due_date"),
                    str_field(payload, "returned_at"),
                    str_field(payload, "status").unwrap_or_else(|| "EN_COURS".to_string()),
                    str_field(payload, "loan_condition"),
                    str_field(payload, "notes"),
                    str_field(payload, "created_by"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "library_returns" => {
            db.execute(
                "INSERT INTO library_returns (id, school_id, loan_id, copy_id, reader_id, returned_at,
                     loan_condition, late_days, fine_amount, remarks, handled_by, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
                 ON CONFLICT(id) DO UPDATE SET
                     returned_at    = excluded.returned_at,
                     loan_condition = excluded.loan_condition,
                     late_days      = excluded.late_days,
                     fine_amount    = excluded.fine_amount,
                     remarks        = excluded.remarks",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "loan_id"),
                    str_field(payload, "copy_id"),
                    str_field(payload, "reader_id"),
                    ts_field(payload, "returned_at"),
                    str_field(payload, "loan_condition"),
                    int_field(payload, "late_days").unwrap_or(0),
                    num_field(payload, "fine_amount").unwrap_or(0.0),
                    str_field(payload, "remarks"),
                    str_field(payload, "handled_by"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "library_penalties" => {
            db.execute(
                "INSERT INTO library_penalties (id, school_id, reader_id, loan_id, penalty_type, amount,
                     days_late, description, status, paid_at, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
                 ON CONFLICT(id) DO UPDATE SET
                     penalty_type = excluded.penalty_type,
                     amount       = excluded.amount,
                     days_late    = excluded.days_late,
                     description  = excluded.description,
                     status       = excluded.status,
                     paid_at      = excluded.paid_at",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "reader_id"),
                    str_field(payload, "loan_id"),
                    str_field(payload, "penalty_type").unwrap_or_else(|| "RETARD".to_string()),
                    num_field(payload, "amount").unwrap_or(0.0),
                    int_field(payload, "days_late").unwrap_or(0),
                    str_field(payload, "description"),
                    str_field(payload, "status").unwrap_or_else(|| "EN_ATTENTE".to_string()),
                    str_field(payload, "paid_at"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "library_reservations" => {
            db.execute(
                "INSERT INTO library_reservations (id, school_id, book_id, reader_id, reserved_at,
                     available_at, expires_at, status, queue_position, notified_at, fulfilled_at,
                     loan_id, notes, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
                 ON CONFLICT(id) DO UPDATE SET
                     reserved_at    = excluded.reserved_at,
                     available_at   = excluded.available_at,
                     expires_at     = excluded.expires_at,
                     status         = excluded.status,
                     queue_position = excluded.queue_position,
                     notified_at    = excluded.notified_at,
                     fulfilled_at   = excluded.fulfilled_at,
                     loan_id        = excluded.loan_id,
                     notes          = excluded.notes",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "book_id"),
                    str_field(payload, "reader_id"),
                    ts_field(payload, "reserved_at"),
                    str_field(payload, "available_at"),
                    str_field(payload, "expires_at"),
                    str_field(payload, "status").unwrap_or_else(|| "EN_ATTENTE".to_string()),
                    int_field(payload, "queue_position").unwrap_or(1),
                    str_field(payload, "notified_at"),
                    str_field(payload, "fulfilled_at"),
                    str_field(payload, "loan_id"),
                    str_field(payload, "notes"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "staff" => {
            db.execute(
                "INSERT INTO staff (id,school_id,matricule,nom,prenoms,sexe,date_naissance,lieu_naissance,nationalite,photo_url,situation_matrimoniale,nombre_enfants,telephone_principal,telephone_secondaire,email,adresse,region,prefecture,commune,quartier,urgence_nom,urgence_telephone,type_personnel,fonction,statut_professionnel,matricule_professionnel,categorie,grade,classe_grade,echelon,indice,diplome_academique,diplome_professionnel,specialite,date_recrutement,date_entree_fonction_pub,etablissement,annee_scolaire_id,fonction_etablissement,decision_affectation_num,date_affectation,date_prise_service,date_arrivee_region,date_arrivee_etablissement,ancien_etablissement,service_direction,matiere_principale,matieres_secondaires,classes_principales,volume_horaire_hebdo,est_prof_principal,est_responsable_classe,heures_prevues,heures_effectuees,statut_administratif,date_debut_conge,date_fin_conge,date_disponibilite,date_mutation,date_suspension,date_retraite,date_depart,motif_depart,observations,est_actif,created_by,updated_by,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29,?30,?31,?32,?33,?34,?35,?36,?37,?38,?39,?40,?41,?42,?43,?44,?45,?46,?47,?48,?49,?50,?51,?52,?53,?54,?55,?56,?57,?58,?59,?60,?61,?62,?63,?64,?65,?66,?67,?68,?69) ON CONFLICT(id) DO UPDATE SET school_id=excluded.school_id,matricule=excluded.matricule,nom=excluded.nom,prenoms=excluded.prenoms,sexe=excluded.sexe,date_naissance=excluded.date_naissance,lieu_naissance=excluded.lieu_naissance,nationalite=excluded.nationalite,photo_url=excluded.photo_url,situation_matrimoniale=excluded.situation_matrimoniale,nombre_enfants=excluded.nombre_enfants,telephone_principal=excluded.telephone_principal,telephone_secondaire=excluded.telephone_secondaire,email=excluded.email,adresse=excluded.adresse,region=excluded.region,prefecture=excluded.prefecture,commune=excluded.commune,quartier=excluded.quartier,urgence_nom=excluded.urgence_nom,urgence_telephone=excluded.urgence_telephone,type_personnel=excluded.type_personnel,fonction=excluded.fonction,statut_professionnel=excluded.statut_professionnel,matricule_professionnel=excluded.matricule_professionnel,categorie=excluded.categorie,grade=excluded.grade,classe_grade=excluded.classe_grade,echelon=excluded.echelon,indice=excluded.indice,diplome_academique=excluded.diplome_academique,diplome_professionnel=excluded.diplome_professionnel,specialite=excluded.specialite,date_recrutement=excluded.date_recrutement,date_entree_fonction_pub=excluded.date_entree_fonction_pub,etablissement=excluded.etablissement,annee_scolaire_id=excluded.annee_scolaire_id,fonction_etablissement=excluded.fonction_etablissement,decision_affectation_num=excluded.decision_affectation_num,date_affectation=excluded.date_affectation,date_prise_service=excluded.date_prise_service,date_arrivee_region=excluded.date_arrivee_region,date_arrivee_etablissement=excluded.date_arrivee_etablissement,ancien_etablissement=excluded.ancien_etablissement,service_direction=excluded.service_direction,matiere_principale=excluded.matiere_principale,matieres_secondaires=excluded.matieres_secondaires,classes_principales=excluded.classes_principales,volume_horaire_hebdo=excluded.volume_horaire_hebdo,est_prof_principal=excluded.est_prof_principal,est_responsable_classe=excluded.est_responsable_classe,heures_prevues=excluded.heures_prevues,heures_effectuees=excluded.heures_effectuees,statut_administratif=excluded.statut_administratif,date_debut_conge=excluded.date_debut_conge,date_fin_conge=excluded.date_fin_conge,date_disponibilite=excluded.date_disponibilite,date_mutation=excluded.date_mutation,date_suspension=excluded.date_suspension,date_retraite=excluded.date_retraite,date_depart=excluded.date_depart,motif_depart=excluded.motif_depart,observations=excluded.observations,est_actif=excluded.est_actif,created_by=excluded.created_by,updated_by=excluded.updated_by,created_at=excluded.created_at,updated_at=excluded.updated_at",
                rusqlite::params![
                    id,
                    str_field(payload,"school_id"),
                    str_field(payload,"matricule"),
                    str_field(payload,"nom").unwrap_or_default(),
                    str_field(payload,"prenoms").unwrap_or_default(),
                    str_field(payload,"sexe"),
                    str_field(payload,"date_naissance"),
                    str_field(payload,"lieu_naissance"),
                    str_field(payload,"nationalite"),
                    str_field(payload,"photo_url"),
                    str_field(payload,"situation_matrimoniale"),
                    int_field(payload,"nombre_enfants"),
                    str_field(payload,"telephone_principal"),
                    str_field(payload,"telephone_secondaire"),
                    str_field(payload,"email"),
                    str_field(payload,"adresse"),
                    str_field(payload,"region"),
                    str_field(payload,"prefecture"),
                    str_field(payload,"commune"),
                    str_field(payload,"quartier"),
                    str_field(payload,"urgence_nom"),
                    str_field(payload,"urgence_telephone"),
                    str_field(payload,"type_personnel"),
                    str_field(payload,"fonction"),
                    str_field(payload,"statut_professionnel"),
                    str_field(payload,"matricule_professionnel"),
                    str_field(payload,"categorie"),
                    str_field(payload,"grade"),
                    str_field(payload,"classe_grade"),
                    str_field(payload,"echelon"),
                    int_field(payload,"indice"),
                    str_field(payload,"diplome_academique"),
                    str_field(payload,"diplome_professionnel"),
                    str_field(payload,"specialite"),
                    str_field(payload,"date_recrutement"),
                    str_field(payload,"date_entree_fonction_pub"),
                    str_field(payload,"etablissement"),
                    str_field(payload,"annee_scolaire_id"),
                    str_field(payload,"fonction_etablissement"),
                    str_field(payload,"decision_affectation_num"),
                    str_field(payload,"date_affectation"),
                    str_field(payload,"date_prise_service"),
                    str_field(payload,"date_arrivee_region"),
                    str_field(payload,"date_arrivee_etablissement"),
                    str_field(payload,"ancien_etablissement"),
                    str_field(payload,"service_direction"),
                    str_field(payload,"matiere_principale"),
                    str_field(payload,"matieres_secondaires"),
                    str_field(payload,"classes_principales"),
                    num_field(payload,"volume_horaire_hebdo"),
                    int_field(payload,"est_prof_principal").unwrap_or(0),
                    int_field(payload,"est_responsable_classe").unwrap_or(0),
                    num_field(payload,"heures_prevues"),
                    num_field(payload,"heures_effectuees"),
                    str_field(payload,"statut_administratif").unwrap_or_else(|| "Actif".to_string()),
                    str_field(payload,"date_debut_conge"),
                    str_field(payload,"date_fin_conge"),
                    str_field(payload,"date_disponibilite"),
                    str_field(payload,"date_mutation"),
                    str_field(payload,"date_suspension"),
                    str_field(payload,"date_retraite"),
                    str_field(payload,"date_depart"),
                    str_field(payload,"motif_depart"),
                    str_field(payload,"observations"),
                    int_field(payload,"est_actif").unwrap_or(1),
                    str_field(payload,"created_by"),
                    str_field(payload,"updated_by"),
                    ts_field(payload,"created_at"),
                    ts_field(payload,"updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }

        "subjects" => {
            db.execute(
                "INSERT INTO subjects (id, school_id, name, code, color, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET name=excluded.name, code=excluded.code, color=excluded.color",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "name").unwrap_or_default(),
                    str_field(payload, "code").unwrap_or_default(),
                    str_field(payload, "color"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "grade_types" => {
            db.execute(
                "INSERT INTO grade_types (id, school_id, name, max_score, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET name=excluded.name, max_score=excluded.max_score",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "name").unwrap_or_default(),
                    num_field(payload, "max_score").unwrap_or(20.0),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "grading_periods" => {
            db.execute(
                "INSERT INTO grading_periods (id, school_id, academic_year_id, name, period_order, start_date, end_date, is_active, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET name=excluded.name, period_order=excluded.period_order, start_date=excluded.start_date, end_date=excluded.end_date, is_active=excluded.is_active",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "name").unwrap_or_default(),
                    int_field(payload, "period_order").unwrap_or(1),
                    str_field(payload, "start_date"),
                    str_field(payload, "end_date"),
                    bool_field(payload, "is_active") as i64,
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }

        "class_subjects" => {
            db.execute(
                "INSERT INTO class_subjects (id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, subject_type, is_mandatory, order_index, color_icon, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(id) DO UPDATE SET teacher_id=excluded.teacher_id, coefficient=excluded.coefficient, weekly_hours=excluded.weekly_hours, subject_type=excluded.subject_type, is_mandatory=excluded.is_mandatory, order_index=excluded.order_index, color_icon=excluded.color_icon",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "class_id"),
                    str_field(payload, "subject_id"),
                    str_field(payload, "teacher_id"),
                    num_field(payload, "coefficient").unwrap_or(1.0),
                    num_field(payload, "weekly_hours"),
                    str_field(payload, "subject_type"),
                    int_field(payload, "is_mandatory").unwrap_or(1),
                    int_field(payload, "order_index").unwrap_or(0),
                    str_field(payload, "color_icon"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "teacher_assignments" => {
            db.execute(
                "INSERT INTO teacher_assignments (id, school_id, academic_year_id, teacher_id, class_subject_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET teacher_id=excluded.teacher_id, class_subject_id=excluded.class_subject_id",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "teacher_id").unwrap_or_default(),
                    str_field(payload, "class_subject_id"),
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }
        "grades" => {
            db.execute(
                "INSERT INTO grades (id, school_id, academic_year_id, enrollment_id, student_id, class_subject_id, grading_period_id, grade_type_id, score, max_score, evaluation_date, notes, recorded_by, is_absent, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16) ON CONFLICT(id) DO UPDATE SET score=excluded.score, max_score=excluded.max_score, evaluation_date=excluded.evaluation_date, notes=excluded.notes, is_absent=excluded.is_absent",
                rusqlite::params![
                    id,
                    str_field(payload, "school_id"),
                    str_field(payload, "academic_year_id"),
                    str_field(payload, "enrollment_id"),
                    str_field(payload, "student_id"),
                    str_field(payload, "class_subject_id"),
                    str_field(payload, "grading_period_id"),
                    str_field(payload, "grade_type_id"),
                    num_field(payload, "score").unwrap_or(0.0),
                    num_field(payload, "max_score").unwrap_or(20.0),
                    str_field(payload, "evaluation_date"),
                    str_field(payload, "notes"),
                    str_field(payload, "recorded_by").unwrap_or_default(),
                    bool_field(payload, "is_absent") as i64,
                    ts_field(payload, "created_at"),
                    ts_field(payload, "updated_at"),
                ],
            ).map_err(|e| e.to_string())?;
        }

        _ => {
            // Table non gérée → on l'ignore sans faire échouer la sync
            println!(
                "[Inbox] Table '{}' non supportée pour l'upsert.",
                entity_type
            );
        }
    }

    Ok(())
}

fn soft_delete_entity(db: &Connection, entity_type: &str, entity_id: &str) -> Result<(), String> {
    // Supprimer les dépendances d'abord selon le type d'entité
    match entity_type {
        "academic_years" => {
            db.execute(
                "DELETE FROM enrollment_history WHERE academic_year_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
            db.execute(
                "DELETE FROM enrollments WHERE academic_year_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
            db.execute(
                "DELETE FROM classes WHERE academic_year_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "classes" => {
            db.execute(
                "UPDATE enrollments SET class_id = NULL WHERE class_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "enrollments" => {
            db.execute(
                "DELETE FROM enrollment_history WHERE enrollment_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "fee_structures" => {
            // Les paiements liés ne sont pas supprimés automatiquement
        }
        "subjects" => {
            db.execute("DELETE FROM grades WHERE class_subject_id IN (SELECT id FROM class_subjects WHERE subject_id = ?1)", rusqlite::params![entity_id]).map_err(|e| e.to_string())?;
            db.execute("DELETE FROM teacher_assignments WHERE class_subject_id IN (SELECT id FROM class_subjects WHERE subject_id = ?1)", rusqlite::params![entity_id]).map_err(|e| e.to_string())?;
            db.execute(
                "DELETE FROM class_subjects WHERE subject_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "grade_types" => {
            db.execute(
                "DELETE FROM grades WHERE grade_type_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "grading_periods" => {
            db.execute(
                "DELETE FROM grades WHERE grading_period_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "class_subjects" => {
            db.execute(
                "DELETE FROM teacher_assignments WHERE class_subject_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
            db.execute(
                "DELETE FROM grades WHERE class_subject_id = ?1",
                rusqlite::params![entity_id],
            )
            .map_err(|e| e.to_string())?;
        }
        "staff" => {
            // Pas de suppression en cascade côté client; l'isolation est garantie par school_id
        }

        _ => {}
    }

    // Supprimer l'entité elle-même
    let table = entity_type;
    let sql = format!("DELETE FROM {} WHERE id = ?1", table);
    db.execute(&sql, rusqlite::params![entity_id])
        .map_err(|e| format!("Erreur DELETE {}/{}: {}", entity_type, entity_id, e))?;

    println!("[Inbox] ✓ DELETE {}/{} appliqué.", entity_type, entity_id);
    Ok(())
}

// ──────────────────────────────────────────────
// Helpers SQLite
// ──────────────────────────────────────────────

fn load_pending_mutations(
    db_path: &PathBuf,
) -> Result<Vec<(String, String, String, String, i64)>, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    // Les parents (année scolaire, classe) doivent partir avant leurs enfants
    // (élève, inscription), sinon PostgreSQL rejette l'enfant sur la clé étrangère.
    let mut stmt = db
        .prepare(
            "SELECT id, entity_type, operation, payload, COALESCE(attempt_count, 0)
         FROM pending_mutations
          WHERE status = 'PENDING'
            AND COALESCE(attempt_count, 0) < 5
            AND (
                last_attempt_at IS NULL
                OR (julianday('now') - julianday(last_attempt_at)) * 86400.0 >=
                    CASE COALESCE(attempt_count, 0)
                        WHEN 0 THEN 0
                        WHEN 1 THEN 0
                        WHEN 2 THEN 2
                        WHEN 3 THEN 5
                        WHEN 4 THEN 10
                        ELSE 30
                    END
            )
         ORDER BY
           -- Pour les INSERT/UPSERT : parents d'abord (school → enrollments)
           -- Pour les DELETE : enfants d'abord (enrollments → school)
            CASE WHEN operation = 'DELETE' THEN
              CASE entity_type
                WHEN 'enrollment_history' THEN 0
                WHEN 'library_returns' THEN 0
                WHEN 'library_penalties' THEN 0
                WHEN 'library_reservations' THEN 0
                WHEN 'grades' THEN 0
                WHEN 'teacher_assignments' THEN 0
                WHEN 'class_subjects' THEN 1
                WHEN 'grading_periods' THEN 1
                WHEN 'grade_types' THEN 2
                WHEN 'subjects' THEN 2
                WHEN 'staff' THEN 4
                WHEN 'enrollments' THEN 1
                WHEN 'payments' THEN 1
                WHEN 'library_loans' THEN 2
                WHEN 'fee_structures' THEN 2
                WHEN 'library_copies' THEN 3
                WHEN 'library_readers' THEN 3
                WHEN 'students' THEN 4
                WHEN 'classes' THEN 4
                WHEN 'series' THEN 5
                WHEN 'levels' THEN 5
                WHEN 'sections' THEN 5
                WHEN 'library_books' THEN 5
                WHEN 'academic_years' THEN 5
                WHEN 'library_categories' THEN 6
                WHEN 'schools' THEN 7
                WHEN 'school' THEN 7
                ELSE 8
              END
            ELSE
              CASE entity_type
                WHEN 'schools' THEN 0
                WHEN 'school' THEN 0
                WHEN 'sections' THEN 1
                WHEN 'levels' THEN 2
                WHEN 'series' THEN 2
                WHEN 'academic_years' THEN 1
                WHEN 'classes' THEN 3
                WHEN 'staff' THEN 3
                WHEN 'students' THEN 4
                WHEN 'enrollments' THEN 5
                WHEN 'enrollment_history' THEN 6
                WHEN 'fee_structures' THEN 7
                WHEN 'payments' THEN 8
                WHEN 'subjects' THEN 7
                WHEN 'grade_types' THEN 7
                WHEN 'grading_periods' THEN 8
                WHEN 'class_subjects' THEN 8
                WHEN 'teacher_assignments' THEN 8
                WHEN 'grades' THEN 9
                WHEN 'library_categories' THEN 10
                WHEN 'library_books' THEN 11
                WHEN 'library_readers' THEN 11
                WHEN 'library_copies' THEN 12
                WHEN 'library_loans' THEN 13
                WHEN 'library_returns' THEN 14
                WHEN 'library_penalties' THEN 14
                WHEN 'library_reservations' THEN 14
                ELSE 8
              END
            END,
           created_at ASC
         LIMIT 20",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(Result::ok).collect())
}

fn mark_mutation(db_path: &PathBuf, id: &str, status: &str, error: Option<&str>) {
    if let Ok(db) = Connection::open(db_path) {
        let synced_at = if status == "SYNCED" {
            Some("CURRENT_TIMESTAMP")
        } else {
            None
        };
        let _ = db.execute(
            "UPDATE pending_mutations SET status = ?1, last_error = ?2, synced_at = CASE WHEN ?3 = 1 THEN CURRENT_TIMESTAMP ELSE synced_at END WHERE id = ?4",
            rusqlite::params![status, error, synced_at.is_some() as i32, id],
        );
    }
}

fn mark_mutation_error(db_path: &PathBuf, id: &str, error: &str) {
    if let Ok(db) = Connection::open(db_path) {
        let _ = db.execute(
            "UPDATE pending_mutations SET last_error = ?1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?2",
            rusqlite::params![error, id],
        );
    }
}

fn increment_attempt(db_path: &PathBuf, id: &str) {
    if let Ok(db) = Connection::open(db_path) {
        let _ = db.execute(
            "UPDATE pending_mutations SET attempt_count = COALESCE(attempt_count, 0) + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = ?1",
            rusqlite::params![id],
        );
    }
}

/// Enregistre un lot d'enregistrements entrants dans sync_inbox au sein d'une transaction unique.
/// Idempotent : ignore les enregistrements déjà en attente de traitement (status = 'PENDING').
fn store_inbox_items(db_path: &PathBuf, entity_type: &str, rows: &[Value]) -> bool {
    if rows.is_empty() {
        return true;
    }
    let db = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[Inbox] Impossible d'ouvrir SQLite : {}", e);
            return false;
        }
    };

    let mut ok = true;
    let _ = db.execute_batch("BEGIN TRANSACTION;");
    for row in rows {
        // store_inbox_item_conn does not return status; check insertion by re-running is costly.
        // We track only connection-level failures here.
        store_inbox_item_conn(&db, entity_type, row);
    }
    if db.execute_batch("COMMIT;").is_err() {
        ok = false;
    }
    ok
}

fn store_inbox_item_conn(db: &Connection, entity_type: &str, row: &Value) {
    let entity_id = row
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if entity_id.is_empty() {
        return;
    }
    let school_id = row
        .get("school_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let payload = serde_json::to_string(row).unwrap_or_default();
    let remote_id = entity_id.clone();

    // Idempotence : ne pas insérer de doublon si déjà présent en PENDING
    let exists: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_inbox WHERE remote_id = ?1 AND entity_type = ?2 AND status = 'PENDING'",
        rusqlite::params![remote_id, entity_type],
        |row| row.get(0),
    ).unwrap_or(0);

    if exists > 0 {
        return;
    }

    let id = uuid::Uuid::new_v4().to_string();
    if let Err(e) = db.execute(
        "INSERT INTO sync_inbox (id, remote_id, school_id, entity_type, entity_id, operation, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, 'UPDATE', ?6)",
        rusqlite::params![id, remote_id, school_id, entity_type, entity_id, payload],
    ) {
        eprintln!("[Inbox] Erreur insertion sync_inbox ({}/{}): {}", entity_type, remote_id, e);
    }
}

#[allow(dead_code)]
fn store_inbox_item(db_path: &PathBuf, entity_type: &str, row: &Value) {
    store_inbox_items(db_path, entity_type, std::slice::from_ref(row));
}

/// Garantit qu'une ligne d'état existe avant toute lecture ou écriture.
/// Sans cette ligne, tous les `UPDATE sync_state` sont des no-ops : le statut
/// retombait sur "IDLE", `last_sync_at` restait nul et `last_error` jamais
/// renseigné — le bouton « Synchroniser » n'affichait donc jamais rien.
fn ensure_sync_state(db_path: &PathBuf) {
    let Ok(db) = Connection::open(db_path) else {
        return;
    };

    let exists: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM sync_state WHERE id = ?1",
            rusqlite::params![SYNC_STATE_ID],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if exists > 0 {
        return;
    }

    let school_id: String = db
        .query_row(
            "SELECT id FROM schools ORDER BY created_at ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "school-1".to_string());
    let device_id: String = db
        .query_row(
            "SELECT id FROM devices ORDER BY last_seen_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| SYNC_STATE_ID.to_string());

    let _ = db.execute(
        "INSERT OR REPLACE INTO sync_state (id, school_id, device_id, engine_status)
         VALUES (?1, ?2, ?3, 'IDLE')",
        rusqlite::params![SYNC_STATE_ID, school_id, device_id],
    );
}

fn update_engine_status(db_path: &PathBuf, status: &str, error: Option<&str>) {
    if let Ok(db) = Connection::open(db_path) {
        let _ = db.execute(
            "UPDATE sync_state SET engine_status = ?1, last_error = ?2,
                    last_error_at = CASE WHEN ?2 IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
                    updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
            rusqlite::params![status, error, SYNC_STATE_ID],
        );
    }
}

fn update_last_sync_timestamp(db_path: &PathBuf) {
    if let Ok(db) = Connection::open(db_path) {
        let _ = db.execute(
            "UPDATE sync_state SET last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            rusqlite::params![SYNC_STATE_ID],
        );
    }
}

fn load_inbound_cursor(db_path: &PathBuf) -> Option<String> {
    let db = Connection::open(db_path).ok()?;
    db.query_row(
        "SELECT inbound_cursor FROM sync_state WHERE id = ?1",
        rusqlite::params![SYNC_STATE_ID],
        |row| row.get(0),
    )
    .ok()
    .flatten()
}

fn save_inbound_cursor(db_path: &PathBuf, cursor: &str) {
    if let Ok(db) = Connection::open(db_path) {
        let _ = db.execute(
            "UPDATE sync_state SET inbound_cursor = ?1, last_inbound_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2",
            rusqlite::params![cursor, SYNC_STATE_ID],
        );
    }
}

/// Remet à zéro le compteur de tentatives des mutations définitivement
/// échouées. Appelé au début d'une synchronisation manuelle : l'utilisateur
/// demande explicitement de rejouer la file, donc on ne le laisse pas bloqué
/// indéfiniment par la limite de 5 tentatives.
fn reset_exhausted_mutations(db_path: &PathBuf) -> usize {
    let Ok(db) = Connection::open(db_path) else {
        return 0;
    };
    let count = db
        .execute(
            "UPDATE pending_mutations
             SET status = 'PENDING', attempt_count = 0, last_error = NULL
             WHERE status = 'FAILED'",
            [],
        )
        .unwrap_or(0);
    if count > 0 {
        println!("[Outbox] {} mutation(s) remise(s) en file.", count);
    }
    count
}

/// Empêche d'envoyer une mutation enfant alors qu'une mutation parente est
/// encore en attente ou en échec : l'envoi de l'enfant échouerait sur la clé
/// étrangère et resterait en FAILED définitivement, alors que la cause réelle
/// est chez le parent.
fn blocking_parents(db_path: &PathBuf, entity_type: &str) -> Vec<String> {
    let Ok(db) = Connection::open(db_path) else {
        return Vec::new();
    };
    let Some((_, rank)) = DEPENDENCY_ORDER.iter().find(|(t, _)| *t == entity_type) else {
        return Vec::new();
    };

    let mut stmt = match db.prepare(
        "SELECT DISTINCT entity_type FROM pending_mutations
         WHERE status = 'PENDING'
           AND COALESCE(attempt_count, 0) < 5
           AND entity_type != ?1",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let rows = match stmt.query_map([], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    rows.filter_map(Result::ok)
        .filter(|t| {
            DEPENDENCY_ORDER
                .iter()
                .any(|(name, parent_rank)| name == t && parent_rank < rank)
        })
        .collect()
}

fn str_field<'a>(payload: &'a Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Champ numérique du payload (accepte un entier JSON comme un flottant).
fn num_field(payload: &Value, key: &str) -> Option<f64> {
    payload.get(key).and_then(|v| v.as_f64())
}

/// Champ entier du payload (accepte aussi les booléens true -> 1, false -> 0 renvoyés par PostgreSQL).
fn int_field(payload: &Value, key: &str) -> Option<i64> {
    payload.get(key).and_then(|v| {
        v.as_i64()
            .or_else(|| v.as_f64().map(|f| f as i64))
            .or_else(|| v.as_bool().map(|b| if b { 1 } else { 0 }))
    })
}

/// Champ booléen du payload (PostgreSQL renvoie true/false).
fn bool_field(payload: &Value, key: &str) -> bool {
    payload.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Horodatage du payload, ou l'instant présent si absent.
fn ts_field(payload: &Value, key: &str) -> String {
    str_field(payload, key).unwrap_or_else(now_iso)
}

/// Horodatage ISO courant.
fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    format_iso(secs)
}

/// Convertit un nombre de jours depuis l'époque Unix en date civile
/// (algorithme de Howard Hinnant). Évite d'ajouter chrono au binaire.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (y + i64::from(m <= 2), m, d)
}

/// Horodatage ISO 8601 UTC, format attendu par le filtre PostgREST
/// `updated_at=gt.<cursor>`. L'ancienne version renvoyait des secondes epoch,
/// ce qui produisait une requête invalide dès que le curseur était persisté.
fn format_iso(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Curseur de synchronisation entrante, reculée de `LAG_SECONDS` pour ne pas
/// rater les lignes écrites dans la même seconde que le curseur (l'horloge
/// locale n'est pas garantie alignée sur celle de Supabase).
const CURSOR_LAG_SECONDS: i64 = 5;

fn inbound_cursor() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    format_iso(secs - CURSOR_LAG_SECONDS)
}

/// Résume les mutations restées en échec après un cycle, avec la cause la plus
/// parlante. Alimente `last_error` pour que l'interface remonte enfin le problème.
fn residual_failure_summary(db_path: &PathBuf) -> Option<String> {
    let db = Connection::open(db_path).ok()?;
    let failed: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM pending_mutations WHERE status = 'FAILED'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if failed == 0 {
        return None;
    }

    let top_error: Option<String> = db
        .query_row(
            "SELECT last_error FROM pending_mutations
             WHERE status = 'FAILED' AND last_error IS NOT NULL
             GROUP BY last_error ORDER BY COUNT(*) DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    match top_error {
        Some(e) if e.len() > 300 => Some(format!(
            "{} mutation(s) en échec — {}…",
            failed,
            e.chars().take(300).collect::<String>()
        )),
        Some(e) => Some(format!("{} mutation(s) en échec — {}", failed, e)),
        None => Some(format!(
            "{} mutation(s) en échec après épuisement des tentatives. Utilisez « Réessayer ».",
            failed
        )),
    }
}

// ──────────────────────────────────────────────
// Commandes Tauri exposées à l'interface React
// ──────────────────────────────────────────────

/// Remet en file les mutations définitivement échouées, sans effectuer de
/// synchronisation. Appelé par le bouton « Réessayer ».
pub fn retry_failed_mutations_internal(db_path: &PathBuf) -> Result<usize, String> {
    ensure_sync_state(db_path);
    Ok(reset_exhausted_mutations(db_path))
}

/// Synchronisation manuelle déclenchée par le bouton utilisateur
pub async fn run_manual_sync(db_path: PathBuf) -> Result<SyncStatus, String> {
    let (supabase_url, supabase_anon_key) = get_supabase_config()?;

    if supabase_url.is_empty() || supabase_anon_key.is_empty() {
        return Err("Configuration Supabase absente. Vérifiez le fichier .env.".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // L'utilisateur demande explicitement de rejouer la file : on débloque les
    // mutations qui avaient atteint la limite de 5 tentatives.
    ensure_sync_state(&db_path);
    reset_exhausted_mutations(&db_path);

    // Utiliser le JWT utilisateur courant pour que RLS s'applique correctement.
    let access_token = current_sync_access_token();
    run_sync_cycle(
        &db_path,
        &client,
        &supabase_url,
        &supabase_anon_key,
        access_token.as_deref(),
    )
    .await;

    get_sync_status_internal(&db_path)
}

/// Lecture de l'état du moteur pour l'affichage dans l'interface
pub fn get_sync_status_internal(db_path: &PathBuf) -> Result<SyncStatus, String> {
    ensure_sync_state(db_path);
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;

    let pending_count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM pending_mutations WHERE status = 'PENDING'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let failed_count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM pending_mutations WHERE status = 'FAILED'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let conflict_count: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM sync_inbox WHERE status = 'CONFLICT'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let inbox_pending: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM sync_inbox WHERE status = 'PENDING'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let (engine_status, last_sync_at, last_error): (String, Option<String>, Option<String>) = db
        .query_row(
            "SELECT engine_status, last_sync_at, last_error FROM sync_state WHERE id = ?1",
            rusqlite::params![SYNC_STATE_ID],
            |row| {
                Ok((
                    row.get::<_, String>(0)
                        .unwrap_or_else(|_| "IDLE".to_string()),
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .unwrap_or_else(|_| ("IDLE".to_string(), None, None));

    Ok(SyncStatus {
        // L'état n'est connu qu'à la suite d'un cycle : avant le premier cycle
        // on ne peut pas affirmer que Supabase est joignable, on ne déclare donc
        // pas la connexion unavailable.
        is_online: engine_status != "OFFLINE",
        engine_status,
        last_sync_at,
        pending_count,
        failed_count,
        conflict_count,
        inbox_pending,
        last_error,
    })
}

/// Récupérer la liste des mutations en attente (pour l'affichage)
pub fn get_pending_mutations_internal(db_path: &PathBuf) -> Result<Vec<PendingMutation>, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, school_id, entity_type, entity_id, operation, status,
                COALESCE(attempt_count, 0), created_at, last_error
         FROM pending_mutations
         WHERE status IN ('PENDING', 'FAILED', 'SYNCING')
         ORDER BY created_at DESC
         LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(PendingMutation {
                id: row.get(0)?,
                school_id: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                operation: row.get(4)?,
                status: row.get(5)?,
                attempt_count: row.get(6)?,
                created_at: row.get(7)?,
                last_error: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(Result::ok).collect())
}

/// Récupérer les conflits nécessitant une résolution manuelle
pub fn get_conflicts_internal(db_path: &PathBuf) -> Result<Vec<InboxConflict>, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, entity_type, entity_id, operation, conflict_data, payload, received_at
         FROM sync_inbox
         WHERE status = 'CONFLICT'
         ORDER BY received_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let payload_str: String = row.get(5)?;
            let remote_data: Value = serde_json::from_str(&payload_str).unwrap_or(Value::Null);
            let conflict_str: Option<String> = row.get(4)?;
            let local_data: Option<Value> = conflict_str
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            Ok(InboxConflict {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                operation: row.get(3)?,
                local_data,
                remote_data,
                received_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(Result::ok).collect())
}

/// Résolution manuelle d'un conflit
/// `choice` : "LOCAL" (garder local) ou "REMOTE" (appliquer distant)
pub fn resolve_conflict_internal(
    db_path: &PathBuf,
    inbox_id: &str,
    choice: &str,
) -> Result<(), String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;

    match choice {
        "REMOTE" => {
            // Récupérer le payload et l'appliquer
            let (entity_type, payload_str): (String, String) = db
                .query_row(
                    "SELECT entity_type, payload FROM sync_inbox WHERE id = ?1",
                    rusqlite::params![inbox_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|_| "Conflit introuvable.".to_string())?;

            let payload: Value = serde_json::from_str(&payload_str)
                .map_err(|e| format!("Payload invalide : {}", e))?;

            upsert_entity(&db, &entity_type, &payload)?;

            db.execute(
                "UPDATE sync_inbox SET status = 'APPLIED', applied_at = CURRENT_TIMESTAMP WHERE id = ?1",
                rusqlite::params![inbox_id],
            ).map_err(|e| e.to_string())?;
        }
        "LOCAL" => {
            // Garder la version locale → on marque le conflit comme ignoré
            db.execute(
                "UPDATE sync_inbox SET status = 'SKIPPED' WHERE id = ?1",
                rusqlite::params![inbox_id],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => return Err("Choix invalide. Utilisez 'LOCAL' ou 'REMOTE'.".to_string()),
    }

    Ok(())
}

/// Remettre tous les conflits en PENDING pour retraitement
/// (la nouvelle logique basée sur l'horodatage les résoudra automatiquement)
pub fn purge_all_conflicts_internal(db_path: &PathBuf) -> Result<usize, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    // On remet en PENDING plutôt que de supprimer : la nouvelle logique
    // check_and_resolve_conflict comparera les horodatages et appliquera
    // automatiquement la bonne version (LOCAL ou REMOTE) sans intervention.
    let reset = db
        .execute(
            "UPDATE sync_inbox SET status = 'PENDING' WHERE status = 'CONFLICT'",
            [],
        )
        .map_err(|e| e.to_string())?;
    println!(
        "[Sync] {} conflit(s) remis en PENDING pour retraitement automatique",
        reset
    );
    Ok(reset)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use serde_json::json;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;
    use tokio::runtime::Runtime;

    struct TempTestDir(PathBuf);
    impl Drop for TempTestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn setup_test_db() -> (TempTestDir, PathBuf) {
        let temp_dir =
            std::env::temp_dir().join(format!("orion_test_sync_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("test.db");
        {
            let conn = Connection::open(&db_path).unwrap();
            crate::db::run_migrations(&conn).unwrap();
            let _ = conn.execute(
                "INSERT OR IGNORE INTO schools (id, name) VALUES ('school-1', 'School 1')",
                [],
            );
            let _ = conn.execute("INSERT OR IGNORE INTO schools (id, name) VALUES ('school-sync-1', 'School Sync 1')", []);
            let _ = conn.execute("INSERT OR IGNORE INTO schools (id, name) VALUES ('school-sync-1000', 'School Sync 1000')", []);
            let _ = conn.execute(
                "INSERT OR IGNORE INTO schools (id, name) VALUES ('school-idem', 'School Idem')",
                [],
            );
            let _ = conn.execute(
                "INSERT OR IGNORE INTO schools (id, name) VALUES ('school-fail', 'School Fail')",
                [],
            );
            let _ = conn.execute("INSERT OR IGNORE INTO academic_years (id, school_id, name) VALUES ('ay-1', 'school-sync-1', '2025-2026')", []);
            let _ = conn.execute("INSERT OR IGNORE INTO academic_years (id, school_id, name) VALUES ('ay-1000', 'school-sync-1000', '2025-2026')", []);
            let _ = conn.execute("INSERT OR IGNORE INTO academic_years (id, school_id, name) VALUES ('ay-idem', 'school-idem', '2025-2026')", []);
        }
        ensure_sync_state(&db_path);
        (TempTestDir(temp_dir), db_path)
    }

    fn spawn_mock_server<F>(handler: F) -> (String, Arc<AtomicBool>, thread::JoinHandle<()>)
    where
        F: Fn(&str) -> (u16, String) + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind TCP listener");
        let port = listener.local_addr().unwrap().port();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_clone = stop.clone();
        let handler = Arc::new(handler);

        // Non-blocking listener pour pouvoir vérifier stop_flag
        listener.set_nonblocking(true).unwrap();

        let handle = thread::spawn(move || {
            while !stop_clone.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let h = handler.clone();
                        // Un thread par connexion pour paralléliser les réponses
                        thread::spawn(move || {
                            let mut stream = stream;
                            let _ = stream.set_nonblocking(false);
                            let _ = stream.set_read_timeout(Some(Duration::from_millis(3000)));
                            let _ = stream.set_write_timeout(Some(Duration::from_millis(3000)));
                            let mut buf = [0u8; 65536];
                            let mut total_req = Vec::new();
                            loop {
                                match stream.read(&mut buf) {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        total_req.extend_from_slice(&buf[..n]);
                                        if total_req.windows(4).any(|w| w == b"\r\n\r\n") {
                                            break;
                                        }
                                    }
                                    Err(_) => break,
                                }
                            }
                            if total_req.is_empty() {
                                return;
                            }
                            let req_str = String::from_utf8_lossy(&total_req);
                            let first_line = req_str.lines().next().unwrap_or("");
                            let (status_code, body) = h(first_line);
                            let status_text = match status_code {
                                200 => "OK",
                                404 => "Not Found",
                                500 => "Internal Server Error",
                                _ => "Response",
                            };
                            let response = format!(
                                "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                status_code, status_text, body.len(), body
                            );
                            let _ = stream.write_all(response.as_bytes());
                            let _ = stream.flush();
                        });
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(_) => break,
                }
            }
        });

        // Courte pause pour laisser le thread démarrer
        thread::sleep(Duration::from_millis(30));

        (format!("http://127.0.0.1:{}", port), stop, handle)
    }

    fn parse_query_param(url_line: &str, param: &str) -> Option<usize> {
        let key = format!("{}=", param);
        if let Some(pos) = url_line.find(&key) {
            let rest = &url_line[pos + key.len()..];
            let end = rest
                .find(|c: char| !c.is_ascii_digit())
                .unwrap_or(rest.len());
            rest[..end].parse::<usize>().ok()
        } else {
            None
        }
    }

    #[test]
    fn test_pagination_more_than_500_rows() {
        let (_guard, db_path) = setup_test_db();
        let total_rows = 650usize;

        // Génération de 650 enregistrements pour la table classes
        let mut all_classes = Vec::with_capacity(total_rows);
        for i in 0..total_rows {
            all_classes.push(json!({
                "id": format!("class-test-500-{:04}", i),
                "school_id": "school-sync-1",
                "academic_year_id": "ay-1",
                "name": format!("Classe 500-{:04}", i),
                "level": "CE1",
                "updated_at": format!("2026-02-01T{:02}:{:02}:{:02}Z", (i / 3600) % 24, (i / 60) % 60, i % 60)
            }));
        }

        let classes_data = Arc::new(all_classes);
        let classes_clone = classes_data.clone();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(move |line| {
            if line.contains("/rest/v1/classes") {
                // Vérifier la présence du tri déterministe et de la pagination
                assert!(
                    line.contains("order=updated_at.asc,id.asc"),
                    "Tri déterministe absent: {}",
                    line
                );
                assert!(
                    line.contains(&format!("limit={}", INBOUND_PAGE_SIZE)),
                    "Limit absent ou erroné: {}",
                    line
                );

                let offset = parse_query_param(line, "offset").unwrap_or(0);
                if offset >= classes_clone.len() {
                    (200, "[]".to_string())
                } else {
                    let end = std::cmp::min(offset + INBOUND_PAGE_SIZE, classes_clone.len());
                    let slice = &classes_clone[offset..end];
                    (200, serde_json::to_string(slice).unwrap())
                }
            } else {
                // Toutes les autres tables renvoient une liste vide
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let result = Runtime::new().unwrap().block_on(async {
            process_inbox(
                &db_path,
                &client,
                &mock_url,
                "test_anon_key",
                "test_jwt_token",
            )
            .await
        });

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();

        assert!(result.is_ok(), "process_inbox a échoué: {:?}", result);

        // Vérification dans SQLite : exactement 650 lignes sans doublon
        let conn = Connection::open(&db_path).unwrap();
        let total_count: usize = conn
            .query_row("SELECT COUNT(*) FROM classes", [], |r| r.get::<_, i64>(0))
            .unwrap() as usize;
        let distinct_count: usize = conn
            .query_row("SELECT COUNT(DISTINCT id) FROM classes", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap() as usize;
        assert_eq!(
            total_count, 650,
            "Le nombre total de classes récupérées doit être 650"
        );
        assert_eq!(
            distinct_count, 650,
            "Aucun doublon d'id ne doit être présent"
        );

        // sync_inbox doit avoir appliqué tous les items
        let pending_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_inbox WHERE status = 'PENDING'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap() as usize;
        assert_eq!(
            pending_count, 0,
            "Tous les items de sync_inbox doivent être appliqués"
        );

        let applied_count: usize = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_inbox WHERE status = 'APPLIED'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap() as usize;
        assert_eq!(
            applied_count, 650,
            "Exactement 650 items doivent être passés au statut APPLIED"
        );

        // Curseur sauvegardé et non vide
        let cursor = load_inbound_cursor(&db_path).unwrap();
        assert!(
            !cursor.is_empty(),
            "Le curseur entrant doit être mis à jour après succès"
        );
    }

    #[test]
    fn test_pagination_more_than_1000_rows() {
        let (_guard, db_path) = setup_test_db();
        let total_rows = 1250usize;

        // Génération de 1250 enregistrements (nécessite 3 pages : 500, 500, 250)
        let mut all_classes = Vec::with_capacity(total_rows);
        for i in 0..total_rows {
            all_classes.push(json!({
                "id": format!("class-test-1000-{:04}", i),
                "school_id": "school-sync-1000",
                "academic_year_id": "ay-1",
                "name": format!("Classe 1000-{:04}", i),
                "level": "CM2",
                "updated_at": format!("2026-03-01T{:02}:{:02}:{:02}Z", (i / 3600) % 24, (i / 60) % 60, i % 60)
            }));
        }

        let classes_data = Arc::new(all_classes);
        let classes_clone = classes_data.clone();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(move |line| {
            if line.contains("/rest/v1/classes") {
                assert!(line.contains("order=updated_at.asc,id.asc"));
                assert!(line.contains(&format!("limit={}", INBOUND_PAGE_SIZE)));

                let offset = parse_query_param(line, "offset").unwrap_or(0);
                if offset >= classes_clone.len() {
                    (200, "[]".to_string())
                } else {
                    let end = std::cmp::min(offset + INBOUND_PAGE_SIZE, classes_clone.len());
                    let slice = &classes_clone[offset..end];
                    (200, serde_json::to_string(slice).unwrap())
                }
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let result = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon_key", "jwt_token").await
        });

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();

        assert!(
            result.is_ok(),
            "process_inbox pour 1250 lignes a échoué: {:?}",
            result
        );

        let conn = Connection::open(&db_path).unwrap();
        let total_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM classes", [], |r| r.get::<_, i64>(0))
            .unwrap();
        let distinct_count: i64 = conn
            .query_row("SELECT COUNT(DISTINCT id) FROM classes", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(
            total_count, 1250,
            "Le total doit être exactement de 1250 classes"
        );
        assert_eq!(
            distinct_count, 1250,
            "Aucun doublon ne doit exister sur 1250 enregistrements"
        );

        let pending_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sync_inbox WHERE status = 'PENDING'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap();
        assert_eq!(
            pending_count, 0,
            "Toutes les 1250 lignes doivent être appliquées"
        );
    }

    #[test]
    fn test_pagination_idempotence_no_duplicates_on_resync() {
        let (_guard, db_path) = setup_test_db();
        let total_rows = 600usize;

        let mut all_classes = Vec::with_capacity(total_rows);
        for i in 0..total_rows {
            all_classes.push(json!({
                "id": format!("class-idem-{:04}", i),
                "school_id": "school-idem",
                "academic_year_id": "ay-idem",
                "name": format!("Classe Idem-{:04}", i),
                "level": "6eme",
                "updated_at": format!("2026-04-01T{:02}:{:02}:{:02}Z", (i / 3600) % 24, (i / 60) % 60, i % 60)
            }));
        }

        let classes_data = Arc::new(all_classes);
        let classes_clone = classes_data.clone();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(move |line| {
            if line.contains("/rest/v1/classes") {
                let offset = parse_query_param(line, "offset").unwrap_or(0);
                if offset >= classes_clone.len() {
                    (200, "[]".to_string())
                } else {
                    let end = std::cmp::min(offset + INBOUND_PAGE_SIZE, classes_clone.len());
                    let slice = &classes_clone[offset..end];
                    (200, serde_json::to_string(slice).unwrap())
                }
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();

        // 1ère synchronisation
        let res1 = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon_key", "jwt_token").await
        });
        assert!(res1.is_ok());

        // 2ème synchronisation avec les mêmes données (pour tester l'idempotence et l'absence de doublons)
        let res2 = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon_key", "jwt_token").await
        });
        assert!(res2.is_ok());

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();

        let conn = Connection::open(&db_path).unwrap();
        let total_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM classes", [], |r| r.get::<_, i64>(0))
            .unwrap();
        let distinct_count: i64 = conn
            .query_row("SELECT COUNT(DISTINCT id) FROM classes", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(
            total_count, 600,
            "Après re-sync, le compte de classes doit rester exactement 600"
        );
        assert_eq!(
            distinct_count, 600,
            "Aucun doublon ne doit avoir été créé lors de la ré-exécution"
        );
    }

    #[test]
    fn test_pagination_failure_does_not_advance_cursor() {
        let (_guard, db_path) = setup_test_db();
        let initial_cursor = "2026-01-01T00:00:00Z";
        save_inbound_cursor(&db_path, initial_cursor);

        // Simulation d'une panne serveur HTTP 500 sur la 2ème page (offset 500)
        let (mock_url, stop_flag, server_handle) = spawn_mock_server(|line| {
            if line.contains("/rest/v1/academic_years") {
                let offset = parse_query_param(line, "offset").unwrap_or(0);
                if offset == 0 {
                    // Page 1 retourne 500 éléments
                    let mut page = Vec::with_capacity(500);
                    for i in 0..500 {
                        page.push(json!({
                            "id": format!("ay-fail-{:04}", i),
                            "school_id": "school-fail",
                            "name": format!("AY {}", i),
                            "updated_at": "2026-05-01T00:00:00Z"
                        }));
                    }
                    (200, serde_json::to_string(&page).unwrap())
                } else {
                    // Page 2 : panne HTTP 500
                    (500, "{\"error\": \"Internal server error\"}".to_string())
                }
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let result = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon_key", "jwt_token").await
        });

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();

        assert!(
            result.is_err(),
            "Le cycle doit échouer si une page renvoie une erreur serveur 500"
        );

        // Vérification cruciale : le curseur de synchronisation entrant N'A PAS été avancé
        let cursor_after = load_inbound_cursor(&db_path).unwrap();
        assert_eq!(
            cursor_after, initial_cursor,
            "En cas d'échec sur une page intermédiaire, le curseur entrant ne doit pas être avancé afin d'éviter toute perte de données"
        );
    }
    #[test]
    fn test_upsert_subjects_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        let payload = json!({"id":"subject-test-1","school_id":"school-sync-1","name":"Mathématiques","code":"MATH","color":"#123456","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "subjects", &payload).unwrap();
        let code: String = conn
            .query_row(
                "SELECT code FROM subjects WHERE id = 'subject-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(code, "MATH");
        let other = json!({"id":"subject-test-2","school_id":"school-sync-1000","name":"Français","code":"FR","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "subjects", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM subjects WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM subjects WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_upsert_grade_types_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        let payload = json!({"id":"gt-test-1","school_id":"school-sync-1","name":"Examen","max_score":20.0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grade_types", &payload).unwrap();
        let max_score: f64 = conn
            .query_row(
                "SELECT max_score FROM grade_types WHERE id = 'gt-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(max_score, 20.0);
        let other = json!({"id":"gt-test-2","school_id":"school-sync-1000","name":"Contrôle","max_score":20.0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grade_types", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM grade_types WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM grade_types WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_upsert_grading_periods_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        let payload = json!({"id":"gp-test-1","school_id":"school-sync-1","academic_year_id":"ay-1","name":"Trimestre 1","period_order":1,"is_active":true,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grading_periods", &payload).unwrap();
        let period_order: i64 = conn
            .query_row(
                "SELECT period_order FROM grading_periods WHERE id = 'gp-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let is_active: i64 = conn
            .query_row(
                "SELECT is_active FROM grading_periods WHERE id = 'gp-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(period_order, 1);
        assert_eq!(is_active, 1);
        let other = json!({"id":"gp-test-2","school_id":"school-sync-1000","academic_year_id":"ay-1000","name":"Trimestre 1","period_order":1,"is_active":false,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grading_periods", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM grading_periods WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM grading_periods WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_upsert_class_subjects_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        let subject = json!({"id":"subject-cs-1","school_id":"school-sync-1","name":"Mathématiques","code":"MATH","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "subjects", &subject).unwrap();
        conn.execute("INSERT OR IGNORE INTO classes (id, school_id, academic_year_id, name) VALUES ('class-cs-1', 'school-sync-1', 'ay-1', '6A')", []).unwrap();
        let payload = json!({"id":"cs-test-1","school_id":"school-sync-1","academic_year_id":"ay-1","class_id":"class-cs-1","subject_id":"subject-cs-1","coefficient":2.5,"teacher_id":"teacher-1","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "class_subjects", &payload).unwrap();
        let coefficient: f64 = conn
            .query_row(
                "SELECT coefficient FROM class_subjects WHERE id = 'cs-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let subject_id: String = conn
            .query_row(
                "SELECT subject_id FROM class_subjects WHERE id = 'cs-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(coefficient, 2.5);
        assert_eq!(subject_id, "subject-cs-1");
        let other_subject = json!({"id":"subject-cs-2","school_id":"school-sync-1000","name":"Français","code":"FR","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "subjects", &other_subject).unwrap();
        conn.execute("INSERT OR IGNORE INTO classes (id, school_id, academic_year_id, name) VALUES ('class-cs-2', 'school-sync-1000', 'ay-1000', '6B')", []).unwrap();
        let other = json!({"id":"cs-test-2","school_id":"school-sync-1000","academic_year_id":"ay-1000","class_id":"class-cs-2","subject_id":"subject-cs-2","coefficient":1.0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "class_subjects", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM class_subjects WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM class_subjects WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_upsert_teacher_assignments_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        let subject = json!({"id":"subject-ta-1","school_id":"school-sync-1","name":"Mathématiques","code":"MATH","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "subjects", &subject).unwrap();
        conn.execute("INSERT OR IGNORE INTO classes (id, school_id, academic_year_id, name) VALUES ('class-ta-1', 'school-sync-1', 'ay-1', '6A')", []).unwrap();
        let class_subject = json!({"id":"cs-ta-1","school_id":"school-sync-1","academic_year_id":"ay-1","class_id":"class-ta-1","subject_id":"subject-ta-1","coefficient":1.0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "class_subjects", &class_subject).unwrap();
        let payload = json!({"id":"ta-test-1","school_id":"school-sync-1","academic_year_id":"ay-1","teacher_id":"teacher-1","class_subject_id":"cs-ta-1","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "teacher_assignments", &payload).unwrap();
        let teacher_id: String = conn
            .query_row(
                "SELECT teacher_id FROM teacher_assignments WHERE id = 'ta-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let class_subject_id: String = conn
            .query_row(
                "SELECT class_subject_id FROM teacher_assignments WHERE id = 'ta-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(teacher_id, "teacher-1");
        assert_eq!(class_subject_id, "cs-ta-1");
        let other = json!({"id":"ta-test-2","school_id":"school-sync-1000","academic_year_id":"ay-1","teacher_id":"teacher-2","class_subject_id":"cs-ta-1","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "teacher_assignments", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM teacher_assignments WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM teacher_assignments WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_upsert_grades_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        conn.execute("INSERT OR IGNORE INTO students (id, school_id, first_name, last_name) VALUES ('student-grade-1', 'school-sync-1', 'Jean', 'Dupont')", []).unwrap();
        conn.execute("INSERT OR IGNORE INTO enrollments (id, school_id, academic_year_id, student_id, status, enrollment_type) VALUES ('enrollment-grade-1', 'school-sync-1', 'ay-1', 'student-grade-1', 'ACTIVE', 'NEW')", []).unwrap();
        let subject = json!({"id":"subject-grade-1","school_id":"school-sync-1","name":"Mathématiques","code":"MATH","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "subjects", &subject).unwrap();
        conn.execute("INSERT OR IGNORE INTO classes (id, school_id, academic_year_id, name) VALUES ('class-grade-1', 'school-sync-1', 'ay-1', '6A')", []).unwrap();
        let class_subject = json!({"id":"cs-grade-1","school_id":"school-sync-1","academic_year_id":"ay-1","class_id":"class-grade-1","subject_id":"subject-grade-1","coefficient":1.0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "class_subjects", &class_subject).unwrap();
        let grade_type = json!({"id":"gt-grade-1","school_id":"school-sync-1","name":"Examen","max_score":20.0,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grade_types", &grade_type).unwrap();
        let grading_period = json!({"id":"gp-grade-1","school_id":"school-sync-1","academic_year_id":"ay-1","name":"Trimestre 1","period_order":1,"is_active":true,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grading_periods", &grading_period).unwrap();
        let payload = json!({"id":"grade-test-1","school_id":"school-sync-1","academic_year_id":"ay-1","enrollment_id":"enrollment-grade-1","student_id":"student-grade-1","class_subject_id":"cs-grade-1","grading_period_id":"gp-grade-1","grade_type_id":"gt-grade-1","score":14.5,"max_score":20.0,"evaluation_date":"2026-02-01","notes":"Bien","recorded_by":"user-1","is_absent":false,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grades", &payload).unwrap();
        let score: f64 = conn
            .query_row(
                "SELECT score FROM grades WHERE id = 'grade-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let is_absent: i64 = conn
            .query_row(
                "SELECT is_absent FROM grades WHERE id = 'grade-test-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(score, 14.5);
        assert_eq!(is_absent, 0);
        let other = json!({"id":"grade-test-2","school_id":"school-sync-1000","academic_year_id":"ay-1","enrollment_id":"enrollment-grade-1","student_id":"student-grade-1","class_subject_id":"cs-grade-1","grading_period_id":"gp-grade-1","grade_type_id":"gt-grade-1","score":10.0,"max_score":20.0,"is_absent":false,"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "grades", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM grades WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM grades WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_upsert_staff_local() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        let payload = json!({
            "id": "staff-test-1",
            "school_id": "school-sync-1",
            "nom": "Dupont",
            "prenoms": "Jean",
            "telephone_principal": "111",
            "est_actif": true,
            "est_prof_principal": true,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        });
        upsert_entity(&conn, "staff", &payload).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM staff WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
        let (phone, actif, prof_princ): (String, i64, i64) = conn.query_row(
            "SELECT telephone_principal, est_actif, est_prof_principal FROM staff WHERE id = 'staff-test-1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        ).unwrap();
        assert_eq!(phone, "111");
        assert_eq!(actif, 1);
        assert_eq!(prof_princ, 1);

        let updated = json!({
            "id": "staff-test-1",
            "school_id": "school-sync-1",
            "nom": "Dupont",
            "prenoms": "Jean",
            "telephone_principal": "999",
            "est_actif": false,
            "est_prof_principal": false,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z"
        });
        upsert_entity(&conn, "staff", &updated).unwrap();
        let (phone_updated, actif_updated): (String, i64) = conn
            .query_row(
                "SELECT telephone_principal, est_actif FROM staff WHERE id = 'staff-test-1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(phone_updated, "999");
        assert_eq!(actif_updated, 0);

        let other = json!({"id":"staff-test-2","school_id":"school-sync-1000","nom":"Autre","prenoms":"Ecole","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"});
        upsert_entity(&conn, "staff", &other).unwrap();
        let count_a: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM staff WHERE school_id = 'school-sync-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let count_b: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM staff WHERE school_id = 'school-sync-1000'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_a, 1);
        assert_eq!(count_b, 1);
    }

    #[test]
    fn test_inbound_resume_after_local_failure() {
        let (_guard, db_path) = setup_test_db();
        let failing_row = json!({
            "id": "cs-resume-1",
            "school_id": "school-sync-1",
            "academic_year_id": "ay-1",
            "class_id": "class-missing",
            "subject_id": "subject-missing",
            "coefficient": 1.0,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        });
        let rows = Arc::new(vec![failing_row.clone()]);
        let rows_clone = rows.clone();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(move |line| {
            if line.contains("/rest/v1/class_subjects") {
                (200, serde_json::to_string(&*rows_clone).unwrap())
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let first = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(first.is_err(), "le premier cycle doit échouer");
        assert!(
            load_inbound_cursor(&db_path).unwrap_or_default().is_empty(),
            "le curseur ne doit pas progresser après un échec"
        );

        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO subjects (id, school_id, name, code, created_at, updated_at) VALUES ('subject-missing', 'school-sync-1', 'Matière', 'MAT', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO classes (id, school_id, academic_year_id, name) VALUES ('class-missing', 'school-sync-1', 'ay-1', '6A')",
            [],
        )
        .unwrap();

        let second = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(
            second.is_ok(),
            "le second cycle doit réussir : {:?}",
            second
        );

        let count: i64 = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM class_subjects WHERE id = 'cs-resume-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "la ligne doit être appliquée après reprise");

        assert!(
            !load_inbound_cursor(&db_path).unwrap_or_default().is_empty(),
            "le curseur doit progresser après le succès"
        );

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_inbound_cursor_two_tables_one_failure() {
        let (_guard, db_path) = setup_test_db();
        let valid_subject = json!({
            "id": "subject-ok-1",
            "school_id": "school-sync-1",
            "name": "Mathématiques",
            "code": "MATH",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        });
        let failing_class_subject = json!({
            "id": "cs-fail-2",
            "school_id": "school-sync-1",
            "academic_year_id": "ay-1",
            "class_id": "class-missing-2",
            "subject_id": "subject-missing-2",
            "coefficient": 1.0,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        });
        let subjects = Arc::new(vec![valid_subject.clone()]);
        let class_subjects = Arc::new(vec![failing_class_subject.clone()]);
        let subjects_clone = subjects.clone();
        let class_subjects_clone = class_subjects.clone();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(move |line| {
            if line.contains("/rest/v1/subjects") {
                (200, serde_json::to_string(&*subjects_clone).unwrap())
            } else if line.contains("/rest/v1/class_subjects") {
                (200, serde_json::to_string(&*class_subjects_clone).unwrap())
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let first = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(first.is_err(), "le cycle doit échouer si une table échoue");

        let subject_count: i64 = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM subjects WHERE id = 'subject-ok-1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(subject_count, 1, "la table réussie peut être appliquée");

        assert!(
            load_inbound_cursor(&db_path).unwrap_or_default().is_empty(),
            "le curseur ne doit pas progresser si une table échoue"
        );

        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO subjects (id, school_id, name, code, created_at, updated_at) VALUES ('subject-missing-2', 'school-sync-1', 'Matière', 'MAT2', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO classes (id, school_id, academic_year_id, name) VALUES ('class-missing-2', 'school-sync-1', 'ay-1', '6B')",
            [],
        )
        .unwrap();

        let second = Runtime::new().unwrap().block_on(async {
            process_inbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(
            second.is_ok(),
            "le cycle suivant doit réussir : {:?}",
            second
        );

        let cs_count: i64 = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM class_subjects WHERE id = 'cs-fail-2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(cs_count, 1, "la table en échec doit être reprise");

        assert!(
            !load_inbound_cursor(&db_path).unwrap_or_default().is_empty(),
            "le curseur doit progresser après succès complet"
        );

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_outbound_temporary_then_success() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-temp', 'school-sync-1', 'subjects', 'subject-temp-1', 'INSERT', '{\"id\":\"subject-temp-1\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
            [],
        ).unwrap();

        let counter = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter_clone = counter.clone();
        let (mock_url, stop_flag, server_handle) = spawn_mock_server(move |line| {
            if line.contains("/rest/v1/subjects") {
                let n = counter_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if n == 0 {
                    (503, "temporary".to_string())
                } else {
                    (201, "".to_string())
                }
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let first = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        // Un échec temporaire ne fait pas échouer tout le cycle, mais la mutation
        // ne doit pas être marquée SYNCED.
        let _ = first;

        let status: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT status FROM pending_mutations WHERE id = 'm-temp'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status, "PENDING",
            "la mutation temporaire doit rester PENDING"
        );

        let second = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(
            second.is_ok(),
            "la seconde tentative doit réussir : {:?}",
            second
        );

        let status: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT status FROM pending_mutations WHERE id = 'm-temp'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status, "SYNCED",
            "la mutation doit être SYNCED après succès"
        );

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_outbound_attempt_limit_retry() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status, attempt_count) VALUES ('m-limit', 'school-sync-1', 'subjects', 'subject-limit', 'INSERT', '{\"id\":\"subject-limit\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'FAILED', 5)",
            [],
        ).unwrap();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(|_| (201, "".to_string()));
        let client = Client::new();
        let result = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(result.is_ok());

        let status: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT status FROM pending_mutations WHERE id = 'm-limit'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status, "FAILED",
            "une mutation épuisée ne doit pas être envoyée automatiquement"
        );

        let requeued = retry_failed_mutations_internal(&db_path).unwrap();
        assert!(requeued >= 1);

        let result = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });
        assert!(result.is_ok());
        let status: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT status FROM pending_mutations WHERE id = 'm-limit'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status, "SYNCED",
            "après reprise explicite, la mutation doit réussir"
        );

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_outbound_multiple_batches() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        for i in 0..45 {
            conn.execute(
                &format!("INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-batch-{}', 'school-sync-1', 'subjects', 'subject-batch-{}', 'INSERT', '{{\"id\":\"subject-batch-{}\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}}', 'PENDING')", i, i, i),
                [],
            ).unwrap();
        }

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(|_| (201, "".to_string()));
        let client = Client::new();
        for _ in 0..5 {
            let _ = Runtime::new().unwrap().block_on(async {
                process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
            });
        }

        let count: i64 = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM pending_mutations WHERE status = 'SYNCED'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 45,
            "toutes les mutations des lots successifs doivent être synchronisées"
        );

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_outbound_restart_persistence() {
        let (_guard, db_path) = setup_test_db();
        {
            let conn = Connection::open(&db_path).unwrap();
            conn.execute(
                "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-restart', 'school-sync-1', 'subjects', 'subject-restart', 'INSERT', '{\"id\":\"subject-restart\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
                [],
            ).unwrap();
        }
        let conn = Connection::open(&db_path).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM pending_mutations WHERE id = 'm-restart' AND status = 'PENDING'", [], |r| r.get(0)).unwrap();
        assert_eq!(
            count, 1,
            "la mutation doit survivre à la fermeture/réouverture de la connexion"
        );
    }

    #[test]
    fn test_outbound_definitive_errors_and_independent_progression() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-auth', 'school-sync-1', 'students', 'student-auth', 'INSERT', '{\"id\":\"student-auth\",\"school_id\":\"school-sync-1\",\"first_name\":\"Jean\",\"last_name\":\"Dupont\"}', 'PENDING')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-valid', 'school-sync-1', 'subjects', 'subject-valid', 'INSERT', '{\"id\":\"subject-valid\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
            [],
        ).unwrap();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(|line| {
            if line.contains("/rest/v1/students") {
                (401, "unauthorized".to_string())
            } else if line.contains("/rest/v1/subjects") {
                (201, "".to_string())
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let _ = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });

        let status_auth: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT status FROM pending_mutations WHERE id = 'm-auth'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let error_auth: Option<String> = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT last_error FROM pending_mutations WHERE id = 'm-auth'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status_auth, "FAILED");
        assert!(error_auth.unwrap_or_default().contains("401"));

        let status_valid: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT status FROM pending_mutations WHERE id = 'm-valid'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            status_valid, "SYNCED",
            "une mutation indépendante doit progresser"
        );

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_outbound_idempotence_operations() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        // INSERT déjà présent côté serveur : 409 puis PATCH.
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-ins', 'school-sync-1', 'subjects', 'subject-idem', 'INSERT', '{\"id\":\"subject-idem\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
            [],
        ).unwrap();
        // UPDATE
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-upd', 'school-sync-1', 'subjects', 'subject-upd', 'UPDATE', '{\"id\":\"subject-upd\",\"school_id\":\"school-sync-1\",\"name\":\"Math2\",\"code\":\"MATH2\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
            [],
        ).unwrap();
        // DELETE d'une ligne déjà absente côté serveur.
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-del', 'school-sync-1', 'subjects', 'subject-del', 'DELETE', '{\"id\":\"subject-del\"}', 'PENDING')",
            [],
        ).unwrap();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(|line| {
            if line.contains("/rest/v1/subjects") && line.contains("POST") {
                (409, "duplicate".to_string())
            } else if line.contains("/rest/v1/subjects") && line.contains("PATCH") {
                (200, "".to_string())
            } else if line.contains("/rest/v1/subjects") && line.contains("DELETE") {
                (404, "not found".to_string())
            } else {
                (200, "[]".to_string())
            }
        });

        let client = Client::new();
        let _ = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }

    #[test]
    fn test_outbound_school_id_isolation() {
        let (_guard, db_path) = setup_test_db();
        let conn = Connection::open(&db_path).unwrap();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-school-a', 'school-sync-1', 'subjects', 'subject-a', 'INSERT', '{\"id\":\"subject-a\",\"school_id\":\"school-sync-1\",\"name\":\"Math\",\"code\":\"MATH\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO pending_mutations (id, school_id, entity_type, entity_id, operation, payload, status) VALUES ('m-school-b', 'school-sync-1000', 'subjects', 'subject-b', 'INSERT', '{\"id\":\"subject-b\",\"school_id\":\"school-sync-1000\",\"name\":\"Français\",\"code\":\"FR\",\"created_at\":\"2026-01-01T00:00:00Z\",\"updated_at\":\"2026-01-01T00:00:00Z\"}', 'PENDING')",
            [],
        ).unwrap();

        let (mock_url, stop_flag, server_handle) = spawn_mock_server(|_| (201, "".to_string()));
        let client = Client::new();
        let _ = Runtime::new().unwrap().block_on(async {
            process_outbox(&db_path, &client, &mock_url, "anon-key", "token").await
        });

        let school_a: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT school_id FROM pending_mutations WHERE id = 'm-school-a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let school_b: String = Connection::open(&db_path)
            .unwrap()
            .query_row(
                "SELECT school_id FROM pending_mutations WHERE id = 'm-school-b'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(school_a, "school-sync-1");
        assert_eq!(school_b, "school-sync-1000");

        stop_flag.store(true, Ordering::Relaxed);
        let _ = server_handle.join();
    }
}
