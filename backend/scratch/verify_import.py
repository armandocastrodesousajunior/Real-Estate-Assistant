try:
    from app.models.workspace import Workspace
    print("Sucesso: Workspace importado corretamente.")
except Exception as e:
    print(f"Erro na importação: {e}")
