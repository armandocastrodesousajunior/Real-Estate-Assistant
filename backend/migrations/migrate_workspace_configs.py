from utils import get_db_connection

def run():
    print("Iniciando migração de configurações de IA por Workspace...")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Adicionar colunas individualmente (SQLite não permite ADD COLUMN múltiplo em um comando)
        columns = [
            ("supervisor_model", "VARCHAR(100)"),
            ("supervisor_temperature", "FLOAT"),
            ("prompt_assistant_model", "VARCHAR(100)"),
            ("prompt_assistant_temperature", "FLOAT"),
            ("repair_model", "VARCHAR(100)"),
            ("repair_temperature", "FLOAT")
        ]
        
        for col_name, col_type in columns:
            try:
                cursor.execute(f"ALTER TABLE workspaces ADD COLUMN {col_name} {col_type};")
                print(f"  + Coluna '{col_name}' adicionada.")
            except Exception as e:
                print(f"  - Coluna '{col_name}' já existe ou erro: {e}")
        
        conn.commit()
        print("Migração concluída com sucesso!")
    except Exception as e:
        print(f"Erro crítico na migração: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    run()
