// ============================================================
// SESSION 6 — MODULE BIBLIOTHÈQUE
// ============================================================
// Catalogue (ouvrages), catégories, exemplaires/inventaire, lecteurs,
// emprunts, retours, pénalités et réservations.
//
// Toutes les commandes filtrent par `school_id` : aucune donnée ne
// franchit la frontière d'un établissement.

use chrono::NaiveDate;
use rusqlite::{types::Value as SqlValue, Connection};
use serde_json::json;
use tauri::State;

use crate::commands::{enqueue_entity, DbState};
use crate::models::{
    LibraryBook, LibraryCategory, LibraryCopy, LibraryDashboard, LibraryLoan, LibraryPenalty,
    LibraryReader, LibraryReservation, LibraryReturn, LibrarySettings,
};

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn today() -> String {
    chrono::Utc::now().naive_local().date().to_string()
}

/// Analyse une date `YYYY-MM-DD` (tolère un suffixe horodaté ISO).
fn parse_date(value: &str) -> Option<NaiveDate> {
    let head: String = value.chars().take(10).collect();
    NaiveDate::parse_from_str(&head, "%Y-%m-%d").ok()
}

/// Décale une date ISO de N jours.
fn add_days(date: &str, days: i64) -> String {
    match parse_date(date) {
        Some(d) => (d + chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string(),
        None => date.to_string(),
    }
}

/// Nombre de jours entre deux dates (b - a).
fn days_between(from: &str, to: &str) -> i64 {
    match (parse_date(from), parse_date(to)) {
        (Some(a), Some(b)) => (b - a).num_days(),
        _ => 0,
    }
}

/// Journalise une opération sensible dans `audit_logs`.
fn audit(
    conn: &Connection,
    school_id: &str,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    payload: serde_json::Value,
) {
    let _ = conn.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, entity_id, new_data)
         VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            school_id,
            action,
            entity_type,
            entity_id,
            payload.to_string()
        ],
    );
}

/// Prochain code d'inventaire libre pour un préfixe donné (ex. `BIB` → `BIB-0007`).
fn next_inventory_code(conn: &Connection, school_id: &str, prefix: &str) -> String {
    let pattern = format!("{}-%", prefix.to_uppercase());
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1 AND inventory_code LIKE ?2",
            rusqlite::params![school_id, pattern],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mut candidate = count + 1;
    loop {
        let code = format!("{}-{:04}", prefix.to_uppercase(), candidate);
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1 AND inventory_code = ?2",
                rusqlite::params![school_id, code],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return code;
        }
        candidate += 1;
    }
}

/// Prochain numéro de carte de lecteur libre (`CAR-0001`).
fn next_card_number(conn: &Connection, school_id: &str) -> String {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_readers WHERE school_id = ?1",
            rusqlite::params![school_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let mut candidate = count + 1;
    loop {
        let code = format!("CAR-{:04}", candidate);
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_readers WHERE school_id = ?1 AND card_number = ?2",
                rusqlite::params![school_id, code],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists == 0 {
            return code;
        }
        candidate += 1;
    }
}

/// Lit les paramètres de la bibliothèque (création à la volée si absents).
fn load_settings(conn: &Connection, school_id: &str) -> Result<LibrarySettings, String> {
    let existing: Option<LibrarySettings> = conn
        .query_row(
            "SELECT id, school_id, loan_duration_days, max_loans_per_reader,
                    fine_per_day, grace_days, reservation_expiry_days
             FROM library_settings WHERE school_id = ?1",
            rusqlite::params![school_id],
            |row| {
                Ok(LibrarySettings {
                    id: row.get(0)?,
                    school_id: row.get(1)?,
                    loan_duration_days: row.get(2)?,
                    max_loans_per_reader: row.get(3)?,
                    fine_per_day: row.get(4)?,
                    grace_days: row.get(5)?,
                    reservation_expiry_days: row.get(6)?,
                })
            },
        )
        .ok();

    if let Some(s) = existing {
        return Ok(s);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO library_settings
            (id, school_id, loan_duration_days, max_loans_per_reader, fine_per_day, grace_days, reservation_expiry_days, updated_at)
         VALUES (?1,?2,14,3,100,0,7,?3)",
        rusqlite::params![id, school_id, now],
    )
    .map_err(|e| format!("Erreur création des paramètres de la bibliothèque : {}", e))?;

    Ok(LibrarySettings {
        id,
        school_id: school_id.to_string(),
        loan_duration_days: 14,
        max_loans_per_reader: 3,
        fine_per_day: 100.0,
        grace_days: 0,
        reservation_expiry_days: 7,
    })
}

// ──────────────────────────────────────────────
// PARAMÈTRES
// ──────────────────────────────────────────────

/// Lit les paramètres de la bibliothèque de l'établissement.
#[tauri::command]
pub fn get_library_settings(
    school_id: String,
    state: State<'_, DbState>,
) -> Result<LibrarySettings, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    load_settings(&conn, &school_id)
}

/// Met à jour les paramètres de la bibliothèque.
#[tauri::command]
pub fn save_library_settings(
    school_id: String,
    loan_duration_days: i64,
    max_loans_per_reader: i64,
    fine_per_day: f64,
    grace_days: i64,
    reservation_expiry_days: i64,
    state: State<'_, DbState>,
) -> Result<LibrarySettings, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    load_settings(&conn, &school_id)?;

    let now = now_iso();
    conn.execute(
        "UPDATE library_settings
            SET loan_duration_days = ?1, max_loans_per_reader = ?2, fine_per_day = ?3,
                grace_days = ?4, reservation_expiry_days = ?5, updated_at = ?6
          WHERE school_id = ?7",
        rusqlite::params![
            loan_duration_days,
            max_loans_per_reader,
            fine_per_day,
            grace_days,
            reservation_expiry_days,
            now,
            school_id
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    audit(
        &conn,
        &school_id,
        "UPDATE_LIBRARY_SETTINGS",
        "library_settings",
        &school_id,
        json!({
            "loan_duration_days": loan_duration_days,
            "max_loans_per_reader": max_loans_per_reader,
            "fine_per_day": fine_per_day,
            "grace_days": grace_days,
            "reservation_expiry_days": reservation_expiry_days
        }),
    );

    load_settings(&conn, &school_id)
}

// ──────────────────────────────────────────────
// CATÉGORIES
// ──────────────────────────────────────────────

/// Liste les catégories de l'établissement avec le nombre d'ouvrages associés.
#[tauri::command]
pub fn get_library_categories(
    school_id: String,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryCategory>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.school_id, c.name, c.code, c.description, c.color,
                    (SELECT COUNT(*) FROM library_books b WHERE b.category_id = c.id) AS book_count
             FROM library_categories c
             WHERE c.school_id = ?1
             ORDER BY c.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![school_id], |row| {
            Ok(LibraryCategory {
                id: row.get(0)?,
                school_id: row.get(1)?,
                name: row.get(2)?,
                code: row.get(3)?,
                description: row.get(4)?,
                color: row.get(5)?,
                book_count: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(c) => res.push(c),
            Err(e) => return Err(format!("Erreur lecture catégorie: {}", e)),
        }
    }
    Ok(res)
}

/// Crée une catégorie de classement.
#[tauri::command]
pub fn create_library_category(
    school_id: String,
    name: String,
    code: Option<String>,
    description: Option<String>,
    color: Option<String>,
    state: State<'_, DbState>,
) -> Result<LibraryCategory, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    if name.trim().is_empty() {
        return Err("Le nom de la catégorie est obligatoire.".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO library_categories (id, school_id, name, code, description, color, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
        rusqlite::params![id, school_id, name, code, description, color, now],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_categories", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_CATEGORY",
        "library_categories",
        &id,
        json!({ "name": name, "code": code }),
    );

    Ok(LibraryCategory {
        id,
        school_id,
        name,
        code,
        description,
        color,
        book_count: 0,
    })
}

/// Modifie une catégorie.
#[tauri::command]
pub fn update_library_category(
    id: String,
    school_id: String,
    name: String,
    code: Option<String>,
    description: Option<String>,
    color: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE library_categories
            SET name = ?1, code = ?2, description = ?3, color = ?4, updated_at = ?5
          WHERE id = ?6 AND school_id = ?7",
        rusqlite::params![name, code, description, color, now, id, school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_categories", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "UPDATE_LIBRARY_CATEGORY",
        "library_categories",
        &id,
        json!({ "name": name }),
    );
    Ok(())
}

/// Supprime une catégorie (refusée si des ouvrages y sont rattachés).
#[tauri::command]
pub fn delete_library_category(
    id: String,
    school_id: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_books WHERE category_id = ?1 AND school_id = ?2",
            rusqlite::params![id, school_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if count > 0 {
        return Err(
            "Impossible de supprimer : des ouvrages sont rattachés à cette catégorie.".into(),
        );
    }

    conn.execute(
        "DELETE FROM library_categories WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_categories", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "DELETE_LIBRARY_CATEGORY",
        "library_categories",
        &id,
        json!({ "id": id }),
    );
    Ok(())
}

// ──────────────────────────────────────────────
// CATALOGUE DES LIVRES
// ──────────────────────────────────────────────

/// Liste le catalogue des ouvrages (filtre catégorie et recherche libre).
#[tauri::command]
pub fn get_library_books(
    school_id: String,
    category_id: Option<String>,
    search: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryBook>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut clauses: Vec<String> = vec!["b.school_id = ?".to_string()];
    let mut params: Vec<SqlValue> = vec![SqlValue::Text(school_id.clone())];

    if let Some(cat) = category_id.filter(|c| !c.is_empty()) {
        params.push(SqlValue::Text(cat));
        clauses.push(format!("b.category_id = ?{}", params.len()));
    }

    if let Some(q) = search.filter(|s| !s.trim().is_empty()) {
        let pattern = format!("%{}%", q.trim());
        params.push(SqlValue::Text(pattern));
        let idx = params.len();
        clauses.push(format!(
            "(b.title LIKE ?{idx} OR b.author LIKE ?{idx} OR b.isbn LIKE ?{idx} OR b.publisher LIKE ?{idx})"
        ));
    }

    let sql = format!(
        "SELECT b.id, b.school_id, b.category_id, b.isbn, b.title, b.author, b.publisher,
                b.publication_year, b.language, b.edition, b.pages, b.description,
                b.shelf_location, b.is_reference,
                c.name AS category_name,
                (SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id = b.id) AS copy_count,
                (SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id = b.id AND cp.status = 'DISPONIBLE') AS available_count
         FROM library_books b
         LEFT JOIN library_categories c ON c.id = b.category_id
         WHERE {}
         ORDER BY b.title",
        clauses.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryBook {
                id: row.get(0)?,
                school_id: row.get(1)?,
                category_id: row.get(2)?,
                isbn: row.get(3)?,
                title: row.get(4)?,
                author: row.get(5)?,
                publisher: row.get(6)?,
                publication_year: row.get(7)?,
                language: row.get(8)?,
                edition: row.get(9)?,
                pages: row.get(10)?,
                description: row.get(11)?,
                shelf_location: row.get(12)?,
                is_reference: row.get::<_, i64>(13)? != 0,
                category_name: row.get(14)?,
                copy_count: row.get(15)?,
                available_count: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(b) => res.push(b),
            Err(e) => return Err(format!("Erreur lecture ouvrage: {}", e)),
        }
    }
    Ok(res)
}

/// Crée un ouvrage dans le catalogue.
#[tauri::command]
pub fn create_library_book(
    school_id: String,
    category_id: Option<String>,
    isbn: Option<String>,
    title: String,
    author: Option<String>,
    publisher: Option<String>,
    publication_year: Option<i64>,
    language: Option<String>,
    edition: Option<String>,
    pages: Option<i64>,
    description: Option<String>,
    shelf_location: Option<String>,
    is_reference: bool,
    state: State<'_, DbState>,
) -> Result<LibraryBook, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    if title.trim().is_empty() {
        return Err("Le titre de l'ouvrage est obligatoire.".to_string());
    }
    if let Some(isbn) = isbn.as_ref().filter(|i| !i.trim().is_empty()) {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_books WHERE school_id = ?1 AND isbn = ?2",
                rusqlite::params![school_id, isbn.trim()],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            return Err("Cet ISBN est déjà attribué à un autre ouvrage.".to_string());
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO library_books
            (id, school_id, category_id, isbn, title, author, publisher, publication_year,
             language, edition, pages, description, shelf_location, is_reference, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)",
        rusqlite::params![
            id,
            school_id,
            category_id,
            isbn,
            title,
            author,
            publisher,
            publication_year,
            language,
            edition,
            pages,
            description,
            shelf_location,
            if is_reference { 1i64 } else { 0i64 },
            now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_books", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_BOOK",
        "library_books",
        &id,
        json!({ "title": title, "author": author }),
    );

    Ok(LibraryBook {
        id,
        school_id,
        category_id,
        isbn,
        title,
        author,
        publisher,
        publication_year,
        language,
        edition,
        pages,
        description,
        shelf_location,
        is_reference,
        category_name: None,
        copy_count: 0,
        available_count: 0,
    })
}

/// Modifie un ouvrage.
#[tauri::command]
pub fn update_library_book(
    id: String,
    school_id: String,
    category_id: Option<String>,
    isbn: Option<String>,
    title: String,
    author: Option<String>,
    publisher: Option<String>,
    publication_year: Option<i64>,
    language: Option<String>,
    edition: Option<String>,
    pages: Option<i64>,
    description: Option<String>,
    shelf_location: Option<String>,
    is_reference: bool,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    if title.trim().is_empty() {
        return Err("Le titre de l'ouvrage est obligatoire.".to_string());
    }
    if let Some(isbn) = isbn.as_ref().filter(|i| !i.trim().is_empty()) {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_books WHERE school_id = ?1 AND isbn = ?2 AND id <> ?3",
                rusqlite::params![school_id, isbn.trim(), id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            return Err("Cet ISBN est déjà attribué à un autre ouvrage.".to_string());
        }
    }

    let now = now_iso();
    conn.execute(
        "UPDATE library_books
            SET category_id = ?1, isbn = ?2, title = ?3, author = ?4, publisher = ?5,
                publication_year = ?6, language = ?7, edition = ?8, pages = ?9,
                description = ?10, shelf_location = ?11, is_reference = ?12, updated_at = ?13
          WHERE id = ?14 AND school_id = ?15",
        rusqlite::params![
            category_id,
            isbn,
            title,
            author,
            publisher,
            publication_year,
            language,
            edition,
            pages,
            description,
            shelf_location,
            if is_reference { 1i64 } else { 0i64 },
            now,
            id,
            school_id
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_books", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "UPDATE_LIBRARY_BOOK",
        "library_books",
        &id,
        json!({ "title": title }),
    );
    Ok(())
}

/// Supprime un ouvrage (refusé si un emprunt est en cours sur un exemplaire).
#[tauri::command]
pub fn delete_library_book(
    id: String,
    school_id: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_loans l
               JOIN library_copies cp ON cp.id = l.copy_id
              WHERE cp.book_id = ?1 AND l.school_id = ?2 AND l.status = 'EN_COURS'",
            rusqlite::params![id, school_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if active > 0 {
        return Err("Impossible de supprimer : un exemplaire de cet ouvrage est en prêt.".into());
    }

    conn.execute(
        "DELETE FROM library_books WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_books", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "DELETE_LIBRARY_BOOK",
        "library_books",
        &id,
        json!({ "id": id }),
    );
    Ok(())
}

// ──────────────────────────────────────────────
// EXEMPLAIRES & INVENTAIRE
// ──────────────────────────────────────────────

/// Liste les exemplaires (filtre ouvrage, statut ou recherche).
#[tauri::command]
pub fn get_library_copies(
    school_id: String,
    book_id: Option<String>,
    status: Option<String>,
    search: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryCopy>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut clauses: Vec<String> = vec!["cp.school_id = ?".to_string()];
    let mut params: Vec<SqlValue> = vec![SqlValue::Text(school_id.clone())];

    if let Some(b) = book_id.filter(|b| !b.is_empty()) {
        params.push(SqlValue::Text(b));
        clauses.push(format!("cp.book_id = ?{}", params.len()));
    }
    if let Some(s) = status.filter(|s| !s.is_empty() && s != "TOUS") {
        params.push(SqlValue::Text(s));
        clauses.push(format!("cp.status = ?{}", params.len()));
    }
    if let Some(q) = search.filter(|s| !s.trim().is_empty()) {
        let pattern = format!("%{}%", q.trim());
        params.push(SqlValue::Text(pattern));
        let idx = params.len();
        clauses.push(format!(
            "(cp.inventory_code LIKE ?{idx} OR cp.barcode LIKE ?{idx} OR b.title LIKE ?{idx} OR b.author LIKE ?{idx})"
        ));
    }

    let sql = format!(
        "SELECT cp.id, cp.school_id, cp.book_id, cp.inventory_code, cp.barcode, cp.status,
                cp.condition, cp.acquisition_date, cp.acquisition_source, cp.price,
                cp.location, cp.notes,
                b.title AS book_title, b.author AS book_author,
                r.full_name AS reader_name,
                l.due_date AS due_date
         FROM library_copies cp
         JOIN library_books b ON b.id = cp.book_id
         LEFT JOIN library_loans l ON l.copy_id = cp.id AND l.status = 'EN_COURS'
         LEFT JOIN library_readers r ON r.id = l.reader_id
         WHERE {}
         ORDER BY cp.inventory_code",
        clauses.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryCopy {
                id: row.get(0)?,
                school_id: row.get(1)?,
                book_id: row.get(2)?,
                inventory_code: row.get(3)?,
                barcode: row.get(4)?,
                status: row.get(5)?,
                condition: row.get(6)?,
                acquisition_date: row.get(7)?,
                acquisition_source: row.get(8)?,
                price: row.get(9)?,
                location: row.get(10)?,
                notes: row.get(11)?,
                book_title: row.get(12)?,
                book_author: row.get(13)?,
                reader_name: row.get(14)?,
                due_date: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(c) => res.push(c),
            Err(e) => return Err(format!("Erreur lecture exemplaire: {}", e)),
        }
    }
    Ok(res)
}

/// Ajoute N exemplaires d'un ouvrage à l'inventaire.
#[tauri::command]
pub fn create_library_copies(
    school_id: String,
    book_id: String,
    quantity: i64,
    code_prefix: Option<String>,
    condition: Option<String>,
    acquisition_date: Option<String>,
    acquisition_source: Option<String>,
    price: Option<f64>,
    location: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryCopy>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    if quantity < 1 {
        return Err("Le nombre d'exemplaires doit être supérieur à zéro.".to_string());
    }

    let book_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_books WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![book_id, school_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if book_exists == 0 {
        return Err("Ouvrage introuvable.".to_string());
    }

    let prefix = code_prefix.unwrap_or_else(|| "BIB".to_string());
    let condition = condition.unwrap_or_else(|| "Bon".to_string());
    let acquisition_date = acquisition_date.unwrap_or_else(today);
    let now = now_iso();

    let mut created: Vec<LibraryCopy> = Vec::new();
    for _ in 0..quantity {
        let id = uuid::Uuid::new_v4().to_string();
        let code = next_inventory_code(&conn, &school_id, &prefix);
        conn.execute(
            "INSERT INTO library_copies
                (id, school_id, book_id, inventory_code, barcode, status, condition,
                 acquisition_date, acquisition_source, price, location, notes, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?4,'DISPONIBLE',?5,?6,?7,?8,?9,NULL,?10,?10)",
            rusqlite::params![
                id,
                school_id,
                book_id,
                code,
                condition,
                acquisition_date,
                acquisition_source,
                price,
                location,
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;

        enqueue_entity(&conn, "library_copies", &school_id, &id);
        created.push(LibraryCopy {
            id,
            school_id: school_id.clone(),
            book_id: book_id.clone(),
            inventory_code: code,
            barcode: None,
            status: "DISPONIBLE".to_string(),
            condition: Some(condition.clone()),
            acquisition_date: Some(acquisition_date.clone()),
            acquisition_source: acquisition_source.clone(),
            price,
            location: location.clone(),
            notes: None,
            book_title: None,
            book_author: None,
            reader_name: None,
            due_date: None,
        });
    }

    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_COPIES",
        "library_copies",
        &book_id,
        json!({ "quantity": quantity, "book_id": book_id }),
    );

    Ok(created)
}

/// Modifie un exemplaire (état, état physique, localisation…).
#[tauri::command]
pub fn update_library_copy(
    id: String,
    school_id: String,
    status: Option<String>,
    condition: Option<String>,
    barcode: Option<String>,
    acquisition_date: Option<String>,
    acquisition_source: Option<String>,
    price: Option<f64>,
    location: Option<String>,
    notes: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    // Un exemplaire prêté ne peut pas changer de statut manuellement.
    let on_loan: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_loans WHERE copy_id = ?1 AND status = 'EN_COURS'",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if on_loan > 0 && status.is_some() {
        return Err("Cet exemplaire est en prêt : enregistrez d'abord son retour.".into());
    }

    let now = now_iso();
    conn.execute(
        "UPDATE library_copies
            SET status = COALESCE(?1, status),
                condition = COALESCE(?2, condition),
                barcode = COALESCE(?3, barcode),
                acquisition_date = COALESCE(?4, acquisition_date),
                acquisition_source = COALESCE(?5, acquisition_source),
                price = COALESCE(?6, price),
                location = COALESCE(?7, location),
                notes = COALESCE(?8, notes),
                updated_at = ?9
          WHERE id = ?10 AND school_id = ?11",
        rusqlite::params![
            status,
            condition,
            barcode,
            acquisition_date,
            acquisition_source,
            price,
            location,
            notes,
            now,
            id,
            school_id
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_copies", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "UPDATE_LIBRARY_COPY",
        "library_copies",
        &id,
        json!({ "status": status, "condition": condition }),
    );
    Ok(())
}

/// Retire un exemplaire de l'inventaire (refusé s'il est prêté).
#[tauri::command]
pub fn delete_library_copy(
    id: String,
    school_id: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let on_loan: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_loans WHERE copy_id = ?1 AND status = 'EN_COURS'",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if on_loan > 0 {
        return Err("Impossible de retirer cet exemplaire : il est en prêt.".into());
    }

    conn.execute(
        "DELETE FROM library_copies WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_copies", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "DELETE_LIBRARY_COPY",
        "library_copies",
        &id,
        json!({ "id": id }),
    );
    Ok(())
}

// ──────────────────────────────────────────────
// LECTEURS
// ──────────────────────────────────────────────

/// Liste les lecteurs de l'établissement.
#[tauri::command]
pub fn get_library_readers(
    school_id: String,
    search: Option<String>,
    reader_type: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryReader>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut clauses: Vec<String> = vec!["r.school_id = ?".to_string()];
    let mut params: Vec<SqlValue> = vec![SqlValue::Text(school_id.clone())];

    if let Some(t) = reader_type.filter(|t| !t.is_empty() && t != "TOUS") {
        params.push(SqlValue::Text(t));
        clauses.push(format!("r.reader_type = ?{}", params.len()));
    }
    if let Some(q) = search.filter(|s| !s.trim().is_empty()) {
        let pattern = format!("%{}%", q.trim());
        params.push(SqlValue::Text(pattern));
        let idx = params.len();
        clauses.push(format!(
            "(r.full_name LIKE ?{idx} OR r.card_number LIKE ?{idx} OR r.email LIKE ?{idx} OR r.class_name LIKE ?{idx})"
        ));
    }

    let sql = format!(
        "SELECT r.id, r.school_id, r.reader_type, r.student_id, r.staff_id, r.full_name,
                r.email, r.phone, r.card_number, r.class_name, r.max_loans, r.status,
                r.registered_at, r.expires_at, r.notes,
                (SELECT COUNT(*) FROM library_loans l WHERE l.reader_id = r.id AND l.status = 'EN_COURS') AS active_loans,
                (SELECT COUNT(*) FROM library_penalties p WHERE p.reader_id = r.id AND p.status = 'EN_ATTENTE') AS unpaid_penalties
         FROM library_readers r
         WHERE {}
         ORDER BY r.full_name",
        clauses.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryReader {
                id: row.get(0)?,
                school_id: row.get(1)?,
                reader_type: row.get(2)?,
                student_id: row.get(3)?,
                staff_id: row.get(4)?,
                full_name: row.get(5)?,
                email: row.get(6)?,
                phone: row.get(7)?,
                card_number: row.get(8)?,
                class_name: row.get(9)?,
                max_loans: row.get(10)?,
                status: row.get(11)?,
                registered_at: row.get(12)?,
                expires_at: row.get(13)?,
                notes: row.get(14)?,
                active_loans: row.get(15)?,
                unpaid_penalties: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(x) => res.push(x),
            Err(e) => return Err(format!("Erreur lecture lecteur: {}", e)),
        }
    }
    Ok(res)
}

/// Crée une fiche de lecteur.
#[tauri::command]
pub fn create_library_reader(
    school_id: String,
    reader_type: String,
    student_id: Option<String>,
    staff_id: Option<String>,
    full_name: String,
    email: Option<String>,
    phone: Option<String>,
    card_number: Option<String>,
    class_name: Option<String>,
    max_loans: Option<i64>,
    status: Option<String>,
    notes: Option<String>,
    state: State<'_, DbState>,
) -> Result<LibraryReader, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    if full_name.trim().is_empty() {
        return Err("Le nom du lecteur est obligatoire.".to_string());
    }

    if let Some(sid) = student_id.as_ref().filter(|s| !s.is_empty()) {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_readers WHERE school_id = ?1 AND student_id = ?2",
                rusqlite::params![school_id, sid],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            return Err("Cet élève possède déjà une fiche de lecteur.".to_string());
        }
    }

    let settings = load_settings(&conn, &school_id)?;
    let card = match card_number.filter(|c| !c.trim().is_empty()) {
        Some(c) => c.trim().to_string(),
        None => next_card_number(&conn, &school_id),
    };
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_readers WHERE school_id = ?1 AND card_number = ?2",
            rusqlite::params![school_id, card],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if exists > 0 {
        return Err("Ce numéro de carte est déjà attribué.".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    let max_loans = max_loans.unwrap_or(settings.max_loans_per_reader);
    let status = status.unwrap_or_else(|| "ACTIF".to_string());

    conn.execute(
        "INSERT INTO library_readers
            (id, school_id, reader_type, student_id, staff_id, full_name, email, phone,
             card_number, class_name, max_loans, status, registered_at, expires_at, notes, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,NULL,?14,?15,?15)",
        rusqlite::params![
            id,
            school_id,
            reader_type,
            student_id,
            staff_id,
            full_name,
            email,
            phone,
            card,
            class_name,
            max_loans,
            status,
            today(),
            notes,
            now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_readers", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_READER",
        "library_readers",
        &id,
        json!({ "full_name": full_name, "card_number": card }),
    );

    Ok(LibraryReader {
        id,
        school_id,
        reader_type,
        student_id,
        staff_id,
        full_name,
        email,
        phone,
        card_number: card,
        class_name,
        max_loans,
        status,
        registered_at: None,
        expires_at: None,
        notes,
        active_loans: 0,
        unpaid_penalties: 0,
    })
}

/// Inscrit un élève comme lecteur (rattachement à la fiche élève).
#[tauri::command]
pub fn register_student_as_reader(
    school_id: String,
    student_id: String,
    state: State<'_, DbState>,
) -> Result<LibraryReader, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let student: Option<(String, String, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT s.first_name, s.last_name, s.email, s.phone
               FROM students s
               JOIN enrollments e ON e.student_id = s.id AND e.school_id = ?2
              WHERE s.id = ?1
              LIMIT 1",
            rusqlite::params![student_id, school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();

    let Some((first_name, last_name, email, phone)) = student else {
        return Err("Élève introuvable dans cet établissement.".to_string());
    };

    let class_name: Option<String> = conn
        .query_row(
            "SELECT c.name FROM enrollments e JOIN classes c ON c.id = e.class_id
              WHERE e.student_id = ?1 AND e.school_id = ?2 LIMIT 1",
            rusqlite::params![student_id, school_id],
            |r| r.get(0),
        )
        .ok();

    let full_name = format!("{} {}", first_name, last_name).trim().to_string();
    let settings = load_settings(&conn, &school_id)?;
    let card = next_card_number(&conn, &school_id);
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO library_readers
            (id, school_id, reader_type, student_id, staff_id, full_name, email, phone,
             card_number, class_name, max_loans, status, registered_at, expires_at, notes, created_at, updated_at)
         VALUES (?1,?2,'ELEVE',?3,NULL,?4,?5,?6,?7,?8,?9,'ACTIF',?10,NULL,NULL,?11,?11)",
        rusqlite::params![
            id,
            school_id,
            student_id,
            full_name,
            email,
            phone,
            card,
            class_name,
            settings.max_loans_per_reader,
            today(),
            now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_readers", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "REGISTER_STUDENT_READER",
        "library_readers",
        &id,
        json!({ "student_id": student_id, "full_name": full_name }),
    );

    Ok(LibraryReader {
        id,
        school_id,
        reader_type: "ELEVE".to_string(),
        student_id: Some(student_id),
        staff_id: None,
        full_name,
        email,
        phone,
        card_number: card,
        class_name,
        max_loans: settings.max_loans_per_reader,
        status: "ACTIF".to_string(),
        registered_at: None,
        expires_at: None,
        notes: None,
        active_loans: 0,
        unpaid_penalties: 0,
    })
}

/// Modifie une fiche de lecteur.
#[tauri::command]
pub fn update_library_reader(
    id: String,
    school_id: String,
    reader_type: Option<String>,
    full_name: String,
    email: Option<String>,
    phone: Option<String>,
    card_number: Option<String>,
    class_name: Option<String>,
    max_loans: Option<i64>,
    status: Option<String>,
    expires_at: Option<String>,
    notes: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE library_readers
            SET reader_type = COALESCE(?1, reader_type),
                full_name = ?2,
                email = COALESCE(?3, email),
                phone = COALESCE(?4, phone),
                card_number = COALESCE(?5, card_number),
                class_name = COALESCE(?6, class_name),
                max_loans = COALESCE(?7, max_loans),
                status = COALESCE(?8, status),
                expires_at = COALESCE(?9, expires_at),
                notes = COALESCE(?10, notes),
                updated_at = ?11
          WHERE id = ?12 AND school_id = ?13",
        rusqlite::params![
            reader_type,
            full_name,
            email,
            phone,
            card_number,
            class_name,
            max_loans,
            status,
            expires_at,
            notes,
            now,
            id,
            school_id
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_readers", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "UPDATE_LIBRARY_READER",
        "library_readers",
        &id,
        json!({ "full_name": full_name }),
    );
    Ok(())
}

/// Supprime une fiche de lecteur (refusée s'il a des emprunts en cours).
#[tauri::command]
pub fn delete_library_reader(
    id: String,
    school_id: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let active: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_loans WHERE reader_id = ?1 AND status = 'EN_COURS'",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if active > 0 {
        return Err("Impossible de supprimer : ce lecteur a des emprunts en cours.".into());
    }

    conn.execute(
        "DELETE FROM library_readers WHERE id = ?1 AND school_id = ?2",
        rusqlite::params![id, school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_readers", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "DELETE_LIBRARY_READER",
        "library_readers",
        &id,
        json!({ "id": id }),
    );
    Ok(())
}

// ──────────────────────────────────────────────
// EMPRUNTS & RETOURS
// ──────────────────────────────────────────────

/// Liste les emprunts (en cours, historique, ou tous).
#[tauri::command]
pub fn get_library_loans(
    school_id: String,
    scope: Option<String>,
    reader_id: Option<String>,
    book_id: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryLoan>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let settings = load_settings(&conn, &school_id)?;
    let current = today();

    let mut clauses: Vec<String> = vec!["l.school_id = ?".to_string()];
    let mut params: Vec<SqlValue> = vec![SqlValue::Text(school_id.clone())];

    match scope.as_deref() {
        Some("EN_COURS") => clauses.push("l.status = 'EN_COURS'".to_string()),
        Some("HISTORIQUE") => clauses.push("l.status <> 'EN_COURS'".to_string()),
        _ => {}
    }
    if let Some(r) = reader_id.filter(|r| !r.is_empty()) {
        params.push(SqlValue::Text(r));
        clauses.push(format!("l.reader_id = ?{}", params.len()));
    }
    if let Some(b) = book_id.filter(|b| !b.is_empty()) {
        params.push(SqlValue::Text(b));
        clauses.push(format!("l.book_id = ?{}", params.len()));
    }

    let sql = format!(
        "SELECT l.id, l.school_id, l.copy_id, l.reader_id, l.book_id, l.loan_date, l.due_date,
                l.returned_at, l.status, l.loan_condition, l.notes, l.created_by,
                b.title AS book_title, b.author AS book_author,
                cp.inventory_code, r.full_name AS reader_name, r.reader_type,
                COALESCE(rt.late_days, 0) AS late_days,
                COALESCE(rt.fine_amount, 0) AS fine_amount
         FROM library_loans l
         JOIN library_books b ON b.id = l.book_id
         JOIN library_copies cp ON cp.id = l.copy_id
         JOIN library_readers r ON r.id = l.reader_id
         LEFT JOIN library_returns rt ON rt.loan_id = l.id
         WHERE {}
         ORDER BY (l.status = 'EN_COURS') DESC, l.due_date",
        clauses.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryLoan {
                id: row.get(0)?,
                school_id: row.get(1)?,
                copy_id: row.get(2)?,
                reader_id: row.get(3)?,
                book_id: row.get(4)?,
                loan_date: row.get(5)?,
                due_date: row.get(6)?,
                returned_at: row.get(7)?,
                status: row.get(8)?,
                loan_condition: row.get(9)?,
                notes: row.get(10)?,
                created_by: row.get(11)?,
                book_title: row.get(12)?,
                book_author: row.get(13)?,
                inventory_code: row.get(14)?,
                reader_name: row.get(15)?,
                reader_type: row.get(16)?,
                late_days: row.get(17)?,
                fine_amount: row.get(18)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(mut l) => {
                // Retard calculé côté Rust : cohérent quel que soit le fuseau du poste.
                if l.status == "EN_COURS" {
                    let overdue = days_between(&l.due_date, &current);
                    if overdue > 0 {
                        l.late_days = overdue;
                        l.fine_amount = (overdue as f64) * settings.fine_per_day;
                    }
                }
                res.push(l);
            }
            Err(e) => return Err(format!("Erreur lecture emprunt: {}", e)),
        }
    }
    Ok(res)
}

/// Enregistre un nouvel emprunt (contrôles métier côté Rust).
#[tauri::command]
pub fn create_library_loan(
    school_id: String,
    reader_id: String,
    copy_id: String,
    loan_date: Option<String>,
    due_date: Option<String>,
    notes: Option<String>,
    created_by: Option<String>,
    state: State<'_, DbState>,
) -> Result<LibraryLoan, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    create_library_loan_inner(
        &conn, school_id, reader_id, copy_id, loan_date, due_date, notes, created_by,
    )
}

/// Crée un emprunt (fonction interne, testable sans runtime Tauri).
fn create_library_loan_inner(
    conn: &Connection,
    school_id: String,
    reader_id: String,
    copy_id: String,
    loan_date: Option<String>,
    due_date: Option<String>,
    notes: Option<String>,
    created_by: Option<String>,
) -> Result<LibraryLoan, String> {
    let settings = load_settings(conn, &school_id)?;

    // 1. Le lecteur doit exister et être actif
    let reader: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT full_name, status, max_loans FROM library_readers WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![reader_id, school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok();
    let Some((reader_name, reader_status, reader_max)) = reader else {
        return Err("Lecteur introuvable.".to_string());
    };
    if reader_status != "ACTIF" {
        return Err(format!(
            "Le lecteur {} n'est pas actif (statut : {}).",
            reader_name, reader_status
        ));
    }

    // 2. L'exemplaire doit être disponible
    let copy: Option<(String, String, String, i64)> = conn
        .query_row(
            "SELECT cp.book_id, cp.status, cp.inventory_code, b.is_reference
               FROM library_copies cp
               JOIN library_books b ON b.id = cp.book_id
              WHERE cp.id = ?1 AND cp.school_id = ?2",
            rusqlite::params![copy_id, school_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .ok();
    let Some((book_id, copy_status, inventory_code, is_reference)) = copy else {
        return Err("Exemplaire introuvable.".to_string());
    };
    if copy_status != "DISPONIBLE" {
        return Err(format!(
            "L'exemplaire {} n'est pas disponible (statut : {}).",
            inventory_code, copy_status
        ));
    }
    if is_reference != 0 {
        return Err(format!(
            "L'exemplaire {} est un ouvrage de référence : il reste en consultation sur place.",
            inventory_code
        ));
    }

    // 3. Quota d'emprunts
    let active_loans: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_loans WHERE reader_id = ?1 AND status = 'EN_COURS'",
            rusqlite::params![reader_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let limit = if reader_max > 0 {
        reader_max
    } else {
        settings.max_loans_per_reader
    };
    if active_loans >= limit {
        return Err(format!(
            "Limite atteinte : {} emprunt(s) en cours sur {}. Effectuez un retour avant un nouvel emprunt.",
            active_loans, limit
        ));
    }

    // 4. Création de l'emprunt
    let loan_date = loan_date.unwrap_or_else(today);
    let due_date = due_date.unwrap_or_else(|| add_days(&loan_date, settings.loan_duration_days));
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO library_loans
            (id, school_id, copy_id, reader_id, book_id, loan_date, due_date, returned_at,
             status, loan_condition, notes, created_by, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,'EN_COURS','Bon',?8,?9,?10,?10)",
        rusqlite::params![
            id, school_id, copy_id, reader_id, book_id, loan_date, due_date, notes, created_by, now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    // 5. L'exemplaire sort du stock disponible
    conn.execute(
        "UPDATE library_copies SET status = 'EMPRUNTE', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, copy_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "library_copies", &school_id, &copy_id);

    // 6. La réservation éventuelle du lecteur sur cet ouvrage est satisfaite
    let pending_reservation: Option<String> = conn
        .query_row(
            "SELECT id FROM library_reservations
              WHERE book_id = ?1 AND reader_id = ?2 AND status IN ('EN_ATTENTE', 'DISPONIBLE')
              ORDER BY reserved_at LIMIT 1",
            rusqlite::params![book_id, reader_id],
            |r| r.get(0),
        )
        .ok();
    if let Some(res_id) = pending_reservation {
        conn.execute(
            "UPDATE library_reservations
                SET status = 'SATISFAITE', fulfilled_at = ?1, loan_id = ?2, updated_at = ?1
              WHERE id = ?3",
            rusqlite::params![now, id, res_id],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_reservations", &school_id, &res_id);
    }

    enqueue_entity(&conn, "library_loans", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_LOAN",
        "library_loans",
        &id,
        json!({
            "reader": reader_name,
            "inventory_code": inventory_code,
            "loan_date": loan_date,
            "due_date": due_date
        }),
    );

    let (book_title, book_author) = conn
        .query_row(
            "SELECT title, author FROM library_books WHERE id = ?1",
            rusqlite::params![book_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .unwrap_or((String::new(), None));

    Ok(LibraryLoan {
        id,
        school_id,
        copy_id,
        reader_id,
        book_id,
        loan_date,
        due_date,
        returned_at: None,
        status: "EN_COURS".to_string(),
        loan_condition: Some("Bon".to_string()),
        notes,
        created_by,
        book_title: Some(book_title),
        book_author,
        inventory_code: Some(inventory_code),
        reader_name: Some(reader_name),
        reader_type: None,
        late_days: 0,
        fine_amount: 0.0,
    })
}

/// Enregistre le retour d'un exemplaire (calcule le retard et la pénalité).
#[tauri::command]
pub fn return_library_loan(
    loan_id: String,
    school_id: String,
    returned_at: Option<String>,
    condition: Option<String>,
    remarks: Option<String>,
    handled_by: Option<String>,
    state: State<'_, DbState>,
) -> Result<LibraryReturn, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    return_library_loan_inner(
        &conn,
        loan_id,
        school_id,
        returned_at,
        condition,
        remarks,
        handled_by,
    )
}

/// Enregistre le retour d'un exemplaire (fonction interne, testable sans runtime Tauri).
fn return_library_loan_inner(
    conn: &Connection,
    loan_id: String,
    school_id: String,
    returned_at: Option<String>,
    condition: Option<String>,
    remarks: Option<String>,
    handled_by: Option<String>,
) -> Result<LibraryReturn, String> {
    let settings = load_settings(conn, &school_id)?;

    let loan: Option<(String, String, String, String, String, String)> = conn
        .query_row(
            "SELECT copy_id, reader_id, book_id, due_date, status, loan_date
               FROM library_loans WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![loan_id, school_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .ok();
    let Some((copy_id, reader_id, book_id, due_date, status, _loan_date)) = loan else {
        return Err("Emprunt introuvable.".to_string());
    };
    if status != "EN_COURS" {
        return Err("Cet emprunt est déjà clôturé.".to_string());
    }

    let returned_at = returned_at.unwrap_or_else(today);
    let condition = condition.unwrap_or_else(|| "Bon".to_string());

    // Retard : jours écoulés au-delà de l'échéance, hors délai de grâce
    let raw_late = days_between(&due_date, &returned_at);
    let late_days = if raw_late > settings.grace_days {
        raw_late - settings.grace_days
    } else {
        0
    };
    let fine_amount = (late_days as f64) * settings.fine_per_day;

    let now = now_iso();

    // 1. L'emprunt est clôturé
    conn.execute(
        "UPDATE library_loans
            SET returned_at = ?1, status = 'RETOURNE', loan_condition = ?2, updated_at = ?3
          WHERE id = ?4",
        rusqlite::params![returned_at, condition, now, loan_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    // 2. Le retour est historisé
    let return_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO library_returns
            (id, school_id, loan_id, copy_id, reader_id, returned_at, loan_condition,
             late_days, fine_amount, remarks, handled_by, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)",
        rusqlite::params![
            return_id,
            school_id,
            loan_id,
            copy_id,
            reader_id,
            returned_at,
            condition,
            late_days,
            fine_amount,
            remarks,
            handled_by,
            now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "library_returns", &school_id, &return_id);

    // 3. L'exemplaire redevient disponible (sauf dégradé)
    let copy_status = if condition == "Hors service" || condition == "Mauvais" {
        "MAINTENANCE"
    } else {
        "DISPONIBLE"
    };
    conn.execute(
        "UPDATE library_copies SET status = ?1, condition = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![copy_status, condition, now, copy_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "library_copies", &school_id, &copy_id);

    // 4. Pénalité de retard
    if late_days > 0 {
        let penalty_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO library_penalties
                (id, school_id, reader_id, loan_id, penalty_type, amount, days_late, description, status, paid_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,'RETARD',?5,?6,?7,'EN_ATTENTE',NULL,?8,?8)",
            rusqlite::params![
                penalty_id,
                school_id,
                reader_id,
                loan_id,
                fine_amount,
                late_days,
                format!(
                    "Retard de {} jour(s) — {} jour(s) de grâce",
                    late_days, settings.grace_days
                ),
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_penalties", &school_id, &penalty_id);
    }

    // 5. La plus ancienne réservation sur cet ouvrage devient disponible
    let next_reservation: Option<String> = conn
        .query_row(
            "SELECT id FROM library_reservations
              WHERE book_id = ?1 AND status = 'EN_ATTENTE'
              ORDER BY reserved_at LIMIT 1",
            rusqlite::params![book_id],
            |r| r.get(0),
        )
        .ok();
    if let Some(res_id) = next_reservation {
        let expires = add_days(&today(), settings.reservation_expiry_days);
        conn.execute(
            "UPDATE library_reservations
                SET status = 'DISPONIBLE', available_at = ?1, notified_at = ?1, expires_at = ?2, updated_at = ?1
              WHERE id = ?3",
            rusqlite::params![now, expires, res_id],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_reservations", &school_id, &res_id);
    }

    enqueue_entity(&conn, "library_loans", &school_id, &loan_id);
    audit(
        &conn,
        &school_id,
        "RETURN_LIBRARY_LOAN",
        "library_loans",
        &loan_id,
        json!({
            "returned_at": returned_at,
            "late_days": late_days,
            "fine_amount": fine_amount
        }),
    );

    let (book_title, reader_name, inventory_code) = conn
        .query_row(
            "SELECT b.title, r.full_name, cp.inventory_code
               FROM library_books b
               JOIN library_copies cp ON cp.book_id = b.id
               JOIN library_readers r ON r.id = ?2
              WHERE b.id = ?1 AND cp.id = ?3",
            rusqlite::params![book_id, reader_id, copy_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .unwrap_or((String::new(), String::new(), String::new()));

    Ok(LibraryReturn {
        id: return_id,
        school_id,
        loan_id,
        copy_id,
        reader_id,
        returned_at,
        loan_condition: Some(condition),
        late_days,
        fine_amount,
        remarks,
        handled_by,
        book_title: Some(book_title),
        inventory_code: Some(inventory_code),
        reader_name: Some(reader_name),
    })
}

/// Prolonge un emprunt de N jours supplémentaires.
#[tauri::command]
pub fn extend_library_loan(
    loan_id: String,
    school_id: String,
    days: i64,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    if days <= 0 {
        return Err("La prolongation doit être supérieure à zéro jour.".to_string());
    }

    let due_date: Option<String> = conn
        .query_row(
            "SELECT due_date FROM library_loans WHERE id = ?1 AND school_id = ?2 AND status = 'EN_COURS'",
            rusqlite::params![loan_id, school_id],
            |r| r.get(0),
        )
        .ok();
    let Some(due_date) = due_date else {
        return Err("Emprunt en cours introuvable.".to_string());
    };

    let new_due = add_days(&due_date, days);
    let now = now_iso();
    conn.execute(
        "UPDATE library_loans SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_due, now, loan_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_loans", &school_id, &loan_id);
    audit(
        &conn,
        &school_id,
        "EXTEND_LIBRARY_LOAN",
        "library_loans",
        &loan_id,
        json!({ "days": days, "new_due_date": new_due }),
    );
    Ok(())
}

// ──────────────────────────────────────────────
// PÉNALITÉS
// ──────────────────────────────────────────────

/// Liste les pénalités (toutes ou filtrées par statut).
#[tauri::command]
pub fn get_library_penalties(
    school_id: String,
    status: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryPenalty>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut clauses: Vec<String> = vec!["p.school_id = ?".to_string()];
    let mut params: Vec<SqlValue> = vec![SqlValue::Text(school_id.clone())];
    if let Some(s) = status.filter(|s| !s.is_empty() && s != "TOUS") {
        params.push(SqlValue::Text(s));
        clauses.push(format!("p.status = ?{}", params.len()));
    }

    let sql = format!(
        "SELECT p.id, p.school_id, p.reader_id, p.loan_id, p.penalty_type, p.amount,
                p.days_late, p.description, p.status, p.paid_at,
                r.full_name AS reader_name, r.reader_type,
                b.title AS book_title
         FROM library_penalties p
         JOIN library_readers r ON r.id = p.reader_id
         LEFT JOIN library_loans l ON l.id = p.loan_id
         LEFT JOIN library_books b ON b.id = l.book_id
         WHERE {}
         ORDER BY (p.status = 'EN_ATTENTE') DESC, p.created_at DESC",
        clauses.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryPenalty {
                id: row.get(0)?,
                school_id: row.get(1)?,
                reader_id: row.get(2)?,
                loan_id: row.get(3)?,
                penalty_type: row.get(4)?,
                amount: row.get(5)?,
                days_late: row.get(6)?,
                description: row.get(7)?,
                status: row.get(8)?,
                paid_at: row.get(9)?,
                reader_name: row.get(10)?,
                reader_type: row.get(11)?,
                book_title: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(p) => res.push(p),
            Err(e) => return Err(format!("Erreur lecture pénalité: {}", e)),
        }
    }
    Ok(res)
}

/// Crée une pénalité manuelle (perte, dégradation, autre).
#[tauri::command]
pub fn create_library_penalty(
    school_id: String,
    reader_id: String,
    loan_id: Option<String>,
    penalty_type: String,
    amount: f64,
    days_late: i64,
    description: Option<String>,
    state: State<'_, DbState>,
) -> Result<LibraryPenalty, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();

    conn.execute(
        "INSERT INTO library_penalties
            (id, school_id, reader_id, loan_id, penalty_type, amount, days_late, description, status, paid_at, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'EN_ATTENTE',NULL,?9,?9)",
        rusqlite::params![
            id,
            school_id,
            reader_id,
            loan_id,
            penalty_type,
            amount,
            days_late,
            description,
            now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_penalties", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_PENALTY",
        "library_penalties",
        &id,
        json!({ "penalty_type": penalty_type, "amount": amount }),
    );

    Ok(LibraryPenalty {
        id,
        school_id,
        reader_id,
        loan_id,
        penalty_type,
        amount,
        days_late,
        description,
        status: "EN_ATTENTE".to_string(),
        paid_at: None,
        reader_name: None,
        reader_type: None,
        book_title: None,
    })
}

/// Marque une pénalité comme payée.
#[tauri::command]
pub fn pay_library_penalty(
    id: String,
    school_id: String,
    amount: Option<f64>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = now_iso();

    let updated = conn
        .execute(
            "UPDATE library_penalties
                SET status = 'PAYEE', paid_at = ?1,
                    amount = COALESCE(?2, amount), updated_at = ?1
              WHERE id = ?3 AND school_id = ?4",
            rusqlite::params![now, amount, id, school_id],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
    if updated == 0 {
        return Err("Pénalité introuvable.".to_string());
    }

    enqueue_entity(&conn, "library_penalties", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "PAY_LIBRARY_PENALTY",
        "library_penalties",
        &id,
        json!({ "amount": amount }),
    );
    Ok(())
}

/// Remet une pénalité (mise en grâce).
#[tauri::command]
pub fn waive_library_penalty(
    id: String,
    school_id: String,
    reason: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = now_iso();

    let updated = conn
        .execute(
            "UPDATE library_penalties
                SET status = 'REMISEE',
                    description = COALESCE(?1, description),
                    updated_at = ?2
              WHERE id = ?3 AND school_id = ?4",
            rusqlite::params![reason, now, id, school_id],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
    if updated == 0 {
        return Err("Pénalité introuvable.".to_string());
    }

    enqueue_entity(&conn, "library_penalties", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "WAIVE_LIBRARY_PENALTY",
        "library_penalties",
        &id,
        json!({ "reason": reason }),
    );
    Ok(())
}

// ──────────────────────────────────────────────
// RÉSERVATIONS
// ──────────────────────────────────────────────

/// Liste les réservations.
#[tauri::command]
pub fn get_library_reservations(
    school_id: String,
    status: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryReservation>, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let mut clauses: Vec<String> = vec!["rs.school_id = ?".to_string()];
    let mut params: Vec<SqlValue> = vec![SqlValue::Text(school_id.clone())];
    if let Some(s) = status.filter(|s| !s.is_empty() && s != "TOUS") {
        params.push(SqlValue::Text(s));
        clauses.push(format!("rs.status = ?{}", params.len()));
    }

    let sql = format!(
        "SELECT rs.id, rs.school_id, rs.book_id, rs.reader_id, rs.reserved_at, rs.available_at,
                rs.expires_at, rs.status, rs.queue_position, rs.notified_at, rs.fulfilled_at, rs.loan_id,
                b.title AS book_title, b.author AS book_author,
                r.full_name AS reader_name, r.reader_type,
                (SELECT COUNT(*) FROM library_copies cp WHERE cp.book_id = rs.book_id AND cp.status = 'DISPONIBLE') AS available_copies
         FROM library_reservations rs
         JOIN library_books b ON b.id = rs.book_id
         JOIN library_readers r ON r.id = rs.reader_id
         WHERE {}
         ORDER BY (rs.status IN ('EN_ATTENTE', 'DISPONIBLE')) DESC, rs.reserved_at",
        clauses.join(" AND ")
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(LibraryReservation {
                id: row.get(0)?,
                school_id: row.get(1)?,
                book_id: row.get(2)?,
                reader_id: row.get(3)?,
                reserved_at: row.get(4)?,
                available_at: row.get(5)?,
                expires_at: row.get(6)?,
                status: row.get(7)?,
                queue_position: row.get(8)?,
                notified_at: row.get(9)?,
                fulfilled_at: row.get(10)?,
                loan_id: row.get(11)?,
                book_title: row.get(12)?,
                book_author: row.get(13)?,
                reader_name: row.get(14)?,
                reader_type: row.get(15)?,
                available_copies: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in rows {
        match r {
            Ok(x) => res.push(x),
            Err(e) => return Err(format!("Erreur lecture réservation: {}", e)),
        }
    }
    Ok(res)
}

/// Réserve un ouvrage pour un lecteur.
#[tauri::command]
pub fn create_library_reservation(
    school_id: String,
    book_id: String,
    reader_id: String,
    state: State<'_, DbState>,
) -> Result<LibraryReservation, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let settings = load_settings(&conn, &school_id)?;

    let book_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_books WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![book_id, school_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if book_exists == 0 {
        return Err("Ouvrage introuvable.".to_string());
    }

    // Un ouvrage de référence reste consultable sur place : il ne se réserve pas.
    let is_reference: i64 = conn
        .query_row(
            "SELECT is_reference FROM library_books WHERE id = ?1",
            rusqlite::params![book_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if is_reference != 0 {
        return Err(
            "Un ouvrage de référence est consultable sur place : aucune réservation nécessaire."
                .to_string(),
        );
    }

    let reader_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_readers WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![reader_id, school_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if reader_exists == 0 {
        return Err("Lecteur introuvable.".to_string());
    }

    let duplicate: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_reservations
              WHERE book_id = ?1 AND reader_id = ?2 AND status IN ('EN_ATTENTE', 'DISPONIBLE')",
            rusqlite::params![book_id, reader_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if duplicate > 0 {
        return Err("Ce lecteur a déjà une réservation active sur cet ouvrage.".to_string());
    }

    // Position dans la file d'attente
    let queue: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM library_reservations
              WHERE book_id = ?1 AND status IN ('EN_ATTENTE', 'DISPONIBLE')",
            rusqlite::params![book_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    let reserved_at = today();
    let expires_at = add_days(&reserved_at, settings.reservation_expiry_days);

    conn.execute(
        "INSERT INTO library_reservations
            (id, school_id, book_id, reader_id, reserved_at, available_at, expires_at,
             status, queue_position, notified_at, fulfilled_at, loan_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,NULL,?6,'EN_ATTENTE',?7,NULL,NULL,NULL,?8,?8)",
        rusqlite::params![
            id,
            school_id,
            book_id,
            reader_id,
            reserved_at,
            expires_at,
            queue + 1,
            now
        ],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    enqueue_entity(&conn, "library_reservations", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CREATE_LIBRARY_RESERVATION",
        "library_reservations",
        &id,
        json!({ "book_id": book_id, "reader_id": reader_id }),
    );

    let (book_title, book_author, reader_name) = conn
        .query_row(
            "SELECT b.title, b.author, r.full_name
               FROM library_books b, library_readers r
              WHERE b.id = ?1 AND r.id = ?2",
            rusqlite::params![book_id, reader_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, String>(2)?,
                ))
            },
        )
        .unwrap_or((String::new(), None, String::new()));

    Ok(LibraryReservation {
        id,
        school_id,
        book_id,
        reader_id,
        reserved_at,
        available_at: None,
        expires_at: Some(expires_at),
        status: "EN_ATTENTE".to_string(),
        queue_position: queue + 1,
        notified_at: None,
        fulfilled_at: None,
        loan_id: None,
        book_title: Some(book_title),
        book_author,
        reader_name: Some(reader_name),
        reader_type: None,
        available_copies: 0,
    })
}

/// Annule une réservation.
#[tauri::command]
pub fn cancel_library_reservation(
    id: String,
    school_id: String,
    reason: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = now_iso();

    let updated = conn
        .execute(
            "UPDATE library_reservations
                SET status = 'ANNULEE',
                    notes = COALESCE(?1, notes),
                    updated_at = ?2
              WHERE id = ?3 AND school_id = ?4",
            rusqlite::params![reason, now, id, school_id],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
    if updated == 0 {
        return Err("Réservation introuvable.".to_string());
    }

    enqueue_entity(&conn, "library_reservations", &school_id, &id);
    audit(
        &conn,
        &school_id,
        "CANCEL_LIBRARY_RESERVATION",
        "library_reservations",
        &id,
        json!({ "reason": reason }),
    );
    Ok(())
}

/// Satisfait une réservation : crée l'emprunt correspondant.
#[tauri::command]
pub fn fulfill_library_reservation(
    id: String,
    school_id: String,
    copy_id: Option<String>,
    state: State<'_, DbState>,
) -> Result<LibraryLoan, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    let reservation: Option<(String, String, String)> = conn
        .query_row(
            "SELECT book_id, reader_id, status FROM library_reservations WHERE id = ?1 AND school_id = ?2",
            rusqlite::params![id, school_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let Some((book_id, reader_id, status)) = reservation else {
        return Err("Réservation introuvable.".to_string());
    };
    if status == "SATISFAITE" {
        return Err("Cette réservation est déjà satisfaite.".to_string());
    }

    // Exemplaire à emprunter : celui demandé, sinon le premier disponible
    let chosen_copy: String =
        match copy_id.filter(|c| !c.is_empty()) {
            Some(c) => c,
            None => {
                let available: Option<String> = conn
                    .query_row(
                        "SELECT cp.id FROM library_copies cp
                       JOIN library_books b ON b.id = cp.book_id
                      WHERE cp.book_id = ?1 AND cp.school_id = ?2
                        AND cp.status = 'DISPONIBLE' AND b.is_reference = 0
                      LIMIT 1",
                        rusqlite::params![book_id, school_id],
                        |r| r.get(0),
                    )
                    .ok();
                match available {
                    Some(c) => c,
                    None => return Err(
                        "Aucun exemplaire disponible : le retour n'a pas encore été enregistré."
                            .into(),
                    ),
                }
            }
        };

    // Le mutex n'est pas réentrant : on libère la connexion avant d'appeler
    // `create_library_loan`, qui ouvre lui-même une transaction.
    drop(conn);

    let loan = create_library_loan(
        school_id.clone(),
        reader_id,
        chosen_copy,
        None,
        None,
        Some("Prêt issu d'une réservation".to_string()),
        None,
        state.clone(),
    )?;

    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE library_reservations
            SET status = 'SATISFAITE', fulfilled_at = ?1, loan_id = ?2, updated_at = ?1
          WHERE id = ?3",
        rusqlite::params![now, loan.id, id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    enqueue_entity(&conn, "library_reservations", &school_id, &id);

    Ok(loan)
}

// ──────────────────────────────────────────────
// PILOTAGE
// ──────────────────────────────────────────────

/// Indicateurs de pilotage de la bibliothèque.
#[tauri::command]
pub fn get_library_dashboard(
    school_id: String,
    state: State<'_, DbState>,
) -> Result<LibraryDashboard, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    load_settings(&conn, &school_id)?;
    let current = today();

    let count = |sql: &str, params: &[&dyn rusqlite::ToSql]| -> i64 {
        conn.query_row(sql, params, |r| r.get(0)).unwrap_or(0)
    };

    let total_books = count(
        "SELECT COUNT(*) FROM library_books WHERE school_id = ?1",
        &[&school_id],
    );
    let total_copies = count(
        "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1",
        &[&school_id],
    );
    let available_copies = count(
        "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1 AND status = 'DISPONIBLE'",
        &[&school_id],
    );
    let loaned_copies = count(
        "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1 AND status = 'EMPRUNTE'",
        &[&school_id],
    );
    let lost_copies = count(
        "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1 AND status = 'PERDU'",
        &[&school_id],
    );
    let maintenance_copies = count(
        "SELECT COUNT(*) FROM library_copies WHERE school_id = ?1 AND status IN ('MAINTENANCE', 'RETIRE')",
        &[&school_id],
    );
    let total_readers = count(
        "SELECT COUNT(*) FROM library_readers WHERE school_id = ?1",
        &[&school_id],
    );
    let active_readers = count(
        "SELECT COUNT(*) FROM library_readers WHERE school_id = ?1 AND status = 'ACTIF'",
        &[&school_id],
    );
    let active_loans = count(
        "SELECT COUNT(*) FROM library_loans WHERE school_id = ?1 AND status = 'EN_COURS'",
        &[&school_id],
    );
    let pending_reservations = count(
        "SELECT COUNT(*) FROM library_reservations WHERE school_id = ?1 AND status IN ('EN_ATTENTE', 'DISPONIBLE')",
        &[&school_id],
    );
    let unpaid_penalties = count(
        "SELECT COUNT(*) FROM library_penalties WHERE school_id = ?1 AND status = 'EN_ATTENTE'",
        &[&school_id],
    );
    let unpaid_penalty_amount: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM library_penalties WHERE school_id = ?1 AND status = 'EN_ATTENTE'",
            rusqlite::params![school_id],
            |r| r.get(0),
        )
        .unwrap_or(0.0);

    // Retards : emprunts en cours dont l'échéance est dépassée
    let overdue_rows: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT due_date FROM library_loans WHERE school_id = ?1 AND status = 'EN_COURS'",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![school_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    let overdue_loans = overdue_rows
        .iter()
        .filter(|d| days_between(d, &current) > 0)
        .count() as i64;

    Ok(LibraryDashboard {
        total_books,
        total_copies,
        available_copies,
        loaned_copies,
        lost_copies,
        maintenance_copies,
        total_readers,
        active_readers,
        active_loans,
        overdue_loans,
        pending_reservations,
        unpaid_penalties,
        unpaid_penalty_amount,
    })
}

// ──────────────────────────────────────────────
// JEU DE DÉMONSTRATION
// ──────────────────────────────────────────────

/// Insère un jeu de données de démonstration complet et relié.
#[tauri::command]
pub fn seed_library_demo_data(
    school_id: String,
    state: State<'_, DbState>,
) -> Result<LibraryDashboard, String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;
    seed_library_demo_data_inner(&conn, &school_id)?;
    drop(conn);
    get_library_dashboard(school_id, state)
}

/// Remplit la base avec un jeu de démonstration cohérent.
///
/// Fonction interne (non exposée à l'IPC) afin de pouvoir la tester
/// directement sur une connexion SQLite.
fn seed_library_demo_data_inner(conn: &Connection, school_id: &str) -> Result<(), String> {
    let settings = load_settings(conn, school_id)?;
    let now = now_iso();

    // Purge préalable : le jeu de démonstration remplace les données existantes
    conn.execute(
        "DELETE FROM library_returns WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_penalties WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_reservations WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_loans WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_copies WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_readers WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_books WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_categories WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    // ── 1. Catégories ───────────────────────────────────────────
    let categories: Vec<(&str, &str, &str, &str)> = vec![
        ("Littérature", "LIT", "Romans, poésie et théâtre", "#6366f1"),
        (
            "Sciences & Mathématiques",
            "SCI",
            "Sciences physiques, mathématiques",
            "#0ea5e9",
        ),
        (
            "Histoire & Géographie",
            "HIG",
            "Histoire, géographie et éducation civique",
            "#f59e0b",
        ),
        (
            "Langues",
            "LAN",
            " dictionnaires et ouvrages de langue",
            "#10b981",
        ),
        (
            "Informatique",
            "INF",
            "Informatique, bureautique et numérique",
            "#8b5cf6",
        ),
        (
            "Arts & Culture",
            "ART",
            "Arts, musique et civilisation",
            "#ec4899",
        ),
    ];

    let mut category_ids: Vec<String> = Vec::new();
    for (name, code, description, color) in categories {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO library_categories (id, school_id, name, code, description, color, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?7)",
            rusqlite::params![id, school_id, name, code, description, color, now],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_categories", &school_id, &id);
        category_ids.push(id);
    }

    // ── 2. Ouvrages ─────────────────────────────────────────────
    // (titre, auteur, éditeur, année, catégorie, pages, rayon, référence)
    // Les ouvrages marqués « référence » restent en consultation sur place :
    // ils ne sont jamais prêteurs.
    let books: Vec<(&str, &str, &str, i64, usize, i64, &str, bool)> = vec![
        (
            "Le Petit Prince",
            "Antoine de Saint-Exupéry",
            "Gallimard",
            1943,
            0,
            96,
            "A-01",
            false,
        ),
        (
            "Les Misérables",
            "Victor Hugo",
            "Gallimard",
            1862,
            0,
            1232,
            "A-02",
            false,
        ),
        (
            "Candide ou l'optimisme",
            "Voltaire",
            "Flammarion",
            1759,
            0,
            128,
            "A-03",
            false,
        ),
        (
            "Une saison en enfer",
            "Arthur Rimbaud",
            "Poésie",
            1873,
            0,
            64,
            "A-04",
            false,
        ),
        (
            "Histoire de l'Afrique noire",
            "Catherine Coquery-Vidrovitch",
            "Gallimard",
            2016,
            2,
            512,
            "C-21",
            false,
        ),
        (
            "Physique-chimie 3e",
            "collection Hachette",
            "Hachette",
            2019,
            1,
            384,
            "B-11",
            true,
        ),
        (
            "Mathématiques 4e",
            "collection Hachette",
            "Hachette",
            2020,
            1,
            320,
            "B-12",
            true,
        ),
        (
            "Biologie 5e",
            "collection Nathan",
            "Nathan",
            2018,
            1,
            288,
            "B-13",
            true,
        ),
        (
            "Atlas du monde contemporain",
            "Collectif",
            "Hachette",
            2021,
            2,
            224,
            "C-22",
            true,
        ),
        (
            "Précis de grammaire française",
            "Michel Grevisse",
            "Gallimard",
            2019,
            3,
            240,
            "D-32",
            false,
        ),
        (
            "ABC de l'algorithmique",
            "Robert Dance",
            "Dunod",
            2020,
            4,
            336,
            "E-42",
            false,
        ),
        (
            "Informatique 2e",
            "collection Hachette",
            "Hachette",
            2021,
            4,
            272,
            "E-41",
            false,
        ),
        (
            "Histoire de l'art",
            "Émile Zola",
            "Flammarion",
            2013,
            5,
            512,
            "F-51",
            false,
        ),
        (
            "Dictionnaire de français",
            "Société du Nouveau Littré",
            "Le Robert",
            2017,
            3,
            2127,
            "D-31",
            false,
        ),
    ];

    let mut book_ids: Vec<String> = Vec::new();
    let mut book_titles: Vec<String> = Vec::new();
    for (title, author, publisher, year, cat_idx, pages, shelf, is_reference) in books {
        let id = uuid::Uuid::new_v4().to_string();
        let isbn = format!(
            "978-2-{:03}-{:05}-{}",
            cat_idx + 1,
            year % 1000,
            rand_seed(title)
        );
        conn.execute(
            "INSERT INTO library_books
                (id, school_id, category_id, isbn, title, author, publisher, publication_year,
                 language, edition, pages, description, shelf_location, is_reference, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'Français',NULL,?9,NULL,?10,?11,?12,?12)",
            rusqlite::params![
                id,
                school_id,
                category_ids[cat_idx],
                isbn,
                title,
                author,
                publisher,
                year,
                pages,
                shelf,
                if is_reference { 1i64 } else { 0i64 },
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_books", &school_id, &id);
        book_ids.push(id);
        book_titles.push(title.to_string());
    }

    // ── 3. Exemplaires (inventaire) ──────────────────────────────
    let mut copy_ids: Vec<String> = Vec::new();
    let mut copy_per_book: Vec<Vec<String>> = vec![Vec::new(); book_ids.len()];
    for (i, book_id) in book_ids.iter().enumerate() {
        let quantity: i64 = if i % 3 == 0 { 3 } else { 2 };
        for _ in 0..quantity {
            let id = uuid::Uuid::new_v4().to_string();
            let code = next_inventory_code(&conn, &school_id, "BIB");
            let condition = if i % 4 == 0 { "Bon" } else { "Neuf" };
            conn.execute(
                "INSERT INTO library_copies
                    (id, school_id, book_id, inventory_code, barcode, status, condition,
                     acquisition_date, acquisition_source, price, location, notes, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?4,'DISPONIBLE',?5,?6,'Don',?7,?8,NULL,?9,?9)",
                rusqlite::params![
                    id,
                    school_id,
                    book_id,
                    code,
                    condition,
                    add_days(&today(), -(30 + (i as i64 * 7))),
                    1500.0 + (i as f64 * 250.0),
                    "Rayon A",
                    now
                ],
            )
            .map_err(|e| format!("Erreur SQL: {}", e))?;
            enqueue_entity(&conn, "library_copies", &school_id, &id);
            copy_ids.push(id.clone());
            copy_per_book[i].push(id);
        }
    }

    // ── 4. Lecteurs ─────────────────────────────────────────────
    // Élèves réellement inscrits dans l'établissement
    let students: Vec<(String, String, String, Option<String>)> = {
        let mut stmt = conn
            .prepare(
                "SELECT s.id, s.first_name, s.last_name,
                        (SELECT c.name FROM enrollments e JOIN classes c ON c.id = e.class_id
                          WHERE e.student_id = s.id AND e.school_id = ?1 LIMIT 1)
                   FROM students s
                   JOIN enrollments e ON e.student_id = s.id AND e.school_id = ?1
                  GROUP BY s.id
                  LIMIT 8",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![school_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let staff: Vec<(String, String, String, Option<String>)> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, nom, prenoms, telephone_principal FROM staff
                  WHERE school_id = ?1 AND est_actif = 1 LIMIT 4",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![school_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };

    let mut reader_ids: Vec<String> = Vec::new();
    let mut reader_names: Vec<String> = Vec::new();

    // 4a. Lecteurs élèves
    for (student_id, first_name, last_name, class_name) in &students {
        let id = uuid::Uuid::new_v4().to_string();
        let card = next_card_number(&conn, &school_id);
        let full_name = format!("{} {}", first_name, last_name);
        conn.execute(
            "INSERT INTO library_readers
                (id, school_id, reader_type, student_id, staff_id, full_name, email, phone,
                 card_number, class_name, max_loans, status, registered_at, expires_at, notes, created_at, updated_at)
             VALUES (?1,?2,'ELEVE',?3,NULL,?4,NULL,NULL,?5,?6,?7,'ACTIF',?8,NULL,NULL,?9,?9)",
            rusqlite::params![
                id,
                school_id,
                student_id,
                full_name,
                card,
                class_name,
                settings.max_loans_per_reader,
                today(),
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_readers", &school_id, &id);
        reader_ids.push(id);
        reader_names.push(full_name);
    }

    // 4b. Lecteurs personnel
    for (staff_id, nom, prenoms, phone) in &staff {
        let id = uuid::Uuid::new_v4().to_string();
        let card = next_card_number(&conn, &school_id);
        let full_name = format!("{} {}", prenoms, nom).trim().to_string();
        conn.execute(
            "INSERT INTO library_readers
                (id, school_id, reader_type, student_id, staff_id, full_name, email, phone,
                 card_number, class_name, max_loans, status, registered_at, expires_at, notes, created_at, updated_at)
             VALUES (?1,?2,'PERSONNEL',NULL,?3,?4,NULL,?5,?6,NULL,?7,'ACTIF',?8,NULL,NULL,?9,?9)",
            rusqlite::params![
                id,
                school_id,
                staff_id,
                full_name,
                phone,
                card,
                settings.max_loans_per_reader,
                today(),
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_readers", &school_id, &id);
        reader_ids.push(id);
        reader_names.push(full_name);
    }

    // 4c. Lecteurs externes
    let externes = vec![
        ("M. Alphonse Koffi", "+225 07 00 00 11", "Parent d'élève"),
        (
            "Mme Fatou Bamba",
            "+225 05 00 00 22",
            "Partenaire de l'école",
        ),
    ];
    for (full_name, phone, notes) in externes {
        let id = uuid::Uuid::new_v4().to_string();
        let card = next_card_number(&conn, &school_id);
        conn.execute(
            "INSERT INTO library_readers
                (id, school_id, reader_type, student_id, staff_id, full_name, email, phone,
                 card_number, class_name, max_loans, status, registered_at, expires_at, notes, created_at, updated_at)
             VALUES (?1,?2,'EXTERNE',NULL,NULL,?3,NULL,?4,?5,NULL,2,'ACTIF',?6,NULL,?7,?8,?8)",
            rusqlite::params![id, school_id, full_name, phone, card, today(), notes, now],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_readers", &school_id, &id);
        reader_ids.push(id);
        reader_names.push(full_name.to_string());
    }

    // ── 5. Emprunts en cours ─────────────────────────────────────
    // (index livre, index lecteur, jours avant échéance) — les valeurs négatives = retard
    // Seuls des ouvrages prêtables (non « référence ») sont concernés.
    let active_loans: Vec<(usize, usize, i64)> =
        vec![(0, 0, 5), (1, 1, 3), (9, 2, 12), (10, 0, -3), (4, 3, -8)];

    let mut loan_ids: Vec<String> = Vec::new();
    let mut overdue_loans: Vec<(String, String, String, i64)> = Vec::new();

    for (book_idx, reader_idx, offset_days) in &active_loans {
        if *book_idx >= book_ids.len() || *reader_idx >= reader_ids.len() {
            continue;
        }
        let book_id = &book_ids[*book_idx];
        let reader_id = &reader_ids[*reader_idx];
        let Some(copy_id) = copy_per_book[*book_idx].first() else {
            continue;
        };

        let due_date = add_days(&today(), *offset_days);
        let loan_date = add_days(&due_date, -settings.loan_duration_days);
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO library_loans
                (id, school_id, copy_id, reader_id, book_id, loan_date, due_date, returned_at,
                 status, loan_condition, notes, created_by, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,'EN_COURS','Bon',NULL,NULL,?8,?8)",
            rusqlite::params![id, school_id, copy_id, reader_id, book_id, loan_date, due_date, now],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_loans", &school_id, &id);

        conn.execute(
            "UPDATE library_copies SET status = 'EMPRUNTE', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, copy_id],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_copies", &school_id, &copy_id);

        if *offset_days < 0 {
            overdue_loans.push((
                id.clone(),
                reader_id.clone(),
                due_date.clone(),
                -*offset_days,
            ));
        }
        loan_ids.push(id);
    }

    // ── 6. Emprunts retournés (historique) + retours + pénalités ─
    let returned_loans: Vec<(usize, usize, i64, i64)> = vec![
        (2, 0, 10, 0),
        (3, 1, 20, 4),
        (11, 2, 30, 0),
        (12, 3, 40, 2),
        (0, 4, 50, 0),
    ];

    for (book_idx, reader_idx, age_days, late_days) in &returned_loans {
        if *book_idx >= book_ids.len() || *reader_idx >= reader_ids.len() {
            continue;
        }
        let book_id = &book_ids[*book_idx];
        let reader_id = &reader_ids[*reader_idx];
        let Some(copy_id) = copy_per_book[*book_idx]
            .get(1)
            .or(copy_per_book[*book_idx].first())
        else {
            continue;
        };

        let due_date = add_days(&today(), -*age_days);
        let loan_date = add_days(&due_date, -settings.loan_duration_days);
        let returned_at = add_days(&today(), -*age_days);
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO library_loans
                (id, school_id, copy_id, reader_id, book_id, loan_date, due_date, returned_at,
                 status, loan_condition, notes, created_by, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'RETOURNE','Bon',NULL,NULL,?9,?9)",
            rusqlite::params![
                id,
                school_id,
                copy_id,
                reader_id,
                book_id,
                loan_date,
                due_date,
                returned_at,
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_loans", &school_id, &id);

        let fine = (*late_days as f64) * settings.fine_per_day;
        let return_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO library_returns
                (id, school_id, loan_id, copy_id, reader_id, returned_at, loan_condition,
                 late_days, fine_amount, remarks, handled_by, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,'Bon',?7,?8,NULL,NULL,?9,?9)",
            rusqlite::params![
                return_id,
                school_id,
                id,
                copy_id,
                reader_id,
                returned_at,
                late_days,
                fine,
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_returns", &school_id, &return_id);

        if *late_days > 0 {
            let penalty_id = uuid::Uuid::new_v4().to_string();
            let status = if *book_idx % 2 == 0 {
                "PAYEE"
            } else {
                "EN_ATTENTE"
            };
            let paid_at = if status == "PAYEE" {
                Some(add_days(&today(), -*age_days + 1))
            } else {
                None
            };
            conn.execute(
                "INSERT INTO library_penalties
                    (id, school_id, reader_id, loan_id, penalty_type, amount, days_late, description, status, paid_at, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,'RETARD',?5,?6,?7,?8,?9,?10,?10)",
                rusqlite::params![
                    penalty_id,
                    school_id,
                    reader_id,
                    id,
                    fine,
                    late_days,
                    format!("Retard de {} jour(s)", late_days),
                    status,
                    paid_at,
                    now
                ],
            )
            .map_err(|e| format!("Erreur SQL: {}", e))?;
            enqueue_entity(&conn, "library_penalties", &school_id, &penalty_id);

            // Réservation satisfaite : le lecteur a obtenu l'ouvrage, l'emprunt
            // correspondant a été soldé (retour + pénalité).
            let reservation_id = uuid::Uuid::new_v4().to_string();
            let reserved_at = add_days(&returned_at, -2);
            conn.execute(
                "INSERT INTO library_reservations
                    (id, school_id, book_id, reader_id, reserved_at, available_at, expires_at,
                     status, queue_position, notified_at, fulfilled_at, loan_id, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,NULL,'SATISFAITE',1,?7,?8,?9,?10,?10)",
                rusqlite::params![
                    reservation_id,
                    school_id,
                    book_id,
                    reader_id,
                    reserved_at,
                    returned_at,
                    reserved_at,
                    returned_at,
                    id,
                    now
                ],
            )
            .map_err(|e| format!("Erreur SQL: {}", e))?;
            enqueue_entity(&conn, "library_reservations", &school_id, &reservation_id);
        }
    }

    // ── 6bis. Ouvrage intégralement prêté ───────────────────────
    // Tous les exemplaires du « Dictionnaire de français » (index 13) sont
    // prêtés : la réservation correspondante est donc légitimement en attente.
    let waiting_book_idx = 13usize;
    if waiting_book_idx < copy_per_book.len() {
        let copies = copy_per_book[waiting_book_idx].clone();
        for (i, copy_id) in copies.iter().enumerate() {
            let reader_idx = 8 + i;
            if reader_idx >= reader_ids.len() {
                break;
            }
            let loan_id = uuid::Uuid::new_v4().to_string();
            let due_date = add_days(&today(), 7);
            let loan_date = add_days(&due_date, -settings.loan_duration_days);
            conn.execute(
                "INSERT INTO library_loans
                    (id, school_id, copy_id, reader_id, book_id, loan_date, due_date, returned_at,
                     status, loan_condition, notes, created_by, created_at, updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,'EN_COURS','Bon',NULL,NULL,?8,?8)",
                rusqlite::params![
                    loan_id,
                    school_id,
                    copy_id,
                    reader_ids[reader_idx],
                    book_ids[waiting_book_idx],
                    loan_date,
                    due_date,
                    now
                ],
            )
            .map_err(|e| format!("Erreur SQL: {}", e))?;
            enqueue_entity(&conn, "library_loans", &school_id, &loan_id);

            conn.execute(
                "UPDATE library_copies SET status = 'EMPRUNTE', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, copy_id],
            )
            .map_err(|e| format!("Erreur SQL: {}", e))?;
            enqueue_entity(&conn, "library_copies", &school_id, copy_id);

            loan_ids.push(loan_id);
        }
    }

    // ── 7. Pénalité pour les emprunts en retard ──────────────────
    for (loan_id, reader_id, _due_date, late_days) in &overdue_loans {
        let penalty_id = uuid::Uuid::new_v4().to_string();
        let fine = (*late_days as f64) * settings.fine_per_day;
        conn.execute(
            "INSERT INTO library_penalties
                (id, school_id, reader_id, loan_id, penalty_type, amount, days_late, description, status, paid_at, created_at, updated_at)
             VALUES (?1,?2,?3,?4,'RETARD',?5,?6,?7,'EN_ATTENTE',NULL,?8,?8)",
            rusqlite::params![
                penalty_id,
                school_id,
                reader_id,
                loan_id,
                fine,
                late_days,
                format!("Retard de {} jour(s) — emprunt en cours", late_days),
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_penalties", &school_id, &penalty_id);
    }

    // ── 8. Réservations ──────────────────────────────────────────
    // (index livre, index lecteur, statut)
    // Les réservations satisfaites sont créées avec les emprunts soldés (voir § 6).
    let reservations: Vec<(usize, usize, &str)> = vec![
        (0, 4, "DISPONIBLE"),
        (13, 5, "EN_ATTENTE"),
        (4, 6, "DISPONIBLE"),
    ];

    for (book_idx, reader_idx, status) in &reservations {
        if *book_idx >= book_ids.len() || *reader_idx >= reader_ids.len() {
            continue;
        }
        let id = uuid::Uuid::new_v4().to_string();
        let reserved_at = add_days(&today(), -3);
        let expires_at = add_days(&today(), settings.reservation_expiry_days);
        let available_at = if *status == "DISPONIBLE" {
            Some(now.clone())
        } else {
            None
        };
        let notified_at = if *status == "DISPONIBLE" {
            Some(now.clone())
        } else {
            None
        };
        let fulfilled_at = if *status == "SATISFAITE" {
            Some(now.clone())
        } else {
            None
        };

        conn.execute(
            "INSERT INTO library_reservations
                (id, school_id, book_id, reader_id, reserved_at, available_at, expires_at,
                 status, queue_position, notified_at, fulfilled_at, loan_id, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,NULL,?12,?12)",
            rusqlite::params![
                id,
                school_id,
                book_ids[*book_idx],
                reader_ids[*reader_idx],
                reserved_at,
                available_at,
                expires_at,
                status,
                (*book_idx + 1) as i64,
                notified_at,
                fulfilled_at,
                now
            ],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_reservations", &school_id, &id);
    }

    // ── 9. Exemplaires hors circuit (perdu / maintenance) ───────
    // On choisit des exemplaires qui ne sont pas en prêt.
    if copy_ids.len() > 5 {
        conn.execute(
            "UPDATE library_copies SET status = 'PERDU', notes = 'Déclaré perdu lors de l''inventaire annuel', updated_at = ?1
              WHERE id = ?2",
            rusqlite::params![now, copy_ids[4]],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_copies", &school_id, &copy_ids[4]);

        conn.execute(
            "UPDATE library_copies SET status = 'MAINTENANCE', notes = 'Reliure à restaurer', updated_at = ?1
              WHERE id = ?2",
            rusqlite::params![now, copy_ids[5]],
        )
        .map_err(|e| format!("Erreur SQL: {}", e))?;
        enqueue_entity(&conn, "library_copies", &school_id, &copy_ids[5]);
    }

    audit(
        &conn,
        &school_id,
        "SEED_LIBRARY_DEMO_DATA",
        "library_settings",
        &school_id,
        json!({
            "categories": category_ids.len(),
            "books": book_ids.len(),
            "copies": copy_ids.len(),
            "readers": reader_ids.len(),
            "loans": loan_ids.len()
        }),
    );

    Ok(())
}

/// Purge toutes les données de bibliothèque de l'établissement.
#[tauri::command]
pub fn clear_library_data(school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Base verrouillée".to_string())?;

    conn.execute(
        "DELETE FROM library_returns WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_penalties WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_reservations WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_loans WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_copies WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_readers WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_books WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;
    conn.execute(
        "DELETE FROM library_categories WHERE school_id = ?1",
        rusqlite::params![school_id],
    )
    .map_err(|e| format!("Erreur SQL: {}", e))?;

    audit(
        &conn,
        &school_id,
        "CLEAR_LIBRARY_DATA",
        "library_settings",
        &school_id,
        json!({ "school_id": school_id }),
    );
    Ok(())
}

/// Empreinte stable d'un titre : sert à générer un ISBN lisible et unique.
fn rand_seed(text: &str) -> u32 {
    let mut hash: u32 = 2166136261;
    for b in text.bytes() {
        hash ^= b as u32;
        hash = hash.wrapping_mul(16777619);
    }
    hash % 100
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCHOOL_ID: &str = "school-test";

    /// Base en mémoire avec le schéma minimal nécessaire au module Bibliothèque.
    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        conn.execute_batch(
            "CREATE TABLE schools (id TEXT PRIMARY KEY, name TEXT);
             CREATE TABLE students (id TEXT PRIMARY KEY, school_id TEXT, first_name TEXT, last_name TEXT);
             CREATE TABLE classes (id TEXT PRIMARY KEY, school_id TEXT, name TEXT);
             CREATE TABLE enrollments (id TEXT PRIMARY KEY, school_id TEXT, student_id TEXT, class_id TEXT);
             CREATE TABLE staff (id TEXT PRIMARY KEY, school_id TEXT, nom TEXT, prenoms TEXT,
                                 telephone_principal TEXT, est_actif INTEGER DEFAULT 1);
             CREATE TABLE audit_logs (id TEXT PRIMARY KEY, school_id TEXT, action TEXT,
                                     entity_type TEXT, entity_id TEXT, new_data TEXT);",
        )
        .unwrap();

        let migration = include_str!("../migrations/24_library_module.sql");
        for statement in migration.split(';') {
            let statement = statement.trim();
            if statement.is_empty() {
                continue;
            }
            conn.execute_batch(statement)
                .unwrap_or_else(|e| panic!("Migration bibliothèque invalide : {}", e));
        }

        // École, élèves et personnels
        conn.execute(
            "INSERT INTO schools (id, name) VALUES (?1, 'École de test')",
            rusqlite::params![SCHOOL_ID],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO classes (id, school_id, name) VALUES ('class-1', ?1, '6e A')",
            rusqlite::params![SCHOOL_ID],
        )
        .unwrap();
        for i in 1..=8 {
            conn.execute(
                "INSERT INTO students (id, school_id, first_name, last_name) VALUES (?1,?2,?3,?4)",
                rusqlite::params![
                    format!("student-{}", i),
                    SCHOOL_ID,
                    format!("Prénom{}", i),
                    format!("Nom{}", i)
                ],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO enrollments (id, school_id, student_id, class_id)
                 VALUES (?1,?2,?3,'class-1')",
                rusqlite::params![format!("enroll-{}", i), SCHOOL_ID, format!("student-{}", i)],
            )
            .unwrap();
        }
        for i in 1..=4 {
            conn.execute(
                "INSERT INTO staff (id, school_id, nom, prenoms, telephone_principal, est_actif)
                 VALUES (?1,?2,?3,?4,?5,1)",
                rusqlite::params![
                    format!("staff-{}", i),
                    SCHOOL_ID,
                    format!("Agent{}", i),
                    format!("Prénom{}", i),
                    "+225 01 00 00 00"
                ],
            )
            .unwrap();
        }

        conn
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    /// Identifiant d'un exemplaire disponible, éventuellement filtré par ouvrage de référence.
    fn available_copy(conn: &Connection, reference: bool) -> Option<String> {
        conn.query_row(
            "SELECT cp.id FROM library_copies cp
               JOIN library_books b ON b.id = cp.book_id
              WHERE cp.status = 'DISPONIBLE' AND b.is_reference = ?1
              ORDER BY cp.inventory_code LIMIT 1",
            rusqlite::params![if reference { 1 } else { 0 }],
            |r| r.get(0),
        )
        .ok()
    }

    fn reader_with_free_quota(conn: &Connection) -> Option<String> {
        conn.query_row(
            "SELECT r.id FROM library_readers r
              WHERE r.status = 'ACTIF'
                AND (SELECT COUNT(*) FROM library_loans l
                      WHERE l.reader_id = r.id AND l.status = 'EN_COURS') < r.max_loans
              ORDER BY r.card_number LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok()
    }

    #[test]
    fn seed_demo_library_is_coherent() {
        let conn = test_connection();
        seed_library_demo_data_inner(&conn, SCHOOL_ID).unwrap();

        // Catalogue
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM library_categories"), 6);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM library_books"), 14);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM library_copies"), 33);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM library_readers"), 14);

        // Aucun emprunt sur un ouvrage de référence
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_loans l
                   JOIN library_books b ON b.id = l.book_id
                  WHERE b.is_reference = 1"
            ),
            0
        );

        // Aucun exemplaire prêté n'est disponible, et inversement
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_loans l
                   JOIN library_copies c ON c.id = l.copy_id
                  WHERE l.status = 'EN_COURS' AND c.status <> 'EMPRUNTE'"
            ),
            0
        );
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_copies c
                   JOIN library_loans l ON l.copy_id = c.id
                  WHERE l.status = 'EN_COURS' AND c.status = 'DISPONIBLE'"
            ),
            0
        );

        // Un même exemplaire n'est jamais emprunté deux fois
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM (
                    SELECT copy_id FROM library_loans WHERE status = 'EN_COURS'
                     GROUP BY copy_id HAVING COUNT(*) > 1)"
            ),
            0
        );

        // Les réservations « en attente » portent bien sur un ouvrage sans exemplaire libre
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_reservations r
                  WHERE r.status = 'EN_ATTENTE'
                    AND EXISTS (SELECT 1 FROM library_copies c
                                 WHERE c.book_id = r.book_id AND c.status = 'DISPONIBLE')"
            ),
            0
        );

        // Les réservations satisfaites renvoient vers un emprunt soldé
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_reservations r
                  WHERE r.status = 'SATISFAITE'
                    AND (r.loan_id IS NULL
                         OR NOT EXISTS (SELECT 1 FROM library_loans l
                                         WHERE l.id = r.loan_id AND l.status = 'RETOURNE'))"
            ),
            0
        );

        // Aucun lecteur ne dépasse son quota d'emprunts
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM (
                    SELECT r.id FROM library_readers r
                      JOIN library_loans l ON l.reader_id = r.id AND l.status = 'EN_COURS'
                     GROUP BY r.id HAVING COUNT(*) > r.max_loans)"
            ),
            0
        );

        // Les retards sont couverts par une pénalité
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_loans l
                  WHERE l.status = 'EN_COURS' AND l.due_date < date('now')
                    AND NOT EXISTS (SELECT 1 FROM library_penalties p WHERE p.loan_id = l.id)"
            ),
            0
        );

        // La date d'emprunt précède l'échéance du délai de prêt
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(*) FROM library_loans
                  WHERE julianday(loan_date) + 14 < julianday(due_date)"
            ),
            0
        );
    }

    #[test]
    fn create_loan_refuses_reference_book() {
        let conn = test_connection();
        seed_library_demo_data_inner(&conn, SCHOOL_ID).unwrap();

        let copy_id = available_copy(&conn, true).expect("un exemplaire de référence");
        let reader_id = reader_with_free_quota(&conn).expect("un lecteur");

        let err = create_library_loan_inner(
            &conn,
            SCHOOL_ID.to_string(),
            reader_id,
            copy_id,
            None,
            None,
            None,
            None,
        )
        .unwrap_err();

        assert!(err.contains("référence"), "message inattendu : {}", err);
    }

    #[test]
    fn create_loan_enforces_quota() {
        let conn = test_connection();
        seed_library_demo_data_inner(&conn, SCHOOL_ID).unwrap();

        let reader_id = reader_with_free_quota(&conn).expect("un lecteur");
        let limit: i64 = conn
            .query_row(
                "SELECT max_loans FROM library_readers WHERE id = ?1",
                rusqlite::params![reader_id],
                |r| r.get(0),
            )
            .unwrap();
        let already: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_loans WHERE reader_id = ?1 AND status = 'EN_COURS'",
                rusqlite::params![reader_id],
                |r| r.get(0),
            )
            .unwrap();

        let mut created = 0;
        loop {
            let copy_id = match available_copy(&conn, false) {
                Some(c) => c,
                None => break,
            };
            let res = create_library_loan_inner(
                &conn,
                SCHOOL_ID.to_string(),
                reader_id.clone(),
                copy_id,
                None,
                None,
                None,
                None,
            );
            if res.is_err() {
                assert!(
                    res.unwrap_err().contains("Limite atteinte"),
                    "le quota n'a pas été appliqué"
                );
                break;
            }
            created += 1;
            assert!(
                already + created <= limit,
                "le quota de {} n'a pas été respecté",
                limit
            );
        }
        assert_eq!(
            created,
            limit - already,
            "le lecteur devrait pouvoir faire {} emprunts supplémentaires",
            limit - already
        );
    }

    #[test]
    fn return_loan_computes_late_days_and_penalty() {
        let conn = test_connection();
        seed_library_demo_data_inner(&conn, SCHOOL_ID).unwrap();

        let reader_id = reader_with_free_quota(&conn).expect("un lecteur");
        let copy_id = available_copy(&conn, false).expect("un exemplaire");
        let due_date = add_days(&today(), -5);

        let loan = create_library_loan_inner(
            &conn,
            SCHOOL_ID.to_string(),
            reader_id.clone(),
            copy_id.clone(),
            None,
            Some(due_date.clone()),
            None,
            None,
        )
        .unwrap();
        assert_eq!(loan.due_date, due_date);

        let returned = return_library_loan_inner(
            &conn,
            loan.id.clone(),
            SCHOOL_ID.to_string(),
            None,
            Some("Bon".to_string()),
            None,
            None,
        )
        .unwrap();

        assert_eq!(returned.late_days, 5);
        assert_eq!(returned.fine_amount, 500.0);

        // L'exemplaire redevient disponible et l'emprunt est clôturé
        let status: String = conn
            .query_row(
                "SELECT status FROM library_copies WHERE id = ?1",
                rusqlite::params![copy_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "DISPONIBLE");

        // Une pénalité « en attente » est générée
        let penalties: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM library_penalties WHERE loan_id = ?1 AND status = 'EN_ATTENTE'",
                rusqlite::params![loan.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(penalties, 1);
    }

    #[test]
    fn loan_satisfies_pending_reservation() {
        let conn = test_connection();
        seed_library_demo_data_inner(&conn, SCHOOL_ID).unwrap();

        let reader_id = reader_with_free_quota(&conn).expect("un lecteur");
        let copy_id = available_copy(&conn, false).expect("un exemplaire");
        let book_id: String = conn
            .query_row(
                "SELECT book_id FROM library_copies WHERE id = ?1",
                rusqlite::params![copy_id],
                |r| r.get(0),
            )
            .unwrap();

        // Réservation du même lecteur sur le même ouvrage
        conn.execute(
            "INSERT INTO library_reservations
                (id, school_id, book_id, reader_id, reserved_at, status, queue_position, created_at, updated_at)
             VALUES ('res-test', ?1, ?2, ?3, ?4, 'EN_ATTENTE', 1, ?4, ?4)",
            rusqlite::params![SCHOOL_ID, book_id, reader_id, today()],
        )
        .unwrap();

        let loan = create_library_loan_inner(
            &conn,
            SCHOOL_ID.to_string(),
            reader_id.clone(),
            copy_id,
            None,
            None,
            None,
            None,
        )
        .unwrap();

        let (status, loan_id): (String, Option<String>) = conn
            .query_row(
                "SELECT status, loan_id FROM library_reservations WHERE id = 'res-test'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "SATISFAITE");
        assert_eq!(loan_id.as_deref(), Some(loan.id.as_str()));
    }
}
