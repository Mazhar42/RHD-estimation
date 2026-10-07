import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else 'estimation.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in cursor.fetchall()]
print(f"Tables in {db_path}:", tables)
conn.close()
