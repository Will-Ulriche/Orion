use rusqlite::{Connection, Result};

fn main() -> Result<()> {
    let conn = Connection::open("C:\\Users\\Resp_ Tech\\AppData\\Roaming\\com.orion.app\\orion.sqlite")?;
    let mut stmt = conn.prepare(
        "SELECT cs.id, cs.school_id, cs.academic_year_id, cs.class_id, cs.subject_id,
                cs.teacher_id, cs.coefficient,
                s.name, s.code, c.name,
                (u.first_name || ' ' || u.last_name),
                cs.weekly_hours, cs.subject_type, cs.is_mandatory, cs.order_index, cs.color_icon
         FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         JOIN classes c ON cs.class_id = c.id
         LEFT JOIN users u ON cs.teacher_id = u.id"
    )?;
    
    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let is_mandatory_int: Option<i64> = row.get(13)?;
        Ok(id)
    })?;

    let mut count = 0;
    for r in rows {
        match r {
            Ok(id) => { count += 1; println!("Success: {}", id); },
            Err(e) => println!("Error mapping row: {:?}", e),
        }
    }
    println!("Total mapped: {}", count);
    Ok(())
}
