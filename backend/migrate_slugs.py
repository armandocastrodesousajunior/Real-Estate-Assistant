import sqlite3

def run():
    conn = sqlite3.connect('database/database.db')
    cursor = conn.cursor()
    
    # 1. MIGRAR WORKSPACES
    print("Migrando workspaces...")
    cursor.execute("""
        CREATE TABLE workspaces_new (
            id INTEGER NOT NULL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            slug VARCHAR(100),
            owner_id INTEGER NOT NULL,
            created_at DATETIME,
            updated_at DATETIME,
            FOREIGN KEY(owner_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE (slug, owner_id)
        );
    """)
    cursor.execute("""
        CREATE INDEX ix_workspaces_new_id ON workspaces_new (id);
    """)
    cursor.execute("""
        CREATE INDEX ix_workspaces_new_slug ON workspaces_new (slug);
    """)
    cursor.execute("INSERT INTO workspaces_new SELECT id, name, slug, owner_id, created_at, updated_at FROM workspaces;")
    cursor.execute("DROP TABLE workspaces;")
    cursor.execute("ALTER TABLE workspaces_new RENAME TO workspaces;")
    
    # 2. MIGRAR AGENTES
    print("Migrando agentes...")
    cursor.execute("""
        CREATE TABLE agents_new (
            id INTEGER NOT NULL PRIMARY KEY,
            slug VARCHAR(50),
            name VARCHAR(100) NOT NULL,
            description TEXT,
            emoji VARCHAR(10),
            color VARCHAR(7),
            model VARCHAR(100),
            temperature FLOAT,
            max_tokens INTEGER,
            top_p FLOAT,
            frequency_penalty FLOAT,
            presence_penalty FLOAT,
            is_active BOOLEAN,
            is_system BOOLEAN,
            total_calls INTEGER,
            total_tokens_used INTEGER,
            avg_response_time_ms FLOAT,
            created_at DATETIME,
            updated_at DATETIME,
            workspace_id INTEGER NOT NULL,
            FOREIGN KEY(workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
            UNIQUE(slug, workspace_id)
        );
    """)
    cursor.execute("""
        CREATE INDEX ix_agents_new_id ON agents_new (id);
    """)
    cursor.execute("""
        CREATE INDEX ix_agents_new_slug ON agents_new (slug);
    """)
    cursor.execute("""
        CREATE INDEX ix_agents_new_workspace_id ON agents_new (workspace_id);
    """)
    
    cursor.execute("""
    INSERT INTO agents_new SELECT 
    id, slug, name, description, emoji, color, model, temperature, max_tokens, 
    top_p, frequency_penalty, presence_penalty, is_active, is_system, total_calls, 
    total_tokens_used, avg_response_time_ms, created_at, updated_at, workspace_id 
    FROM agents;
    """)
    cursor.execute("DROP TABLE agents;")
    cursor.execute("ALTER TABLE agents_new RENAME TO agents;")
    
    conn.commit()
    conn.close()
    print("Migracao do banco SQLite completada com sucesso!")

if __name__ == '__main__':
    run()
