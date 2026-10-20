"""Feature extraction: windows, baseline, drop, last-2, noise, pattern.

Pure functions over a list of weekly login counts (oldest first). Nothing in
here reads data beyond the list it is given, so replay can pass a prefix and
there is no look-ahead.
"""
from __future__ import annotations

import statistics
from typing import Any, Dict, List, Optional

from .config import LAST_WEEKS, Config


def compute_features(weekly: List[float], cfg: Config) -> Dict[str, Any]:
    """Return a features dict.

    `scored` is False when there is not enough history (`reason_code`
    INSUFFICIENT_HISTORY) or no baseline activity (`reason_code` NO_BASELINE).
    """
    n = len(weekly)
    base: Dict[str, Any] = {"weeks_of_history": n, "scored": False, "reason_code": None, "windows": None}

    if n < cfg.min_weeks_to_score:
        base["reason_code"] = "INSUFFICIENT_HISTORY"
        return base

    recent = weekly[n - cfg.recent_weeks:]
    pool_start = min(cfg.onboarding_weeks, n - cfg.recent_weeks)
    pool = weekly[pool_start:n - cfg.recent_weeks]
    baseline_start = max(pool_start, n - cfg.recent_weeks - cfg.baseline_max_weeks)
    baseline = weekly[baseline_start:n - cfg.recent_weeks]

    windows = {
        "onboarding": [0, cfg.onboarding_weeks - 1] if cfg.onboarding_weeks > 0 else None,
        "baseline": [baseline_start, n - cfg.recent_weeks - 1],
        "recent": [n - cfg.recent_weeks, n - 1],
    }
    base["windows"] = windows

    if not pool or statistics.median(baseline) == 0:
        base["reason_code"] = "NO_BASELINE"
        return base

    recent_level = statistics.fmean(recent)
    baseline_level = float(statistics.median(baseline))
    last2_level = statistics.fmean(weekly[n - LAST_WEEKS:])
    baseline_mean = statistics.fmean(baseline)
    noise = statistics.pstdev(baseline) / baseline_mean if baseline_mean > 0 else 0.0

    drop = recent_level / baseline_level - 1
    last2 = last2_level / baseline_level - 1

    # Largest single-week fall within the lookback window (for cliff vs. erosion).
    look = weekly[max(0, n - cfg.cliff_lookback_weeks):]
    largest_fall, fall_idx = 0.0, None
    offset = max(0, n - cfg.cliff_lookback_weeks)
    for i in range(1, len(look)):
        fall = look[i - 1] - look[i]
        if fall > largest_fall:
            largest_fall, fall_idx = fall, offset + i
    cliff_week = (fall_idx + 1) if fall_idx is not None else None  # 1-based week number

    # Early weeks well above the *normal* level suggest a long onboarding that has
    # settled (or an early collapse). Informational only; never changes the tier.
    first = weekly[:cfg.early_ramp_weeks]
    early_ramp_down = (
        len(first) > 0
        and statistics.fmean(first) >= cfg.early_ramp_ratio * baseline_level
        and statistics.fmean(first) > 0
    )

    base.update(
        scored=True,
        recent_level=recent_level,
        baseline_level=baseline_level,
        last2_level=last2_level,
        drop=drop,
        last2=last2,
        noise=noise,
        meaningful=abs(round(drop, 10)) > cfg.noise_multiplier * noise,
        baseline_weeks=len(baseline),
        largest_weekly_fall=largest_fall,
        largest_fall_fraction=largest_fall / baseline_level,
        cliff_week=cliff_week,
        early_ramp_down=early_ramp_down,
    )
    return base


def pattern_for(features: Dict[str, Any], cfg: Config) -> str:
    """`sudden_cliff` or `slow_erosion` (computed by code, never by the LLM)."""
    if features["largest_fall_fraction"] >= cfg.cliff_fraction:
        return "sudden_cliff"
    return "slow_erosion"


def is_recovering(features: Dict[str, Any], cfg: Config) -> bool:
    return round(features["last2"] - features["drop"], 10) >= cfg.recovering_points


def confidence_for(features: Dict[str, Any], cfg: Config) -> str:
    weeks = features["baseline_weeks"]
    if weeks >= cfg.high_confidence_baseline_weeks:
        return "High"
    if weeks >= cfg.medium_confidence_baseline_weeks:
        return "Medium"
    return "Low"


def week_over_week_change(weekly: List[float]) -> Optional[float]:
    """Latest week vs. previous week, or None when undefined."""
    if len(weekly) < 2 or weekly[-2] <= 0:
        return None
    return weekly[-1] / weekly[-2] - 1
