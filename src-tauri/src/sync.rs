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

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use reqwest::Client;
use serde_json::Value;
use dotenvy::dotenv;
use std::env;

/// Identifiant canonique de la ligne d'état du moteur.
/// Toutes les lectures/écritures sur `sync_state` ciblent cette ligne, ce qui
/// rend les compteurs et le statut persistants même quand aucun cycle n'a
/// encore réussi.
const SYNC_STATE_ID: &str = "local-device";

/// Tables parentes dont l'insertion doit précéder celle des enfants,
/// sinon PostgreSQL rejette l'enfant sur une violation de clé étrangère.
const DEPENDENCY_ORDER: [(&str, u8); 6] = [
    ("schools", 0),
    ("academic_years", 1),
    ("classes", 2),
    ("students", 3),
    ("fee_structures", 4),
    ("payments", 5),
];

// ──────────────────────────────────────────────
// Types publics exposés aux Tauri commands
// ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub engine_status: String,       // IDLE | SYNCING | ERROR | OFFLINE
    pub last_sync_at: Option<String>,
    pub pending_count: i64,          // Mutations en attente d'envoi
    pub failed_count: i64,           // Mutations échouées
    pub conflict_count: i64,         // Conflits en attente de résolution
    pub inbox_pending: i64,          // Changements entrants non appliqués
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

pub fn start_sync_loop(db_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        let _ = dotenv();
        let supabase_url  = env::var("VITE_SUPABASE_URL").unwrap_or_default();
        let supabase_key  = env::var("VITE_SUPABASE_ANON_KEY").unwrap_or_default();

        if supabase_url.is_empty() || supabase_key.is_empty() {
            println!("[Sync] Configuration Supabase absente. Moteur en attente.");
            return;
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("[Sync] Impossible de construire le client HTTP");

        println!("[Sync] Moteur démarré. Cycle : 5 minutes.");

        loop {
            // Attendre 5 minutes entre chaque cycle automatique
            tokio::time::sleep(Duration::from_secs(300)).await;

            println!("[Sync] Cycle automatique démarré.");
            run_sync_cycle(&db_path, &client, &supabase_url, &supabase_key).await;
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
    supabase_key: &str,
) {
    ensure_sync_state(db_path);

    // 1. Vérifier la connectivité avant de commencer
    if !check_connectivity(client, supabase_url, supabase_key).await {
        update_engine_status(db_path, "OFFLINE", Some("Supabase inaccessible."));
        println!("[Sync] Hors ligne. Cycle annulé.");
        return;
    }

    update_engine_status(db_path, "SYNCING", None);

    // 2. Outbound : envoyer les mutations locales vers Supabase
    let outbound_result = process_outbox(db_path, client, supabase_url, supabase_key).await;

    // 3. Inbound : récupérer les changements distants depuis Supabase
    let inbound_result = process_inbox(db_path, client, supabase_url, supabase_key).await;

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
        Err(_)  => false,
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
    supabase_key: &str,
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
            mark_mutation(db_path, &id, "FAILED", Some("Trop de tentatives. Intervention requise."));
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
                mark_mutation(db_path, &id, "FAILED", Some(&format!("JSON invalide : {}", e)));
                continue;
            }
        };

        let endpoint = format!("{}/rest/v1/{}", supabase_url, entity_type);

        let headers = |b: reqwest::RequestBuilder| {
            b.header("apikey", supabase_key)
                .header("Authorization", format!("Bearer {}", supabase_key))
                .header("Content-Type", "application/json")
                .header("Prefer", "return=minimal")
                // En-tête d'idempotence : permet au serveur d'ignorer un doublon
                .header("X-Mutation-Id", &id)
        };

        let is_write = operation == "INSERT" || operation == "UPSERT" || operation == "UPDATE";
        let record_id = payload.get("id").and_then(|v| v.as_str()).map(str::to_string);

        let res = match operation.as_str() {
            "INSERT" | "UPSERT" => {
                headers(client.post(format!("{}?on_conflict=id", endpoint)).json(&payload))
                    .send()
                    .await
            }
            "UPDATE" => match &record_id {
                Some(rid) => {
                    headers(client.patch(format!("{}?id=eq.{}", endpoint, rid)).json(&payload))
                        .send()
                        .await
                }
                None => {
                    mark_mutation(db_path, &id, "FAILED", Some("UPDATE sans champ 'id'"));
                    continue;
                }
            },
            "DELETE" => match &record_id {
                Some(rid) => headers(client.delete(format!("{}?id=eq.{}", endpoint, rid))).send().await,
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
                eprintln!("[Outbox] Doublon {} {} — bascule en mise à jour.", entity_type, rid);
                res = match headers(
                    client.patch(format!("{}?id=eq.{}", endpoint, rid)).json(&payload)
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

        if res.status().is_success() {
            println!("[Outbox] ✓ Mutation {} synchronisée.", id);
            mark_mutation(db_path, &id, "SYNCED", None);
        } else if res.status().is_client_error() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            let error = format!("Erreur client {}: {}", status, body);
            eprintln!("[Outbox] ✗ Mutation {} : {}", id, error);
            mark_mutation(db_path, &id, "FAILED", Some(&error));
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

/// Récupère les changements distants. Retourne `Ok(None)` si tout s'est bien
/// passé, `Ok(Some(avertissement))` si au moins une table a été ignorée pour
/// incompatibilité de schéma, et `Err` en cas de panne réelle du cycle.
async fn process_inbox(
    db_path: &PathBuf,
    client: &Client,
    supabase_url: &str,
    supabase_key: &str,
) -> Result<Option<String>, String> {
    // Pour l'instant, on récupère les données marquées comme modifiées
    // après le cursor de la dernière sync (via la colonne de version)
    let last_cursor = load_inbound_cursor(db_path).unwrap_or_default();

    // Tables synchronisables et colonne servant de curseur incrémental.
    // `enrollment_history` n'a pas de `updated_at` côté Supabase : son
    // horodatage est `changed_at`. Utiliser `updated_at` partout produisait
    // une erreur 400 sur cette table.
    let tables: [(&str, &str); 7] = [
        ("academic_years", "updated_at"),
        ("classes", "updated_at"),
        ("students", "updated_at"),
        ("enrollments", "updated_at"),
        ("enrollment_history", "changed_at"),
        ("fee_structures", "updated_at"),
        ("payments", "updated_at"),
    ];

    let mut degraded: Vec<String> = Vec::new();

    for (table, version_col) in &tables {
        let url = if last_cursor.is_empty() {
            // Première sync : on récupère tout (limité à 500 pour éviter la surcharge)
            format!("{}/rest/v1/{}?order={}.asc&limit=500", supabase_url, table, version_col)
        } else {
            // Sync incrémentale : seulement ce qui a changé depuis le cursor
            format!(
                "{}/rest/v1/{}?{}=gt.{}&order={}.asc&limit=500",
                supabase_url, table, version_col, last_cursor, version_col
            )
        };

        let res = client
            .get(&url)
            .header("apikey", supabase_key)
            .header("Authorization", format!("Bearer {}", supabase_key))
            .send()
            .await;

        match res {
            Ok(response) if response.status().is_success() => {
                if let Ok(rows) = response.json::<Vec<Value>>().await {
                    for row in &rows {
                        store_inbox_item(db_path, table, row);
                    }
                    println!("[Inbox] {} : {} enregistrement(s) reçu(s).", table, rows.len());
                }
            }
            Ok(response) if response.status().as_u16() == 404 => {
                // Table non encore dans Supabase → on ignore silencieusement
            }
            // Incompatibilité de schéma (table ou colonne absente) : on signale
            // mais on ne bloque pas les autres tables. Rendre cette erreur
            // fatale empêcherait toute synchronisation entrante dès qu'une
            // seule table diverge du schéma attendu.
            Ok(response) if response.status().is_client_error() => {
                let status = response.status().as_u16();
                let body = response.text().await.unwrap_or_default();
                eprintln!("[Inbox] Table {} ignorée ({}): {}", table, status, body);
                degraded.push(format!("{} ({})", table, status));
            }
            Ok(response) => {
                // Erreur serveur : le cycle est réellement en échec, on remonte
                let status = response.status().as_u16();
                let body = response.text().await.unwrap_or_default();
                eprintln!("[Inbox] Erreur {} pour la table {} : {}", status, table, body);
                return Err(format!("Erreur {} sur la table {} : {}", status, table, body));
            }
            Err(e) => {
                eprintln!("[Inbox] Erreur réseau pour {} : {}", table, e);
                return Err(format!("Erreur réseau inbound : {}", e));
            }
        }
    }

    // Appliquer les items de l'inbox dans SQLite
    apply_inbox_items(db_path);

    // Avancer le curseur seulement si le cycle est complet : sinon un échec
    // partiel ferait perdre définitivement les lignes non récupérées.
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

fn apply_inbox_items(db_path: &PathBuf) {
    let db = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => { eprintln!("[Inbox] Impossible d'ouvrir SQLite : {}", e); return; }
    };

    let items: Vec<(String, String, String, String, String)> = {
        let mut stmt = match db.prepare(
            "SELECT id, entity_type, entity_id, operation, payload
             FROM sync_inbox
             WHERE status = 'PENDING'
             ORDER BY received_at ASC
             LIMIT 100"
        ) {
            Ok(s) => s,
            Err(_) => return,
        };

        stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .ok()
        .map(|iter| iter.filter_map(Result::ok).collect())
        .unwrap_or_default()
    };

    for (inbox_id, entity_type, entity_id, operation, payload_str) in items {
        let payload: Value = match serde_json::from_str(&payload_str) {
            Ok(v) => v,
            Err(e) => {
                let _ = db.execute(
                    "UPDATE sync_inbox SET status = 'FAILED', error_message = ?1 WHERE id = ?2",
                    rusqlite::params![format!("JSON invalide : {}", e), inbox_id],
                );
                continue;
            }
        };

        // Vérifier si un conflit existe (modification locale plus récente)
        let has_local_change = check_local_conflict(&db, &entity_type, &entity_id);

        if has_local_change {
            // Conflit détecté — on ne l'applique pas automatiquement
            let _ = db.execute(
                "UPDATE sync_inbox SET status = 'CONFLICT' WHERE id = ?1",
                rusqlite::params![inbox_id],
            );
            eprintln!("[Inbox] ⚠ Conflit détecté pour {}/{}", entity_type, entity_id);
            continue;
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
            }
        }
    }
}

// ──────────────────────────────────────────────
// Détection d'un conflit local
// Si une mutation PENDING existe pour la même entité → conflit
// ──────────────────────────────────────────────

fn check_local_conflict(db: &Connection, entity_type: &str, entity_id: &str) -> bool {
    db.query_row(
        "SELECT COUNT(*) FROM pending_mutations
         WHERE entity_type = ?1 AND entity_id = ?2 AND status IN ('PENDING', 'SYNCING')",
        rusqlite::params![entity_type, entity_id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0
}

// ──────────────────────────────────────────────
// Upsert d'une entité dans SQLite depuis un payload distant
// ──────────────────────────────────────────────

fn upsert_entity(db: &Connection, entity_type: &str, payload: &Value) -> Result<(), String> {
    let id = payload.get("id").and_then(|v| v.as_str())
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
            ).map_err(|e| e.to_string())?;
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
            ).map_err(|e| e.to_string())?;
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
            ).map_err(|e| e.to_string())?;
        }
        _ => {
            // Table non gérée → on l'ignore sans faire échouer la sync
            println!("[Inbox] Table '{}' non supportée pour l'upsert.", entity_type);
        }
    }

    Ok(())
}

fn soft_delete_entity(db: &Connection, entity_type: &str, entity_id: &str) -> Result<(), String> {
    // Supprimer les dépendances d'abord selon le type d'entité
    match entity_type {
        "academic_years" => {
            db.execute("DELETE FROM enrollment_history WHERE academic_year_id = ?1", rusqlite::params![entity_id])
                .map_err(|e| e.to_string())?;
            db.execute("DELETE FROM enrollments WHERE academic_year_id = ?1", rusqlite::params![entity_id])
                .map_err(|e| e.to_string())?;
            db.execute("DELETE FROM classes WHERE academic_year_id = ?1", rusqlite::params![entity_id])
                .map_err(|e| e.to_string())?;
        }
        "classes" => {
            db.execute("UPDATE enrollments SET class_id = NULL WHERE class_id = ?1", rusqlite::params![entity_id])
                .map_err(|e| e.to_string())?;
        }
        "enrollments" => {
            db.execute("DELETE FROM enrollment_history WHERE enrollment_id = ?1", rusqlite::params![entity_id])
                .map_err(|e| e.to_string())?;
        }
        "fee_structures" => {
            // Les paiements liés ne sont pas supprimés automatiquement
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

fn load_pending_mutations(db_path: &PathBuf) -> Result<Vec<(String, String, String, String, i64)>, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    // Les parents (année scolaire, classe) doivent partir avant leurs enfants
    // (élève, inscription), sinon PostgreSQL rejette l'enfant sur la clé étrangère.
    let mut stmt = db.prepare(
        "SELECT id, entity_type, operation, payload, COALESCE(attempt_count, 0)
         FROM pending_mutations
         WHERE status IN ('PENDING', 'FAILED')
           AND COALESCE(attempt_count, 0) < 5
         ORDER BY
           -- Pour les INSERT/UPSERT : parents d'abord (school → enrollments)
           -- Pour les DELETE : enfants d'abord (enrollments → school)
           CASE WHEN operation = 'DELETE' THEN
             CASE entity_type
               WHEN 'enrollment_history' THEN 0
               WHEN 'enrollments' THEN 1
               WHEN 'payments' THEN 1
               WHEN 'fee_structures' THEN 2
               WHEN 'students' THEN 3
               WHEN 'classes' THEN 3
               WHEN 'academic_years' THEN 4
               WHEN 'school' THEN 5
               ELSE 6
             END
           ELSE
             CASE entity_type
               WHEN 'school' THEN 0
               WHEN 'academic_years' THEN 1
               WHEN 'classes' THEN 2
               WHEN 'students' THEN 3
               WHEN 'enrollments' THEN 4
               WHEN 'enrollment_history' THEN 5
               WHEN 'fee_structures' THEN 6
               WHEN 'payments' THEN 7
               ELSE 8
             END
           END,
           created_at ASC
         LIMIT 20"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
        ))
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(Result::ok).collect())
}

fn mark_mutation(db_path: &PathBuf, id: &str, status: &str, error: Option<&str>) {
    if let Ok(db) = Connection::open(db_path) {
        let synced_at = if status == "SYNCED" { Some("CURRENT_TIMESTAMP") } else { None };
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

fn store_inbox_item(db_path: &PathBuf, entity_type: &str, row: &Value) {
    let db = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return,
    };
    let id = uuid::Uuid::new_v4().to_string();
    let entity_id = row.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let school_id  = row.get("school_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let payload    = serde_json::to_string(row).unwrap_or_default();
    let remote_id  = entity_id.clone();

    // Idempotence : ne pas insérer si déjà présent avec le même remote_id
    let exists: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_inbox WHERE remote_id = ?1 AND entity_type = ?2 AND status = 'PENDING'",
        rusqlite::params![remote_id, entity_type],
        |row| row.get(0),
    ).unwrap_or(0);

    if exists > 0 { return; }

    let _ = db.execute(
        "INSERT INTO sync_inbox (id, remote_id, school_id, entity_type, entity_id, operation, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, 'UPDATE', ?6)",
        rusqlite::params![id, remote_id, school_id, entity_type, entity_id, payload],
    );
}

/// Garantit qu'une ligne d'état existe avant toute lecture ou écriture.
/// Sans cette ligne, tous les `UPDATE sync_state` sont des no-ops : le statut
/// retombait sur "IDLE", `last_sync_at` restait nul et `last_error` jamais
/// renseigné — le bouton « Synchroniser » n'affichait donc jamais rien.
fn ensure_sync_state(db_path: &PathBuf) {
    let Ok(db) = Connection::open(db_path) else { return };

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
        .query_row("SELECT id FROM schools ORDER BY created_at ASC LIMIT 1", [], |row| row.get(0))
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
    let Ok(db) = Connection::open(db_path) else { return 0 };
    let count = db
        .execute(
            "UPDATE pending_mutations
             SET status = 'PENDING', attempt_count = 0, last_error = NULL
             WHERE status = 'FAILED' AND COALESCE(attempt_count, 0) >= 5",
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
    let Ok(db) = Connection::open(db_path) else { return Vec::new() };
    let Some((_, rank)) = DEPENDENCY_ORDER.iter().find(|(t, _)| *t == entity_type) else {
        return Vec::new();
    };

    let mut stmt = match db.prepare(
        "SELECT DISTINCT entity_type FROM pending_mutations
         WHERE status IN ('PENDING', 'FAILED')
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
    payload.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
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
    let _ = dotenv();
    let supabase_url = env::var("VITE_SUPABASE_URL").unwrap_or_default();
    let supabase_key = env::var("VITE_SUPABASE_ANON_KEY").unwrap_or_default();

    if supabase_url.is_empty() || supabase_key.is_empty() {
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

    run_sync_cycle(&db_path, &client, &supabase_url, &supabase_key).await;

    get_sync_status_internal(&db_path)
}

/// Lecture de l'état du moteur pour l'affichage dans l'interface
pub fn get_sync_status_internal(db_path: &PathBuf) -> Result<SyncStatus, String> {
    ensure_sync_state(db_path);
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;

    let pending_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM pending_mutations WHERE status = 'PENDING'",
        [], |row| row.get(0),
    ).unwrap_or(0);

    let failed_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM pending_mutations WHERE status = 'FAILED'",
        [], |row| row.get(0),
    ).unwrap_or(0);

    let conflict_count: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_inbox WHERE status = 'CONFLICT'",
        [], |row| row.get(0),
    ).unwrap_or(0);

    let inbox_pending: i64 = db.query_row(
        "SELECT COUNT(*) FROM sync_inbox WHERE status = 'PENDING'",
        [], |row| row.get(0),
    ).unwrap_or(0);

    let (engine_status, last_sync_at, last_error): (String, Option<String>, Option<String>) = db.query_row(
        "SELECT engine_status, last_sync_at, last_error FROM sync_state WHERE id = ?1",
        rusqlite::params![SYNC_STATE_ID],
        |row| Ok((
            row.get::<_, String>(0).unwrap_or_else(|_| "IDLE".to_string()),
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
        )),
    ).unwrap_or_else(|_| ("IDLE".to_string(), None, None));

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
    let mut stmt = db.prepare(
        "SELECT id, school_id, entity_type, entity_id, operation, status,
                COALESCE(attempt_count, 0), created_at, last_error
         FROM pending_mutations
         WHERE status IN ('PENDING', 'FAILED', 'SYNCING')
         ORDER BY created_at DESC
         LIMIT 50"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok(PendingMutation {
            id:            row.get(0)?,
            school_id:     row.get(1)?,
            entity_type:   row.get(2)?,
            entity_id:     row.get(3)?,
            operation:     row.get(4)?,
            status:        row.get(5)?,
            attempt_count: row.get(6)?,
            created_at:    row.get(7)?,
            last_error:    row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(rows.filter_map(Result::ok).collect())
}

/// Récupérer les conflits nécessitant une résolution manuelle
pub fn get_conflicts_internal(db_path: &PathBuf) -> Result<Vec<InboxConflict>, String> {
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = db.prepare(
        "SELECT id, entity_type, entity_id, operation, conflict_data, payload, received_at
         FROM sync_inbox
         WHERE status = 'CONFLICT'
         ORDER BY received_at ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        let payload_str: String = row.get(5)?;
        let remote_data: Value = serde_json::from_str(&payload_str).unwrap_or(Value::Null);
        let conflict_str: Option<String> = row.get(4)?;
        let local_data: Option<Value> = conflict_str
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());

        Ok(InboxConflict {
            id:          row.get(0)?,
            entity_type: row.get(1)?,
            entity_id:   row.get(2)?,
            operation:   row.get(3)?,
            local_data,
            remote_data,
            received_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

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
            let (entity_type, payload_str): (String, String) = db.query_row(
                "SELECT entity_type, payload FROM sync_inbox WHERE id = ?1",
                rusqlite::params![inbox_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).map_err(|_| "Conflit introuvable.".to_string())?;

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
            ).map_err(|e| e.to_string())?;
        }
        _ => return Err("Choix invalide. Utilisez 'LOCAL' ou 'REMOTE'.".to_string()),
    }

    Ok(())
}
