"""Ranking: tier order, then |drop| x plan weight."""
from __future__ import annotations

from typing import Any, Dict, List

from .config import TIER_ORDER, plan_weight

_TIER_RANK = {t: i for i, t in enumerate(TIER_ORDER)}


def priority_score(drop_pct: Any, plan_tier: Any) -> float:
    if drop_pct is None:
        return 0.0
    return round(abs(drop_pct) * plan_weight(plan_tier), 1)


def rank_results(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort results and assign 1-based `rank`. Stable and deterministic."""
    ordered = sorted(
        results,
        key=lambda r: (_TIER_RANK.get(r["tier"], len(TIER_ORDER)), -r["priority_score"], r["account_id"]),
    )
    for i, r in enumerate(ordered, start=1):
        r["rank"] = i
    return ordered
