"""Tier rules. First match wins; see ARCHITECTURE.md section 4."""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from .config import (AT_RISK, CRITICAL, HEALTHY, NEEDS_REVIEW, TOO_NEW, WATCH, Config)
from .features import confidence_for, is_recovering, pattern_for

_EPS = 10  # decimals; avoids float noise at exact thresholds (e.g. 14/20 - 1)


def classify(features: Dict[str, Any], cfg: Config) -> Dict[str, Any]:
    """Return `{tier, flags, pattern, confidence, reason_code}` for one account."""
    if not features["scored"]:
        return {
            "tier": TOO_NEW,
            "flags": [],
            "pattern": None,
            "confidence": None,
            "reason_code": features["reason_code"],
        }

    drop = round(features["drop"], _EPS)
    last2 = round(features["last2"], _EPS)
    meaningful = features["meaningful"]

    if drop >= cfg.needs_review_drop:
        tier = NEEDS_REVIEW
    elif drop <= cfg.critical_drop and last2 <= cfg.critical_last2:
        tier = CRITICAL
    elif drop <= cfg.at_risk_drop and last2 <= cfg.at_risk_last2 and meaningful:
        tier = AT_RISK
    elif drop <= cfg.watch_drop and last2 <= cfg.watch_last2 and meaningful:
        tier = WATCH
    else:
        tier = HEALTHY

    flags: List[str] = []
    if features["baseline_level"] < cfg.low_volume_baseline and tier in (CRITICAL, AT_RISK):
        tier = WATCH
        flags.append("low_volume")

    if drop >= cfg.growing_drop:
        flags.append("growing")
    if features["noise"] >= cfg.volatile_noise:
        flags.append("volatile")

    pattern = None
    if tier in (CRITICAL, AT_RISK, WATCH):
        pattern = pattern_for(features, cfg)
        if is_recovering(features, cfg):
            flags.append("recovering")
    if features["early_ramp_down"]:
        flags.append("early_ramp_down")

    return {
        "tier": tier,
        "flags": flags,
        "pattern": pattern,
        "confidence": confidence_for(features, cfg),
        "reason_code": None,
    }
