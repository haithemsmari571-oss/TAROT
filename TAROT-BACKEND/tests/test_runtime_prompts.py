from app.services.ai import runtime_prompts


class _Context:
    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, traceback):
        return False


def test_runtime_prompt_uses_registry_then_last_known_good(monkeypatch):
    from app.database import client as database_client
    from app.services.ai import registry

    runtime_prompts.clear_runtime_prompt_cache()
    monkeypatch.setattr(database_client, "SessionLocal", lambda: _Context())
    monkeypatch.setattr(registry, "get_prompt_text", lambda _db, _key: "active owner prompt")
    assert runtime_prompts.resolve_runtime_prompt("reading.test", "shipped") == "active owner prompt"

    def unavailable(_db, _key):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(registry, "get_prompt_text", unavailable)
    assert runtime_prompts.resolve_runtime_prompt("reading.test", "shipped") == "active owner prompt"


def test_runtime_prompt_cold_failure_uses_shipped_fallback(monkeypatch):
    from app.database import client as database_client

    runtime_prompts.clear_runtime_prompt_cache()
    monkeypatch.setattr(database_client, "SessionLocal", lambda: (_ for _ in ()).throw(
        RuntimeError("database unavailable")
    ))
    assert runtime_prompts.resolve_runtime_prompt("reading.cold", "shipped") == "shipped"
