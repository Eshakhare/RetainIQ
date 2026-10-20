"""Vertex AI adapter: request shape, auth header and provider selection (no network)."""
import io
import json

import pytest

from retainiq.agent import client as client_mod
from retainiq.agent.client import LLMError, VertexClient, get_client


class FakeCreds:
    valid = True
    token = "tok123"


class FakeResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_vertex_request_and_parse(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout=None):
        seen["url"], seen["auth"] = req.full_url, req.get_header("Authorization")
        seen["body"] = json.loads(req.data)
        payload = {"candidates": [{"content": {"parts": [
            {"functionCall": {"name": "list_flagged", "args": {}}}]}}]}
        return FakeResp(json.dumps(payload).encode())

    monkeypatch.setattr(client_mod.urllib.request, "urlopen", fake_urlopen)
    c = VertexClient(FakeCreds(), "my-proj", "us-central1", "gemini-2.5-flash-lite")
    resp = c.generate("sys", [{"role": "user", "text": "hi"}], [{"name": "list_flagged", "description": "d"}])
    assert seen["url"] == ("https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/"
                           "us-central1/publishers/google/models/gemini-2.5-flash-lite:generateContent")
    assert seen["auth"] == "Bearer tok123"
    assert seen["body"]["generationConfig"]["temperature"] == 0
    assert resp.tool_calls[0].name == "list_flagged"


def test_vertex_global_endpoint():
    c = VertexClient(FakeCreds(), "p", "global", "m")
    assert c._endpoint().startswith("https://aiplatform.googleapis.com/v1/projects/p/locations/global/")


def test_vertex_http_error_becomes_llm_error(monkeypatch):
    import urllib.error

    def boom(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 403, "denied", {}, None)

    monkeypatch.setattr(client_mod.urllib.request, "urlopen", boom)
    with pytest.raises(LLMError, match="403"):
        VertexClient(FakeCreds(), "p", "us-central1", "m").generate("s", [{"role": "user", "text": "x"}])


def test_get_client_selection(monkeypatch):
    for k in ("GOOGLE_CLOUD_PROJECT", "LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "LLM_MODEL"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "vertex")
    assert get_client() is None                      # no project
    monkeypatch.setenv("GOOGLE_CLOUD_PROJECT", "p")
    monkeypatch.setattr(client_mod, "_vertex_credentials", lambda: None)
    assert get_client() is None                      # no credentials
    monkeypatch.setattr(client_mod, "_vertex_credentials", lambda: FakeCreds())
    c = get_client()
    assert isinstance(c, VertexClient) and c.model == "gemini-2.5-flash-lite" and c.location == "us-central1"
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    assert get_client() is None
    monkeypatch.setenv("LLM_API_KEY", "k")
    assert get_client().model == "gemini-2.5-flash-lite"
