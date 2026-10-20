import pytest


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    """Tests must never reach a real LLM, whatever the local .env says."""
    monkeypatch.setattr("retainiq.agent.agent.get_client", lambda: None)
    monkeypatch.setattr("retainiq.api.app.get_client", lambda: None)
