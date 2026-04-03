import sqlite3

def run_migration():
    conn = sqlite3.connect('database/database.db')
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE conversations ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT 0;")
        conn.commit()
        print("Migration executada com sucesso. Coluna 'is_test' foi adicionada.")
    except sqlite3.OperationalError as e:
        print(f"Erro ignorado (possivelmente a coluna ja existe): {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    run_migration()
