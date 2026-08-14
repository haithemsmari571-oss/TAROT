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


def test_runtime_prompt_and_model_are_one_registry_version(monkeypatch):
    from types import SimpleNamespace

    from app.database import client as database_client
    from app.services.ai import registry

    runtime_prompts.clear_runtime_prompt_cache()
    monkeypatch.setattr(database_client, "SessionLocal", lambda: _Context())
    monkeypatch.setattr(
        registry,
        "get_prompt",
        lambda _db, _key: SimpleNamespace(
            prompt="owner prompt",
            default_prompt="shipped",
            model="configured-model",
            is_default=0,
            variables=[],
        ),
    )
    monkeypatch.setattr(registry, "configured_models", lambda: ["configured-model"])
    assert runtime_prompts.resolve_runtime_prompt_and_model(
        "reading.test", "shipped", "shipped-model"
    ) == ("owner prompt", "configured-model")

    monkeypatch.setattr(
        registry, "get_prompt", lambda _db, _key: (_ for _ in ()).throw(RuntimeError())
    )
    assert runtime_prompts.resolve_runtime_prompt_and_model(
        "reading.test", "new shipped", "new shipped-model"
    ) == ("owner prompt", "configured-model")


def test_valentina_executes_the_registry_model(monkeypatch):
    from app.services.ai import reading_valentina

    captured = {}
    monkeypatch.setattr(
        reading_valentina,
        "resolve_runtime_prompt_and_model",
        lambda *_args: ("registry prompt", "registry-valentina-model"),
    )
    monkeypatch.setattr(
        reading_valentina.ai_client,
        "run_chat_stream",
        lambda **kwargs: captured.update(kwargs) or iter(["answer"]),
    )

    assert reading_valentina.write_valentina("input", client_message="hello") == "answer"
    assert captured["system"] == "registry prompt"
    assert captured["model"] == "registry-valentina-model"


def test_sabri_executes_the_registry_model(monkeypatch):
    from app.services.ai import reading_sabri

    captured = {}
    monkeypatch.setattr(
        reading_sabri,
        "resolve_runtime_prompt_and_model",
        lambda *_args: ("registry prompt", "registry-sabri-model"),
    )
    monkeypatch.setattr(
        reading_sabri.ai_client,
        "run_chat",
        lambda **kwargs: captured.update(kwargs) or {"text": "answer"},
    )

    assert reading_sabri.run_sabri("input") == "answer"
    assert captured["system"] == "registry prompt"
    assert captured["model"] == "registry-sabri-model"
