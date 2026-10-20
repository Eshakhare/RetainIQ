"""Result cache so the demo is repeatable and cheap. Key: hash of facts, prompt version, model."""
from __future__ import annotations

import copy
import hashlib
import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional

DEFAULT_PATH = Path(__file__).resolve().parent.parent.parent / ".cache" / "agent_cache.json"


def make_key(*parts: Any) -> str:
    blob = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class AgentCache:
    """In-memory cache with optional JSON-file persistence (best effort)."""

    def __init__(self, path: Optional[Path] = None):
        self._path = path
        self._lock = threading.Lock()
        self._data: Dict[str, Any] = {}
        if path is not None:
            try:
                self._data = json.loads(Path(path).read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                self._data = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            value = self._data.get(key)
            return copy.deepcopy(value) if value is not None else None

    def set(self, key: str, value: Dict[str, Any]) -> None:
        with self._lock:
            self._data[key] = copy.deepcopy(value)
            if self._path is not None:
                try:
                    Path(self._path).parent.mkdir(parents=True, exist_ok=True)
                    Path(self._path).write_text(json.dumps(self._data), encoding="utf-8")
                except OSError:
                    pass  # persistence is a convenience, never a failure
