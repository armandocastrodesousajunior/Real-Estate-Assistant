import httpx
import json
from typing import AsyncGenerator, Optional, List, Dict, Any
from app.core.config import settings
from loguru import logger


class OpenRouterClient:
    """Client async para a API do OpenRouter (compatível com OpenAI)"""

    BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(self):
        self._api_key: Optional[str] = settings.OPENROUTER_API_KEY

    @property
    def api_key(self) -> Optional[str]:
        return self._api_key

    def set_api_key(self, key: str):
        self._api_key = key

    def _get_headers(self) -> Dict[str, str]:
        if not self._api_key:
            raise ValueError("OpenRouter API key não configurada. Acesse Configurações > OpenRouter.")
        return {
            "Authorization": f"Bearer {self._api_key}",
            "HTTP-Referer": settings.OPENROUTER_SITE_URL,
            "X-Title": settings.OPENROUTER_SITE_NAME,
            "Content-Type": "application/json",
        }

    async def chat_completion(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 1.0,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        stream: bool = False,
    ) -> Dict[str, Any]:
        """Chamada síncrona (coleta resposta completa)"""
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "frequency_penalty": frequency_penalty,
            "presence_penalty": presence_penalty,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.BASE_URL}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def chat_completion_stream(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 1.0,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
    ) -> AsyncGenerator[str, None]:
        """Streaming de resposta (Server-Sent Events)"""
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "top_p": top_p,
            "frequency_penalty": frequency_penalty,
            "presence_penalty": presence_penalty,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.BASE_URL}/chat/completions",
                headers=self._get_headers(),
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            delta = chunk["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

    async def get_available_models(self) -> List[Dict[str, Any]]:
        """Lista modelos disponíveis no OpenRouter"""
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{self.BASE_URL}/models",
                headers=self._get_headers(),
            )
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])

    async def simple_complete(
        self,
        system_prompt: str,
        user_message: str,
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> str:
        """Convenience method para completions simples (retorna só o texto)"""
        result = await self.chat_completion(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return result["choices"][0]["message"]["content"].strip()


# Singleton global do client
openrouter = OpenRouterClient()
