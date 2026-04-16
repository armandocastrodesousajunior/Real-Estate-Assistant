from utils import get_db_connection

def run():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE conversations ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT 0;")
        conn.commit()
        print("Migration executada com sucesso. Coluna 'is_test' foi adicionada.")
    except Exception as e:
        print(f"Erro ignorado (possivelmente a coluna ja existe): {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    run()
