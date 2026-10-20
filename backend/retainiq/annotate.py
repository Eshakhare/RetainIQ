"""Portfolio-level annotations (platform-wide shift)."""
from __future__ import annotations

import statistics
from typing import Any, Dict, List, Optional

from .config import FLAGGED_TIERS, NEEDS_REVIEW, TOO_NEW, ERROR, Config
from .features import week_over_week_change

PLATFORM_CAUSE = "possible_platform_cause"


def detect_platform_shift(results: List[Dict[str, Any]], cfg: Config) -> Optional[Dict[str, Any]]:
    """Return a portfolio annotation if most accounts moved together last week."""
    changes = []
    for r in results:
        if r["tier"] in (TOO_NEW, ERROR) or not r.get("weekly_logins"):
            continue
        change = week_over_week_change(r["weekly_logins"])
        if change is not None:
            changes.append(change)
    if len(changes) < cfg.platform_min_accounts:
        return None
    median = statistics.median(changes)
    if abs(median) < cfg.platform_shift_threshold:
        return None
    direction = "fell" if median < 0 else "rose"
    return {
        "code": PLATFORM_CAUSE,
        "median_wow_change_pct": round(median * 100, 1),
        "accounts_considered": len(changes),
        "message": (
            f"Median weekly logins {direction} {abs(round(median * 100))}% in the latest week "
            f"across {len(changes)} accounts. Check for a platform-wide cause (outage, policy "
            f"change, holiday) before contacting customers."
        ),
    }


def apply_annotations(results: List[Dict[str, Any]], cfg: Config) -> List[Dict[str, Any]]:
    """Annotate flagged accounts in place; return the portfolio-level annotations."""
    shift = detect_platform_shift(results, cfg)
    if not shift:
        return []
    for r in results:
        if r["tier"] in FLAGGED_TIERS or r["tier"] == NEEDS_REVIEW:
            r["annotations"].append(PLATFORM_CAUSE)
            r["confidence"] = "Low"
    return [shift]
