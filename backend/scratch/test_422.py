import requests

url = "http://localhost:8000/api/v1/agents/"
headers = {
    "Authorization": "Bearer YOUR_TOKEN_HERE", # Eu não tenho o token, mas o 422 ocorre antes ou depois do 401?
}
# Na verdade eu posso ver os logs do uvicorn se eu tiver acesso ao terminal.
# O user disse que deu erro 422.

data = {
    "slug": "test",
    "name": "Test Agent",
    "system_prompt": "short" # Is too short (min 20)
}

# Se eu quiser testar, eu precisaria de um token válido.
