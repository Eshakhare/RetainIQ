"""Tiny .env loader (no dependency). Real environment variables always win."""
from __future__ import annotations

import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent


def load_env(path: Path | None = None) -> None:
    if path is None:
        if (_ROOT / ".env").is_file():
            path = _ROOT / ".env"
        elif (_ROOT.parent / ".env").is_file():
            path = _ROOT.parent / ".env"
        else:
            path = _ROOT / ".env"

    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    env_dir = path.parent
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            if key == "GOOGLE_APPLICATION_CREDENTIALS" and not Path(value).is_absolute():
                resolved = (env_dir / value).resolve()
                if resolved.exists():
                    value = str(resolved)
            os.environ[key] = value
