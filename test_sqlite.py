import sqlite3
import traceback

try:
    conn = sqlite3.connect(r'C:\Users\Resp_ Tech\AppData\Roaming\com.orion.app\orion.sqlite')
    query = ""^"SELECT cs.id, cs.school_id, cs.academic_year_id, cs.class_id, cs.subject_id, cs.teacher_id, cs.coefficient, s.name, s.code, c.name, (u.first_name || ' ' || u.last_name), cs.weekly_hours, cs.subject_type, cs.is_mandatory, cs.order_index, cs.color_icon FROM class_subjects cs JOIN subjects s ON cs.subject_id = s.id JOIN classes c ON cs.class_id = c.id LEFT JOIN users u ON cs.teacher_id = u.id""^"
    print(conn.execute(query).fetchall())
except Exception as e:
    print(e)
    traceback.print_exc()
