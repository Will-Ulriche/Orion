$lines = [System.IO.File]::ReadAllLines("C:\Users\Resp_ Tech\Desktop\Orion\src-tauri\src\commands.rs")

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "pub fn create_class") {
        for ($j = $i; $j -lt $i + 30; $j++) {
            if ($lines[$j] -match "Ok\(Class \{") {
                $lines[$j+1] = $lines[$j+1] -replace "id,", "id, level_id: None, series_id: None,"
                break
            }
        }
    }
    if ($lines[$i] -match "pub fn update_class") {
        for ($j = $i; $j -lt $i + 30; $j++) {
            if ($lines[$j] -match "Ok\(Class \{") {
                $lines[$j+1] = $lines[$j+1] -replace "id,", "id, level_id: None, series_id: None,"
                break
            }
        }
    }
    
    if ($lines[$i] -match "pub fn get_class_subjects") {
        for ($j = $i; $j -lt $i + 40; $j++) {
            if ($lines[$j] -match "Ok\(crate::models::ClassSubject \{") {
                $lines[$j+3] = "            weekly_hours: None, subject_type: None, is_mandatory: None, order_index: None, color_icon: None,"
                $lines[$j+4] = "            subject_name: row.get(7)?, subject_code: row.get(8)?,"
                $lines[$j+5] = "            class_name: row.get(9)?, teacher_name: row.get(10)?,"
                $lines[$j+6] = "        })"
                $lines[$j+7] = "    }).map_err(|e| e.to_string())?;"
                $lines[$j+8] = "    let mut res = Vec::new();"
                $lines[$j+9] = "    for r in rows { if let Ok(cs) = r { res.push(cs); } }"
                $lines[$j+10] = "    Ok(res)"
                $lines[$j+11] = "}"
                break
            }
        }
    }
}

$newLines = [System.Collections.Generic.List[string]]::new()
$skip = $false

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "pub fn assign_subject_to_class") {
        $skip = $true
        # Supprimer le tag #[tauri::command] juste au dessus
        $newLines.RemoveAt($newLines.Count - 1)
        $newLines.Add(@"
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
    let conn = state.0.lock().map_err(|_| "Base verrouille".to_string())?;
    crate::commands::ensure_year_is_open(&conn, &school_id, &academic_year_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    
    // SQLite: booleans are stored as 1/0 integers, we can map true/false directly via rusqlite
    let mandatory_int = is_mandatory.map(|b| if b { 1 } else { 0 });

    conn.execute(
        "INSERT INTO class_subjects (id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, subject_type, is_mandatory, order_index, color_icon, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)",
        rusqlite::params![id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, subject_type, mandatory_int, order_index, color_icon, now]
    ).map_err(|e| format!("Erreur SQL: {}", e))?;
    crate::commands::enqueue_entity(&conn, "class_subjects", &school_id, &id);
    let subject_name: Option<String> = conn.query_row("SELECT name FROM subjects WHERE id=?1", rusqlite::params![subject_id], |r| r.get(0)).unwrap_or(None);
    let subject_code: Option<String> = conn.query_row("SELECT code FROM subjects WHERE id=?1", rusqlite::params![subject_id], |r| r.get(0)).unwrap_or(None);
    let class_name: Option<String> = conn.query_row("SELECT name FROM classes WHERE id=?1", rusqlite::params![class_id], |r| r.get(0)).unwrap_or(None);
    Ok(crate::models::ClassSubject { id, school_id, academic_year_id, class_id, subject_id, teacher_id, coefficient, weekly_hours, subject_type, is_mandatory, order_index, color_icon, subject_name, subject_code, class_name, teacher_name: None })
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
    let conn = state.0.lock().map_err(|_| "Base verrouille".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mandatory_int = is_mandatory.map(|b| if b { 1 } else { 0 });
    conn.execute(
        "UPDATE class_subjects SET coefficient=?1, teacher_id=?2, weekly_hours=?3, subject_type=?4, is_mandatory=?5, order_index=?6, color_icon=?7, updated_at=?8 WHERE id=?9 AND school_id=?10",
        rusqlite::params![coefficient, teacher_id, weekly_hours, subject_type, mandatory_int, order_index, color_icon, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "class_subjects", &school_id, &id);
    Ok(())
}
"@ -split "`r`n")
    }
    
    if ($skip -and $lines[$i] -match "pub fn remove_class_subject") {
        $skip = $false
        $newLines.Add("#[tauri::command]")
    }

    if (-not $skip) {
        $newLines.Add($lines[$i])
    }
}

$newLines.Add(@"

// ============================================================
// PEDAGOGICAL STRUCTURE (Nia)
// ============================================================

use crate::models::{Section, Level, Series};

#[tauri::command]
pub fn get_sections(school_id: String, state: State<'_, DbState>) -> Result<Vec<Section>, String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let mut stmt = conn.prepare("SELECT id, school_id, name FROM sections WHERE school_id = ?").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([school_id], |row| {
        Ok(Section {
            id: row.get(0)?,
            school_id: row.get(1)?,
            name: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut sections = Vec::new();
    for row in rows { sections.push(row.map_err(|e| e.to_string())?); }
    Ok(sections)
}

#[tauri::command]
pub fn create_section(school_id: String, name: String, state: State<'_, DbState>) -> Result<Section, String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO sections (id, school_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![id, school_id, name, now]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "sections", &school_id, &id);
    Ok(Section { id, school_id, name })
}

#[tauri::command]
pub fn update_section(id: String, school_id: String, name: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE sections SET name = ?1, updated_at = ?2 WHERE id = ?3 AND school_id = ?4",
        rusqlite::params![name, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "sections", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_section(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    conn.execute("DELETE FROM sections WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id]).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "sections", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn get_levels(school_id: String, section_id: Option<String>, state: State<'_, DbState>) -> Result<Vec<Level>, String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let mut levels = Vec::new();
    if let Some(sid) = section_id {
        let mut stmt = conn.prepare("SELECT id, school_id, section_id, name, level_order FROM levels WHERE school_id = ? AND section_id = ? ORDER BY level_order").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id, sid], |row| {
            Ok(Level {
                id: row.get(0)?, school_id: row.get(1)?, section_id: row.get(2)?,
                name: row.get(3)?, level_order: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { levels.push(row.map_err(|e| e.to_string())?); }
    } else {
        let mut stmt = conn.prepare("SELECT id, school_id, section_id, name, level_order FROM levels WHERE school_id = ? ORDER BY level_order").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id], |row| {
            Ok(Level {
                id: row.get(0)?, school_id: row.get(1)?, section_id: row.get(2)?,
                name: row.get(3)?, level_order: row.get(4)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { levels.push(row.map_err(|e| e.to_string())?); }
    }
    Ok(levels)
}

#[tauri::command]
pub fn create_level(school_id: String, section_id: String, name: String, level_order: i64, state: State<'_, DbState>) -> Result<Level, String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO levels (id, school_id, section_id, name, level_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![id, school_id, section_id, name, level_order, now]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "levels", &school_id, &id);
    Ok(Level { id, school_id, section_id, name, level_order })
}

#[tauri::command]
pub fn update_level(id: String, school_id: String, name: String, level_order: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE levels SET name = ?1, level_order = ?2, updated_at = ?3 WHERE id = ?4 AND school_id = ?5",
        rusqlite::params![name, level_order, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "levels", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_level(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    conn.execute("DELETE FROM levels WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id]).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "levels", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn get_series(school_id: String, level_id: Option<String>, state: State<'_, DbState>) -> Result<Vec<Series>, String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let mut series = Vec::new();
    if let Some(lid) = level_id {
        let mut stmt = conn.prepare("SELECT id, school_id, level_id, name FROM series WHERE school_id = ? AND level_id = ?").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id, lid], |row| {
            Ok(Series {
                id: row.get(0)?, school_id: row.get(1)?, level_id: row.get(2)?, name: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { series.push(row.map_err(|e| e.to_string())?); }
    } else {
        let mut stmt = conn.prepare("SELECT id, school_id, level_id, name FROM series WHERE school_id = ?").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([school_id], |row| {
            Ok(Series {
                id: row.get(0)?, school_id: row.get(1)?, level_id: row.get(2)?, name: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        for row in rows { series.push(row.map_err(|e| e.to_string())?); }
    }
    Ok(series)
}

#[tauri::command]
pub fn create_series(school_id: String, level_id: String, name: String, state: State<'_, DbState>) -> Result<Series, String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO series (id, school_id, level_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        rusqlite::params![id, school_id, level_id, name, now]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "series", &school_id, &id);
    Ok(Series { id, school_id, level_id, name })
}

#[tauri::command]
pub fn update_series(id: String, school_id: String, name: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE series SET name = ?1, updated_at = ?2 WHERE id = ?3 AND school_id = ?4",
        rusqlite::params![name, now, id, school_id]
    ).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "series", &school_id, &id);
    Ok(())
}

#[tauri::command]
pub fn delete_series(id: String, school_id: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Failed to lock db".to_string())?;
    conn.execute("DELETE FROM series WHERE id = ?1 AND school_id = ?2", rusqlite::params![id, school_id]).map_err(|e| e.to_string())?;
    crate::commands::enqueue_entity(&conn, "series", &school_id, &id);
    Ok(())
}
"@ -split "`r`n")

[System.IO.File]::WriteAllLines("C:\Users\Resp_ Tech\Desktop\Orion\src-tauri\src\commands.rs", $newLines)
Write-Host "Done rewriting commands.rs"