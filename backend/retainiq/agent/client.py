"""Provider adapter. No provider or model is hard-coded in the agent.

Configured by environment variables:
    LLM_PROVIDER   "vertex" (default) or "gemini" (API key)
    LLM_MODEL      model id (default gemini-2.5-flash-lite)
  Vertex AI: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION (default us-central1),
             GOOGLE_APPLICATION_CREDENTIALS (service-account JSON path)
  Gemini API: LLM_API_KEY (GEMINI_API_KEY / GOOGLE_API_KEY also accepted)

Internal message format (provider-neutral):
    {"role": "user",  "text": "..."}
    {"role": "model", "tool_calls": [{"name", "args"}], "raw": <provider data>}
    {"role": "tool",  "name": "...", "result": {...}}
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class LLMError(Exception):
    """Any provider failure (network, HTTP, malformed response)."""


@dataclass
class ToolCall:
    name: str
    args: Dict[str, Any]


@dataclass
class LLMResponse:
    text: str = ""
    tool_calls: List[ToolCall] = field(default_factory=list)
    raw: Any = None


class LLMClient:
    """Interface: subclasses implement `generate`."""

    model: str = "unknown"

    def generate(self, system: str, messages: List[Dict[str, Any]],
                 tools: Optional[List[Dict[str, Any]]] = None,
                 timeout: Optional[float] = None) -> LLMResponse:
        raise NotImplementedError


class GeminiClient(LLMClient):
    _URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    def generate(self, system, messages, tools=None, timeout=None) -> LLMResponse:
        body: Dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": self._contents(messages),
            "generationConfig": {"temperature": 0},
        }
        if tools:
            body["tools"] = [{"functionDeclarations": tools}]
        req = urllib.request.Request(
            self._URL.format(model=self.model),
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": self.api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout or 20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LLMError(f"HTTP {exc.code} from Gemini") from exc
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise LLMError(f"Gemini request failed: {type(exc).__name__}") from exc
        return self._parse(payload)

    @staticmethod
    def _contents(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        contents: List[Dict[str, Any]] = []
        for m in messages:
            if m["role"] == "user":
                contents.append({"role": "user", "parts": [{"text": m["text"]}]})
            elif m["role"] == "model":
                # Replay the provider's own parts so any thought signatures survive.
                contents.append({"role": "model", "parts": m["raw"]})
            elif m["role"] == "tool":
                part = {"functionResponse": {"name": m["name"], "response": {"result": m["result"]}}}
                if contents and contents[-1]["role"] == "user" and \
                        all("functionResponse" in p for p in contents[-1]["parts"]):
                    contents[-1]["parts"].append(part)
                else:
                    contents.append({"role": "user", "parts": [part]})
        return contents

    @staticmethod
    def _parse(payload: Dict[str, Any]) -> LLMResponse:
        try:
            parts = payload["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("unexpected Gemini response shape") from exc
        text, calls = [], []
        for p in parts:
            if "functionCall" in p:
                fc = p["functionCall"]
                calls.append(ToolCall(fc.get("name", ""), fc.get("args") or {}))
            elif p.get("text") and not p.get("thought"):
                text.append(p["text"])
        return LLMResponse(text="".join(text), tool_calls=calls, raw=parts)


class VertexClient(GeminiClient):
    """Gemini on Vertex AI, authenticated with a service account (or ADC).

    Same request/response format as the Gemini API; only URL and auth differ.
    """
    _SCOPE = "https://www.googleapis.com/auth/cloud-platform"

    def __init__(self, credentials, project: str, location: str, model: str):
        self._credentials = credentials
        self.project, self.location, self.model = project, location, model

    def _endpoint(self) -> str:
        host = ("aiplatform.googleapis.com" if self.location == "global"
                else f"{self.location}-aiplatform.googleapis.com")
        return (f"https://{host}/v1/projects/{self.project}/locations/{self.location}"
                f"/publishers/google/models/{self.model}:generateContent")

    def _token(self) -> str:
        try:
            from google.auth.transport.requests import Request
            if not self._credentials.valid:
                self._credentials.refresh(Request())
            return self._credentials.token
        except Exception as exc:
            raise LLMError(f"Vertex auth failed: {type(exc).__name__}") from exc

    def generate(self, system, messages, tools=None, timeout=None) -> LLMResponse:
        body: Dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": self._contents(messages),
            "generationConfig": {"temperature": 0},
        }
        if tools:
            body["tools"] = [{"functionDeclarations": tools}]
        req = urllib.request.Request(
            self._endpoint(),
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self._token()}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout or 20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LLMError(f"HTTP {exc.code} from Vertex AI") from exc
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            raise LLMError(f"Vertex AI request failed: {type(exc).__name__}") from exc
        return self._parse(payload)


_vertex_creds_cache: Dict[str, Any] = {}


def _vertex_credentials():
    """Service-account / ADC credentials (cached), or None if unavailable."""
    if "creds" not in _vertex_creds_cache:
        creds = None
        try:
            import google.auth
            creds, _ = google.auth.default(scopes=[VertexClient._SCOPE])
        except Exception:
            creds = None
        if creds is not None:
            _vertex_creds_cache["creds"] = creds
        return creds
    return _vertex_creds_cache["creds"]


def get_client() -> Optional[LLMClient]:
    """Client from the environment, or None when no usable configuration exists.

    LLM_PROVIDER=vertex (default): needs GOOGLE_CLOUD_PROJECT and credentials
    (GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account JSON, or ADC).
    LLM_PROVIDER=gemini: Gemini API key (LLM_API_KEY).
    """
    provider = os.environ.get("LLM_PROVIDER", "vertex").strip().lower()
    if provider == "vertex":
        project = os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()
        if not project:
            return None
        creds = _vertex_credentials()
        if creds is None:
            return None
        return VertexClient(creds, project,
                            os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1").strip(),
                            os.environ.get("LLM_MODEL", "gemini-2.5-flash-lite").strip())
    if provider == "gemini":
        key = (os.environ.get("LLM_API_KEY") or os.environ.get("GEMINI_API_KEY")
               or os.environ.get("GOOGLE_API_KEY") or "").strip()
        if key:
            return GeminiClient(key, os.environ.get("LLM_MODEL", "gemini-2.5-flash-lite").strip())
    return None
