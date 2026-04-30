import sqlite3
import os
import secrets

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
        cursor.execute("PRAGMA table_info(workspaces)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'api_token' in columns:
            print("A coluna 'api_token' já existe na tabela 'workspaces'.")
        else:
            print("Adicionando coluna 'api_token' à tabela 'workspaces'...")
            cursor.execute("ALTER TABLE workspaces ADD COLUMN api_token VARCHAR(64)")
            conn.commit()
            
            # SQLite require creating index separately
            print("Criando índice único para api_token...")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_workspaces_api_token ON workspaces (api_token)")
            conn.commit()
            
            print("Adicionando token para workspaces existentes...")
            cursor.execute("SELECT id FROM workspaces WHERE api_token IS NULL")
            rows = cursor.fetchall()
            for row in rows:
                token = secrets.token_hex(32)
                cursor.execute("UPDATE workspaces SET api_token = ? WHERE id = ?", (token, row[0]))
            conn.commit()
            
            print("Migração concluída com sucesso!")
            
    except Exception as e:
        print(f"Erro durante a migração: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
