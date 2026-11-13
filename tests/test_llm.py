"""Checks the language-model client without calling a real API."""

import unittest
from types import SimpleNamespace

from citecheck.llm import (
    LLMClient,
    _teamily_openai_base,
    default_provider,
    from_env,
    provider_settings,
)


class FakeCompletions:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))],
            usage=SimpleNamespace(prompt_tokens=11, completion_tokens=4),
        )


class FakeClient:
    def __init__(self) -> None:
        self.chat = SimpleNamespace(completions=FakeCompletions())


class LLMClientTest(unittest.TestCase):
    def test_complete_records_tokens_and_json_mode(self) -> None:
        fake = FakeClient()
        client = LLMClient(model="test-model", client=fake)

        text = client.complete(
            [{"role": "user", "content": "hello"}],
            json_mode=True,
        )

        self.assertEqual(text, '{"ok": true}')
        self.assertEqual(client.usage.prompt_tokens, 11)
        self.assertEqual(client.usage.completion_tokens, 4)
        self.assertEqual(client.usage.total_tokens, 15)
        call = fake.chat.completions.calls[0]
        self.assertEqual(call["model"], "test-model")
        self.assertEqual(call["response_format"], {"type": "json_object"})

    def test_teamily_base_url_parsed(self) -> None:
        url = "https://teamily.ai/v1/agents/1bcba824-49b0-4518-9434-99a40d418f22/responses"
        base, agent = _teamily_openai_base(url)
        self.assertEqual(base, "https://teamily.ai/v1")
        self.assertEqual(agent, "1bcba824-49b0-4518-9434-99a40d418f22")

    def test_provider_settings_teamily(self) -> None:
        import os

        keys = {
            "AI_API_KEY": "test-key",
            "AI_BASE_URL": "https://teamily.ai/v1/agents/agent-uuid/responses",
        }
        old = {name: os.environ.get(name) for name in keys}
        try:
            for name, value in keys.items():
                os.environ[name] = value
            settings = provider_settings("teamily")
            self.assertEqual(settings["provider"], "teamily")
            self.assertEqual(settings["api_key"], "test-key")
            self.assertEqual(settings["model"], "agent-uuid")
        finally:
            for name, value in old.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def test_from_env_requires_api_key(self) -> None:
        import os

        old = {
            "LLM_API_KEY": os.environ.get("LLM_API_KEY"),
            "AI_API_KEY": os.environ.get("AI_API_KEY"),
            "AI_PROVIDER": os.environ.get("AI_PROVIDER"),
        }
        try:
            os.environ["LLM_API_KEY"] = ""
            os.environ["AI_API_KEY"] = ""
            os.environ["AI_PROVIDER"] = "llm"
            with self.assertRaises(RuntimeError):
                from_env()
        finally:
            for name, value in old.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def test_default_provider_prefers_hint(self) -> None:
        import os

        old = {
            "AI_PROVIDER": os.environ.get("AI_PROVIDER"),
            "LLM_API_KEY": os.environ.get("LLM_API_KEY"),
            "AI_API_KEY": os.environ.get("AI_API_KEY"),
        }
        try:
            os.environ["AI_PROVIDER"] = "teamily"
            os.environ["LLM_API_KEY"] = "llm-key"
            os.environ["AI_API_KEY"] = "ai-key"
            self.assertEqual(default_provider(), "teamily")
        finally:
            for name, value in old.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value


if __name__ == "__main__":
    unittest.main()
