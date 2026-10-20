"""Replay (backtest): what would the engine and the starter have said as of each past week?

For week w only `weekly_logins[:w]` is passed on, so there is no look-ahead.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .config import FLAGGED_TIERS, Config
from .pipeline import score_series
from .starter_baseline import starter_assess


def replay_series(weekly: List[float], cfg: Config) -> Dict[str, Any]:
    timeline = []
    for week in range(1, len(weekly) + 1):
        prefix = weekly[:week]
        tier = score_series(prefix, cfg)["tier"]
        starter = starter_assess(prefix)
        timeline.append({"week": week, "tier": tier, "starter_flagged": starter["flagged"]})

    first_alert = next((t for t in timeline if t["tier"] in FLAGGED_TIERS), None)
    first_starter = next((t["week"] for t in timeline if t["starter_flagged"]), None)
    first_by_tier: Dict[str, int] = {}
    for t in timeline:
        first_by_tier.setdefault(t["tier"], t["week"])
    return {
        "timeline": timeline,
        "first_alert_week": first_alert["week"] if first_alert else None,
        "first_alert_tier": first_alert["tier"] if first_alert else None,
        "first_week_by_tier": first_by_tier,
        "starter_first_flag_week": first_starter,
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
    """Ours vs. the starter utility, side by side."""
    out = []
    for r in results:
        if r["tier"] == "ERROR":
            continue
        starter = r["starter"]
        ours_flagged = r["tier"] in FLAGGED_TIERS
        if starter["error"]:
            verdict, note = "starter_error", f"Starter utility failed: {starter['error']}."
        elif starter["flagged"] and not ours_flagged:
            verdict = "starter_false_alarm"
            note = ("Starter flags this account, RetainIQ does not (" +
                    ("too little history to judge a trend)." if r["tier"] == "TOO_NEW"
                     else "the change is not a meaningful decline).")
                    )
        elif ours_flagged and not starter["flagged"]:
            verdict, note = "we_catch_more", "RetainIQ flags a decline the starter utility misses."
        else:
            verdict, note = "agree", "Both approaches reach the same flag decision."
        out.append({
            "account_id": r["account_id"],
            "account_name": r["account_name"],
            "ours": {"tier": r["tier"], "flagged": ours_flagged, "drop_pct": r["drop_pct"],
                     "confidence": r["confidence"]},
            "starter": starter,
            "verdict": verdict,
            "note": note,
        })
    return out
