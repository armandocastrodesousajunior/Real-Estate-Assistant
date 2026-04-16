import os
import sqlite3
from dotenv import load_dotenv

def get_db_path():
    """
    Carrega o caminho do banco de dados SQLite a partir do arquivo .env.
    Dá suporte a DATABASE_URL no formato sqlite+aiosqlite:///...
    """
    # Procura o arquivo .env na raiz do projeto (um nível acima da pasta migrations)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dotenv_path = os.path.join(base_dir, ".env")
    
    load_dotenv(dotenv_path)
    
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        # Fallback padrão caso o .env não esteja configurado
        return os.path.join(base_dir, "database", "database.db")
    
    # Se for SQLite, extrai o caminho após a última barra tripla
    if "sqlite" in db_url:
        # Formatos comuns: 
        # sqlite:///./database/database.db
        # sqlite+aiosqlite:///./database/database.db
        path = db_url.split("///")[-1]
        
        # Resolve caminhos relativos baseados no ./
        if path.startswith("./"):
            return os.path.join(base_dir, path[2:])
        return os.path.join(base_dir, path)
        
    return db_url

def get_db_connection():
    """Retorna uma conexão sqlite3 conectada ao caminho do .env"""
    path = get_db_path()
    if not os.path.exists(os.path.dirname(path)) and os.path.dirname(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
    return sqlite3.connect(path)
