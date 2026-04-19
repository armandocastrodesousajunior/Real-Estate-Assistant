import httpx
import json
from typing import AsyncGenerator, Optional, List, Dict, Any
from app.core.config import settings
from loguru import logger


class OpenRouterError(Exception):
    """Exceção customizada para erros da API OpenRouter"""
    def __init__(self, message: str, status_code: Optional[int] = None, detail: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


class OpenRouterClient:
    """Client async para a API do OpenRouter (compatível com OpenAI)"""

    BASE_URL = "https://openrouter.ai/api/v1"

    def _get_headers(self, override_key: Optional[str] = None) -> Dict[str, str]:
        key = override_key or settings.OPENROUTER_API_KEY
        if not key:
            raise OpenRouterError("OpenRouter API key não configurada. Verifique suas configurações de perfil ou o arquivo .env.")
        
        return {
            "Authorization": f"Bearer {key}",
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
        api_key: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
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
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers=self._get_headers(api_key),
                    json=payload,
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                error_detail = {}
                try:
                    error_detail = e.response.json()
                except:
                    pass
                
                msg = error_detail.get("error", {}).get("message", str(e))
                logger.error(f"OpenRouter API Error ({e.response.status_code}): {msg}")
                raise OpenRouterError(f"Erro na API OpenRouter: {msg}", status_code=e.response.status_code, detail=error_detail)
            except Exception as e:
                if isinstance(e, OpenRouterError): raise
                logger.error(f"OpenRouter Client Error: {e}")
                raise OpenRouterError(f"Erro de conexão com OpenRouter: {str(e)}")

    async def chat_completion_stream(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 1.0,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        api_key: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
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
            "stream_options": {"include_usage": True}
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                async with client.stream(
                    "POST",
                    f"{self.BASE_URL}/chat/completions",
                    headers=self._get_headers(api_key),
                    json=payload,
                ) as response:
                    if response.status_code != 200:
                        # Erro síncrono antes do stream começar
                        await response.aread()
                        error_detail = {}
                        try:
                            error_detail = response.json()
                        except:
                            pass
                        msg = error_detail.get("error", {}).get("message", f"HTTP {response.status_code}")
                        raise OpenRouterError(f"Erro no Stream OpenRouter: {msg}", status_code=response.status_code, detail=error_detail)

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                # OpenRouter with include_usage=True sends usage in a chunk where choices is empty
                                if "usage" in chunk and chunk["usage"]:
                                    yield {"usage": chunk["usage"]}
                                
                                if "choices" in chunk and len(chunk["choices"]) > 0:
                                    delta = chunk["choices"][0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue
            except httpx.HTTPStatusError as e:
                # Caso ocorra erro durante a iteração do stream (raro)
                logger.error(f"OpenRouter Stream HTTP Error: {e}")
                raise OpenRouterError(f"Erro no fluxo do OpenRouter: {str(e)}")
            except Exception as e:
                if isinstance(e, OpenRouterError): raise
                logger.error(f"OpenRouter Stream Exception: {e}")
                raise OpenRouterError(f"Erro de conexão no stream: {str(e)}")

    async def get_available_models(self, api_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lista modelos disponíveis no OpenRouter"""
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{self.BASE_URL}/models",
                headers=self._get_headers(api_key),
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
        api_key: Optional[str] = None,
        response_format: Optional[Dict[str, Any]] = None,
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
            api_key=api_key,
            response_format=response_format,
        )
        content = result["choices"][0]["message"]["content"].strip()
        usage = result.get("usage", {})
        return {"content": content, "usage": usage}


# Singleton global do client
openrouter = OpenRouterClient()
