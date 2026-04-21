import sqlite3
import os
import sys

def migrate():
    # Caminho para o banco de dados
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database', 'database.db')
    
    if not os.path.exists(db_path):
        print(f"Banco de dados não encontrado em {db_path}")
        return

    print(f"Conectando ao banco de dados: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Verificar se a coluna já existe
        cursor.execute("PRAGMA table_info(agents)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'feedback_limit' in columns:
            print("A coluna 'feedback_limit' já existe na tabela 'agents'.")
        else:
            print("Adicionando coluna 'feedback_limit' à tabela 'agents'...")
            cursor.execute("ALTER TABLE agents ADD COLUMN feedback_limit INTEGER DEFAULT 15")
            conn.commit()
            print("Migração concluída com sucesso!")
            
    except Exception as e:
        print(f"Erro durante a migração: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
