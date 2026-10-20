"""All thresholds in one place, with defaults and a one-line meaning each.

`Config.from_overrides` validates caller-supplied overrides (used by the
what-if panel) against known keys, types and sane ranges.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from typing import Any, Dict, Optional

# Tier names (strings so they serialise as-is).
CRITICAL = "CRITICAL"
AT_RISK = "AT_RISK"
WATCH = "WATCH"
NEEDS_REVIEW = "NEEDS_REVIEW"
HEALTHY = "HEALTHY"
TOO_NEW = "TOO_NEW"
ERROR = "ERROR"

#: Tiers that CS is asked to act on (a "flag").
FLAGGED_TIERS = (CRITICAL, AT_RISK, WATCH)
#: Display / ranking order.
TIER_ORDER = (CRITICAL, AT_RISK, WATCH, NEEDS_REVIEW, HEALTHY, TOO_NEW, ERROR)

#: Plan tier as a rough proxy for account value (assumption A6).
PLAN_WEIGHTS = {"starter": 1, "growth": 2, "enterprise": 3}
DEFAULT_PLAN_WEIGHT = 1

#: Number of most recent weeks used for the "last-2" persistence check.
LAST_WEEKS = 2


@dataclass(frozen=True)
class Config:
    """Engine thresholds. Drops are fractions: -0.30 means a 30% fall."""

    # --- windows -----------------------------------------------------------
    min_weeks_to_score: int = 10      # fewer weeks of history -> TOO_NEW (A4)
    onboarding_weeks: int = 2         # first N weeks excluded from baseline (A3)
    recent_weeks: int = 4             # "current level" = mean of the last N weeks
    baseline_max_weeks: int = 8       # baseline = median of up to N weeks before recent

    # --- tier thresholds ---------------------------------------------------
    critical_drop: float = -0.50      # CRITICAL: drop <= this ...
    critical_last2: float = -0.30     # ... and last-2 <= this
    at_risk_drop: float = -0.30       # AT_RISK: drop <= this ...
    at_risk_last2: float = -0.30      # ... and last-2 <= this, and meaningful
    watch_drop: float = -0.15         # WATCH: drop <= this ...
    watch_last2: float = -0.10        # ... and last-2 <= this, and meaningful
    needs_review_drop: float = 1.00   # NEEDS_REVIEW: usage grew by at least this
    noise_multiplier: float = 2.0     # change is "meaningful" if |drop| > this x noise

    # --- guards and flags --------------------------------------------------
    low_volume_baseline: float = 5.0  # baseline below this caps tier at WATCH
    growing_drop: float = 0.25        # `growing` flag at +25% or more
    volatile_noise: float = 0.20      # `volatile` flag at baseline CV >= this
    early_ramp_ratio: float = 1.5     # `early_ramp_down` if first weeks >= ratio x current
    early_ramp_weeks: int = 4         # how many first weeks are compared
    cliff_fraction: float = 0.25      # sudden cliff: one-week fall >= this x baseline
    cliff_lookback_weeks: int = 8     # ... within the last N weeks
    recovering_points: float = 0.15   # `recovering` if last-2 is this much better than drop
    high_confidence_baseline_weeks: int = 6   # High confidence at >= N baseline weeks
    medium_confidence_baseline_weeks: int = 4  # Medium at >= N, else Low

    # --- portfolio-level guard --------------------------------------------
    platform_min_accounts: int = 5    # need this many scored accounts to judge a shift
    platform_shift_threshold: float = 0.20  # median week-over-week move of +/- this

    # ---------------------------------------------------------------------
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_overrides(cls, overrides: Optional[Dict[str, Any]] = None) -> "Config":
        """Build a Config from user overrides; raises ConfigError on bad input."""
        if not overrides:
            return cls()
        if not isinstance(overrides, dict):
            raise ConfigError("config_overrides must be an object")
        known = {f.name: f for f in fields(cls)}
        clean: Dict[str, Any] = {}
        for key, value in overrides.items():
            if key not in known:
                raise ConfigError(f"unknown config key: {key!r}")
            lo, hi = _RANGES[key]
            default = getattr(cls, key)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ConfigError(f"{key} must be a number")
            if isinstance(default, int):
                if int(value) != value:
                    raise ConfigError(f"{key} must be an integer")
                value = int(value)
            else:
                value = float(value)
            if not (lo <= value <= hi) or value != value:
                raise ConfigError(f"{key} must be between {lo} and {hi}")
            clean[key] = value
        cfg = cls(**{**asdict(cls()), **clean})
        cfg._check_consistency()
        return cfg

    def _check_consistency(self) -> None:
        if not (self.critical_drop <= self.at_risk_drop <= self.watch_drop < 0):
            raise ConfigError(
                "drop thresholds must satisfy critical_drop <= at_risk_drop <= watch_drop < 0"
            )
        if self.min_weeks_to_score < self.onboarding_weeks + self.recent_weeks + 2:
            raise ConfigError(
                "min_weeks_to_score must be at least onboarding_weeks + recent_weeks + 2"
            )
        if self.recent_weeks < LAST_WEEKS:
            raise ConfigError(f"recent_weeks must be at least {LAST_WEEKS}")


class ConfigError(ValueError):
    """Raised when config overrides are invalid."""


# Allowed (min, max) per key, inclusive.
_RANGES: Dict[str, tuple] = {
    "min_weeks_to_score": (6, 52),
    "onboarding_weeks": (0, 8),
    "recent_weeks": (2, 12),
    "baseline_max_weeks": (3, 26),
    "critical_drop": (-1.0, -0.05),
    "critical_last2": (-1.0, 0.0),
    "at_risk_drop": (-1.0, -0.05),
    "at_risk_last2": (-1.0, 0.0),
    "watch_drop": (-1.0, -0.01),
    "watch_last2": (-1.0, 0.0),
    "needs_review_drop": (0.25, 10.0),
    "noise_multiplier": (0.0, 10.0),
    "low_volume_baseline": (0.0, 100.0),
    "growing_drop": (0.05, 10.0),
    "volatile_noise": (0.01, 5.0),
    "early_ramp_ratio": (1.0, 10.0),
    "early_ramp_weeks": (1, 8),
    "cliff_fraction": (0.05, 1.0),
    "cliff_lookback_weeks": (2, 26),
    "recovering_points": (0.01, 1.0),
    "high_confidence_baseline_weeks": (1, 52),
    "medium_confidence_baseline_weeks": (1, 52),
    "platform_min_accounts": (2, 1000),
    "platform_shift_threshold": (0.05, 1.0),
}


def plan_weight(plan_tier: Any) -> int:
    """Plan weight with a safe default for unknown or missing plans."""
    if isinstance(plan_tier, str):
        return PLAN_WEIGHTS.get(plan_tier.strip().lower(), DEFAULT_PLAN_WEIGHT)
    return DEFAULT_PLAN_WEIGHT


#: Plain-language definitions for the UI's "how it works" panel.
DEFINITIONS = {
    "recent_level": "Mean weekly logins over the most recent 4 weeks.",
    "baseline_level": "Median weekly logins over up to 8 weeks before the recent window, skipping onboarding.",
    "drop": "recent_level / baseline_level - 1.",
    "last2_drop": "Mean of the last 2 weeks / baseline_level - 1; shows whether a decline continues or has recovered.",
    "noise": "Coefficient of variation of the baseline window; a change must exceed 2x noise to be meaningful.",
    "tiers": {
        CRITICAL: "Decline >= 50% (last-2 decline >= 30%)",
        AT_RISK: "Decline >= 30% (last-2 decline >= 30%, meaningful)",
        WATCH: "Decline >= 15% (last-2 decline >= 10%, meaningful)",
        NEEDS_REVIEW: "Usage surge >= +100% (doubled): verify data issue or rollout",
        HEALTHY: "Stable or growing usage within normal range",
        TOO_NEW: "Fewer than 10 weeks of history, or no baseline activity",
        ERROR: "Input rejected by validation",
    },
}
