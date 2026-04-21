import sqlite3
import os

def migrate():
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'database.db')
    
    if not os.path.exists(db_path):
        print(f"Banco de dados não encontrado em {db_path}")
        return

    print(f"Conectando ao banco de dados: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        cursor.execute("PRAGMA table_info(message_feedbacks)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'embedding' in columns:
            print("A coluna 'embedding' já existe na tabela 'message_feedbacks'.")
        else:
            print("Adicionando coluna 'embedding' (TEXT) à tabela 'message_feedbacks'...")
            cursor.execute("ALTER TABLE message_feedbacks ADD COLUMN embedding TEXT")
            conn.commit()
            print("Migração concluída com sucesso!")
            
    except Exception as e:
        print(f"Erro durante a migração: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
