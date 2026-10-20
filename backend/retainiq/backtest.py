"""Replay (backtest): point-in-time scoring as of each past week.

For week w only `weekly_logins[:w]` is evaluated, ensuring zero look-ahead bias.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .config import FLAGGED_TIERS, Config
from .pipeline import score_series


def replay_series(weekly: List[float], cfg: Config) -> Dict[str, Any]:
    timeline = []
    for week in range(1, len(weekly) + 1):
        prefix = weekly[:week]
        tier = score_series(prefix, cfg)["tier"]
        timeline.append({"week": week, "tier": tier})

    first_alert = next((t for t in timeline if t["tier"] in FLAGGED_TIERS), None)
    first_by_tier: Dict[str, int] = {}
    for t in timeline:
        first_by_tier.setdefault(t["tier"], t["week"])
    return {
        "timeline": timeline,
        "first_alert_week": first_alert["week"] if first_alert else None,
        "first_alert_tier": first_alert["tier"] if first_alert else None,
        "first_week_by_tier": first_by_tier,
    }


def backtest(results: List[Dict[str, Any]], cfg: Config) -> List[Dict[str, Any]]:
    """Replay every valid account in an analysis result."""
    out = []
    for r in results:
        weekly = r.get("weekly_logins")
        if r["tier"] == "ERROR" or not weekly:
            continue
        rep = replay_series(weekly, cfg)
        out.append({"account_id": r["account_id"], "account_name": r["account_name"], **rep})
    return out


def compare(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deprecated: Starter utility comparison removed from RetainIQ."""
    return []
