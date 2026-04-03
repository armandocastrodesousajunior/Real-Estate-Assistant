import sqlite3
conn = sqlite3.connect('database/database.db')
cursor = conn.cursor()
cursor.execute('PRAGMA table_info(tools)')
for col in cursor.fetchall():
    print(col)
conn.close()
