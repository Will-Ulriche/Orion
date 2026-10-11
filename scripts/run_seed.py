import sqlite3
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = r"C:\Users\Resp_ Tech\AppData\Roaming\com.orion.app\orion.sqlite"
SQL_PATH = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "migrations", "19_seed_realistic.sql")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

with open(SQL_PATH, "r", encoding="utf-8") as f:
    sql = f.read()

try:
    conn.executescript(sql)
    conn.commit()
    print("OK Seed reussi!")

    tables = ["students", "enrollments", "staff", "classes", "payments", "grades", "subjects"]
    for t in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {t}")
        count = cursor.fetchone()[0]
        print(f"  {t}: {count} enregistrements")

except Exception as e:
    print(f"ERREUR: {e}")
    conn.rollback()
finally:
    conn.close()

