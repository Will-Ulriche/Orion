use rusqlite::Connection;
use std::time::Duration;
use reqwest::Client;
use dotenvy::dotenv;
use std::env;
use std::path::PathBuf;
use serde_json::Value;

pub fn start_sync_loop(db_path: PathBuf) {
    tauri::async_runtime::spawn(async move {
        // Préparation du client HTTP
        let client = Client::new();
        
        // Chargement de la configuration
        let _ = dotenv();
        let supabase_url = env::var("VITE_SUPABASE_URL").unwrap_or_default();
        let supabase_key = env::var("VITE_SUPABASE_ANON_KEY").unwrap_or_default();
        
        println!("Background Sync Engine started.");

        loop {
            // Cycle de vérification toutes les 10 secondes
            tokio::time::sleep(Duration::from_secs(10)).await;
            
            if supabase_url.is_empty() || supabase_key.is_empty() {
                continue; // Pas de configuration, on passe
            }

            // Récupération des mutations en attente
            let mutations: Vec<(i32, String, String, String)> = {
                let db = match Connection::open(&db_path) {
                    Ok(conn) => conn,
                    Err(_) => continue,
                };
                let mut stmt = match db.prepare("SELECT id, table_name, action, payload FROM pending_mutations WHERE status = 'PENDING' LIMIT 5") {
                    Ok(stmt) => stmt,
                    Err(_) => continue,
                };
                
                let iter = stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, i32>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                });
                
                if let Ok(iter) = iter {
                    iter.filter_map(Result::ok).collect()
                } else {
                    vec![]
                }
            };
            
            if mutations.is_empty() {
                continue; // Rien à faire
            }

            println!("Sync loop: {} mutation(s) found.", mutations.len());

            for (id, table, action, payload_str) in mutations {
                let mut success = false;
                
                if let Ok(payload) = serde_json::from_str::<Value>(&payload_str) {
                    let endpoint = format!("{}/rest/v1/{}", supabase_url, table);
                    
                    let req = match action.as_str() {
                        "INSERT" => client.post(&endpoint).json(&payload),
                        "UPDATE" => {
                            if let Some(record_id) = payload.get("id").and_then(|v| v.as_str()) {
                                let url = format!("{}?id=eq.{}", endpoint, record_id);
                                client.patch(&url).json(&payload)
                            } else {
                                client.patch(&endpoint).json(&payload)
                            }
                        },
                        "DELETE" => {
                             if let Some(record_id) = payload.get("id").and_then(|v| v.as_str()) {
                                let url = format!("{}?id=eq.{}", endpoint, record_id);
                                client.delete(&url)
                             } else {
                                client.delete(&endpoint)
                             }
                        }
                        _ => client.post(&endpoint).json(&payload),
                    };

                    let res = req
                        .header("apikey", &supabase_key)
                        .header("Authorization", format!("Bearer {}", supabase_key))
                        .header("Content-Type", "application/json")
                        .header("Prefer", "return=minimal")
                        .send()
                        .await;

                    match res {
                        Ok(response) if response.status().is_success() => {
                            println!("Sync SUCCESS for mutation {}", id);
                            success = true;
                        },
                        Ok(response) => {
                            eprintln!("Sync error for mutation {}: {:?}", id, response.status());
                            // S'il s'agit d'une erreur 4xx, on la marque comme échouée pour éviter le blocage
                            if response.status().is_client_error() {
                                if let Ok(db) = Connection::open(&db_path) {
                                    let _ = db.execute("UPDATE pending_mutations SET status = 'FAILED' WHERE id = ?1", [id]);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("Sync Network error: {}", e);
                            // S'il y a un problème de connexion, on arrête de traiter la file et on attend le prochain cycle
                            break;
                        }
                    }
                } else {
                    // Erreur de parsing du payload, on marque comme FAILED
                    if let Ok(db) = Connection::open(&db_path) {
                        let _ = db.execute("UPDATE pending_mutations SET status = 'FAILED' WHERE id = ?1", [id]);
                    }
                }

                if success {
                    if let Ok(db) = Connection::open(&db_path) {
                        let _ = db.execute("UPDATE pending_mutations SET status = 'SYNCED' WHERE id = ?1", [id]);
                    }
                }
            }
        }
    });
}
