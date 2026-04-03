import sqlite3
import pprint

conn = sqlite3.connect('database/database.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
cursor.execute("SELECT id, session_id, title, message_count, is_test FROM conversations ORDER BY id DESC LIMIT 20;")
rows = cursor.fetchall()
for r in rows:
    print(dict(r))
conn.close()
