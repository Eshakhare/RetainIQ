"""Read-only, deterministic tools over the engine's output.

The model sees account IDs, plan tier and aggregate statistics only: no
customer names and no raw weekly series.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List

from ..backtest import replay_series
from ..config import FLAGGED_TIERS, NEEDS_REVIEW, Config

_ACTIONABLE = FLAGGED_TIERS + (NEEDS_REVIEW,)

TOOL_DECLARATIONS: List[Dict[str, Any]] = [
    {
        "name": "list_flagged",
        "description": "Ranked accounts that need attention (Critical, At risk, Watch, Needs review) with key stats.",
    },
    {
        "name": "get_account",
        "description": "Features, pattern, flags and windows (1-based week numbers) for one account.",
        "parameters": {
            "type": "object",
            "properties": {"account_id": {"type": "string", "description": "e.g. A-01"}},
            "required": ["account_id"],
        },
    },
    {
        "name": "get_replay",
        "description": "When each tier first appeared for one account (weeks of history at the time).",
        "parameters": {
            "type": "object",
            "properties": {"account_id": {"type": "string"}},
            "required": ["account_id"],
        },
    },
    {
        "name": "get_portfolio_stats",
        "description": "Counts by tier and any platform-wide shift annotation.",
    },
]


def _week_range(idx_range):
    """Zero-based inclusive index range -> 1-based week numbers."""
    return None if not idx_range else [idx_range[0] + 1, idx_range[1] + 1]


class AgentTools:
    def __init__(self, report: Dict[str, Any], cfg: Config):
        self._report = report
        self._cfg = cfg
        self._by_id = {r["account_id"]: r for r in report["results"]}
        self._handlers: Dict[str, Callable[..., Dict[str, Any]]] = {
            "list_flagged": self.list_flagged,
            "get_account": self.get_account,
            "get_replay": self.get_replay,
            "get_portfolio_stats": self.get_portfolio_stats,
        }

    # ----- helpers --------------------------------------------------------
    @staticmethod
    def _summary(r: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "account_id": r["account_id"],
            "plan_tier": r["plan_tier"],
            "tier": r["tier"],
            "rank": r["rank"],
            "weeks_of_history": r["weeks_of_history"],
            "recent_level": r["recent_level"],
            "baseline_level": r["baseline_level"],
            "drop_pct": r["drop_pct"],
            "last2_drop_pct": r["last2_drop_pct"],
            "confidence": r["confidence"],
            "pattern": r["pattern"],
            "cliff_week": r["cliff_week"],
            "flags": list(r["flags"]),
            "annotations": list(r["annotations"]),
        }

    # ----- tools ----------------------------------------------------------
    def list_flagged(self) -> Dict[str, Any]:
        return {"accounts": [self._summary(r) for r in self._report["results"] if r["tier"] in _ACTIONABLE]}

    def get_account(self, account_id: str) -> Dict[str, Any]:
        r = self._by_id.get(account_id)
        if r is None:
            return {"error": f"unknown account_id {account_id!r}"}
        out = self._summary(r)
        w = r.get("windows") or {}
        out.update(
            noise_pct=r["noise_pct"],
            onboarding_weeks=_week_range(w.get("onboarding")),
            baseline_weeks=_week_range(w.get("baseline")),
            recent_weeks=_week_range(w.get("recent")),
        )
        return out

    def get_replay(self, account_id: str) -> Dict[str, Any]:
        r = self._by_id.get(account_id)
        if r is None or r["tier"] == "ERROR" or not r.get("weekly_logins"):
            return {"error": f"unknown account_id {account_id!r}"}
        rep = replay_series(r["weekly_logins"], self._cfg)
        return {
            "account_id": account_id,
            "first_alert_week": rep["first_alert_week"],
            "first_alert_tier": rep["first_alert_tier"],
            "first_week_by_tier": rep["first_week_by_tier"],
        }

    def get_portfolio_stats(self) -> Dict[str, Any]:
        s = self._report["summary"]
        return {
            "total_accounts": s["total_accounts"],
            "flagged": s["flagged"],
            "counts_by_tier": dict(s["counts_by_tier"]),
            "annotations": [dict(a) for a in self._report["annotations"]],
        }

    # ----- dispatch -------------------------------------------------------
    def execute(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        handler = self._handlers.get(name)
        if handler is None:
            return {"error": f"unknown tool {name!r}"}
        try:
            return handler(**(args or {}))
        except TypeError:
            return {"error": f"bad arguments for {name}"}
