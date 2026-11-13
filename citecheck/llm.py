"""Configurable OpenAI-compatible language-model client."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]

PROVIDERS = ("llm", "teamily")


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def add(self, prompt_tokens: int, completion_tokens: int) -> None:
        self.prompt_tokens += prompt_tokens
        self.completion_tokens += completion_tokens


@dataclass
class LLMClient:
    """Chat client that records token use for later cost reporting."""

    model: str
    client: object
    provider: str = "llm"
    usage: TokenUsage = field(default_factory=TokenUsage)

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
        json_mode: bool = False,
    ) -> str:
        kwargs: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = self.client.chat.completions.create(**kwargs)
        usage = getattr(response, "usage", None)
        if usage is not None:
            self.usage.add(
                int(getattr(usage, "prompt_tokens", 0) or 0),
                int(getattr(usage, "completion_tokens", 0) or 0),
            )
        content = response.choices[0].message.content
        return content or ""

    def complete_json(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float = 0.0,
    ) -> dict:
        """Ask for a JSON object. Retry without JSON mode if the server rejects it."""
        try:
            text = self.complete(messages, temperature=temperature, json_mode=True)
        except Exception as exc:
            if "response_format" not in str(exc).lower() and "json" not in str(exc).lower():
                raise
            text = self.complete(messages, temperature=temperature, json_mode=False)
        return parse_json(text)


def parse_json(text: str) -> dict:
    """Parse a JSON object, including a markdown fence or surrounding text."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if match is None:
            raise ValueError(f"Model did not return JSON: {cleaned[:300]}")
        value = json.loads(match.group(0))
    if not isinstance(value, dict):
        raise ValueError("Model JSON was not an object.")
    return value


def _teamily_openai_base(url: str) -> tuple[str, str]:
    """Turn an agent /responses URL into OpenAI SDK base_url + model id when needed."""
    cleaned = url.strip().rstrip("/")
    match = re.search(r"(https://[^/]+/v1)/agents/([^/]+)", cleaned)
    if match:
        return match.group(1), match.group(2)
    if cleaned.endswith("/responses"):
        cleaned = cleaned[: -len("/responses")].rstrip("/")
    if "/agents/" in cleaned:
        root, _, agent = cleaned.partition("/agents/")
        return root.rstrip("/") or "https://teamily.ai/v1", agent.split("/")[0]
    return cleaned or "https://teamily.ai/v1", ""


def _read_env() -> None:
    load_dotenv(ROOT / ".env")


def provider_settings(provider: str) -> dict[str, str]:
    """Env-backed settings for one provider id (`llm` or `teamily`). Keys may be empty."""
    _read_env()
    name = provider.strip().lower()
    if name == "teamily":
        raw_url = os.getenv("AI_BASE_URL", "https://teamily.ai/v1").strip()
        base_url, agent_id = _teamily_openai_base(raw_url)
        return {
            "provider": "teamily",
            "base_url": base_url,
            "api_key": os.getenv("AI_API_KEY", "").strip(),
            "model": os.getenv("AI_MODEL", "").strip() or agent_id or "teamily",
        }
    if name == "llm":
        return {
            "provider": "llm",
            "base_url": os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip(),
            "api_key": os.getenv("LLM_API_KEY", "").strip(),
            "model": os.getenv("LLM_MODEL", "gpt-4o-mini").strip(),
        }
    raise ValueError(f"Unknown provider: {provider}")


def provider_configured(provider: str) -> bool:
    return bool(provider_settings(provider)["api_key"])


def default_provider() -> str:
    """CLI / new-user default: `AI_PROVIDER` when configured, else first configured provider."""
    _read_env()
    hint = os.getenv("AI_PROVIDER", "").strip().lower()
    if hint in PROVIDERS and provider_configured(hint):
        return hint
    for name in PROVIDERS:
        if provider_configured(name):
            return name
    return "llm"


def list_providers() -> list[dict]:
    items: list[dict] = []
    for name in PROVIDERS:
        settings = provider_settings(name)
        items.append(
            {
                "id": name,
                "model": settings["model"],
                "configured": bool(settings["api_key"]),
            }
        )
    return items


def load_settings() -> dict[str, str]:
    """Active provider settings (default provider). Used by health checks and CLI."""
    provider = default_provider()
    return provider_settings(provider)


def from_provider(provider: str) -> LLMClient:
    """Build a client for `llm` or `teamily`."""
    settings = provider_settings(provider)
    if not settings["api_key"]:
        if provider == "teamily":
            raise RuntimeError("AI_API_KEY is empty. Add Teamily credentials to .env.")
        raise RuntimeError("LLM_API_KEY is empty. Copy .env.example to .env and set the key.")
    from openai import OpenAI

    client = OpenAI(base_url=settings["base_url"], api_key=settings["api_key"])
    return LLMClient(
        model=settings["model"],
        client=client,
        provider=settings["provider"],
    )


def from_env() -> LLMClient:
    """Build a client using the default provider."""
    return from_provider(default_provider())
