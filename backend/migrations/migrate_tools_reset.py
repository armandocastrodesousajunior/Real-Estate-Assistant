from utils import get_db_connection

def run():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # DROP THE INCORRECT TABLES
        cursor.execute("DROP TABLE IF EXISTS tools")
        cursor.execute("DROP TABLE IF EXISTS agent_tools")
        
        # Create tools table correctly
        cursor.execute("""
        CREATE TABLE tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            prompt TEXT,
            type VARCHAR(20) DEFAULT 'external',
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Create agent_tools table correctly
        cursor.execute("""
        CREATE TABLE agent_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_slug VARCHAR(50) NOT NULL,
            tool_slug VARCHAR(50) NOT NULL,
            FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE
        )
        """)
        
        conn.commit()
        print("Migração de ferramentas RESETADA e recriada com sucesso!")
    except Exception as e:
        print(f"Erro na migração: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    run()
