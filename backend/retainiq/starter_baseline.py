"""The provided starter utility, unchanged, wrapped so its errors are captured.

`starter_kit/churn_utils.py` is loaded by path and never modified.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Optional

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
# starter_kit/ sits at the repo root (next to backend/); a copy inside backend/ also works.
_CANDIDATES = [_BACKEND_ROOT / "starter_kit" / "churn_utils.py",
               _BACKEND_ROOT.parent / "starter_kit" / "churn_utils.py"]
_STARTER_PATH = next((c for c in _CANDIDATES if c.exists()), _CANDIDATES[-1])
_module = None


def _load():
    global _module
    if _module is None:
        spec = importlib.util.spec_from_file_location("starter_churn_utils", _STARTER_PATH)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _module = mod
    return _module


def starter_assess(weekly_logins: Optional[List[float]]) -> Dict[str, Any]:
    """Run the starter utility. Never raises.

    Returns `{trend_pct, flagged, error}`; on failure `flagged` is None and
    `error` holds the exception text.
    """
    try:
        mod = _load()
        account = {"weekly_logins": weekly_logins}
        trend = mod.compute_trend_pct(weekly_logins)
        flagged = bool(mod.flag_at_risk(account))
        return {"trend_pct": round(trend, 1), "flagged": flagged, "error": None}
    except Exception as exc:  # the utility is documented as possibly buggy
        return {"trend_pct": None, "flagged": None, "error": f"{type(exc).__name__}: {exc}"}
