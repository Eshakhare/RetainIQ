"""analyze(accounts, config) -> ranked AccountResult dicts.

Order: validate -> features -> classify -> annotate (portfolio) -> rank -> explain.
Everything that computes a tier lives behind this module.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .annotate import apply_annotations
from .classify import classify
from .config import ERROR, FLAGGED_TIERS, NEEDS_REVIEW, TIER_ORDER, Config
from .explain import explain
from .features import compute_features
from .loader import validate_accounts
from .rank import priority_score, rank_results
from .starter_baseline import starter_assess


def _pct(x: Optional[float], digits: int = 1) -> Optional[float]:
    return None if x is None else round(x * 100, digits)


def score_series(weekly: List[float], cfg: Config) -> Dict[str, Any]:
    """Engine verdict for a bare series (used directly by replay)."""
    features = compute_features(weekly, cfg)
    verdict = classify(features, cfg)
    return {"features": features, **verdict}


def _build_result(account: Dict[str, Any], cfg: Config) -> Dict[str, Any]:
    weekly = account["weekly_logins"]
    scored = score_series(weekly, cfg)
    f = scored["features"]
    ok = f["scored"]
    drop_pct = _pct(f["drop"]) if ok else None
    return {
        "account_id": account["account_id"],
        "account_name": account["account_name"],
        "plan_tier": account["plan_tier"],
        "weeks_of_history": f["weeks_of_history"],
        "tier": scored["tier"],
        "confidence": scored["confidence"],
        "reason_code": scored["reason_code"],
        "recent_level": round(f["recent_level"], 2) if ok else None,
        "baseline_level": round(f["baseline_level"], 2) if ok else None,
        "drop_pct": drop_pct,
        "last2_drop_pct": _pct(f["last2"]) if ok else None,
        "noise_pct": _pct(f["noise"]) if ok else None,
        "flags": scored["flags"],
        "pattern": scored["pattern"],
        "cliff_week": f["cliff_week"] if ok and scored["pattern"] == "sudden_cliff" else None,
        "annotations": [],
        "priority_score": priority_score(drop_pct, account["plan_tier"])
        if scored["tier"] in FLAGGED_TIERS or scored["tier"] == NEEDS_REVIEW else 0.0,
        "rank": None,
        "reason": "",
        "recommended_action": "",
        "weekly_logins": weekly,
        "windows": _windows(f),
        "starter": starter_assess(weekly),
        "error": None,
    }


def _windows(features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    w = features.get("windows")
    if not w:
        return None
    return {k: v for k, v in w.items() if v is not None}


def _error_result(stub: Dict[str, Any]) -> Dict[str, Any]:
    weekly = stub.get("weekly_logins")
    return {
        "account_id": stub["account_id"],
        "account_name": stub["account_name"],
        "plan_tier": stub["plan_tier"],
        "weeks_of_history": len(weekly) if isinstance(weekly, list) else 0,
        "tier": ERROR,
        "confidence": None,
        "reason_code": stub["error"]["code"],
        "recent_level": None,
        "baseline_level": None,
        "drop_pct": None,
        "last2_drop_pct": None,
        "noise_pct": None,
        "flags": [],
        "pattern": None,
        "cliff_week": None,
        "annotations": [],
        "priority_score": 0.0,
        "rank": None,
        "reason": "",
        "recommended_action": "",
        "weekly_logins": weekly,
        "windows": None,
        "starter": {"trend_pct": None, "flagged": None, "error": None},
        "error": stub["error"],
    }


def analyze_portfolio(raw_accounts: Any, cfg: Optional[Config] = None) -> Dict[str, Any]:
    """Full run: results, portfolio annotations and a summary."""
    cfg = cfg or Config()
    valid, rejected = validate_accounts(raw_accounts)
    results = [_build_result(a, cfg) for a in valid] + [_error_result(s) for s in rejected]
    annotations = apply_annotations(results, cfg)
    results = rank_results(results)
    for r in results:
        r.update(explain(r, cfg))

    counts = {t: 0 for t in TIER_ORDER}
    for r in results:
        counts[r["tier"]] += 1
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "summary": {
            "total_accounts": len(results),
            "flagged": sum(counts[t] for t in FLAGGED_TIERS),
            "counts_by_tier": counts,
        },
        "results": results,
        "annotations": annotations,
    }


def analyze(raw_accounts: Any, cfg: Optional[Config] = None) -> List[Dict[str, Any]]:
    """Ranked list of AccountResult dicts."""
    return analyze_portfolio(raw_accounts, cfg)["results"]
