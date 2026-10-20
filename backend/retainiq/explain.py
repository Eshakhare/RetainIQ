"""Template explanations: fixed sentences built from engine numbers only."""
from __future__ import annotations

from typing import Any, Dict

from .config import (AT_RISK, CRITICAL, ERROR, HEALTHY, NEEDS_REVIEW, TOO_NEW, WATCH, Config)

ACTIONS = {
    CRITICAL: "Contact this week; senior or executive outreach.",
    AT_RISK: "Proactive outreach within days.",
    WATCH: "Light-touch check-in; re-evaluate next week.",
    NEEDS_REVIEW: "Verify whether this is a data issue, a new rollout or genuine growth.",
    HEALTHY: "No action needed.",
    TOO_NEW: "Route to onboarding, not churn prevention.",
    ERROR: "Fix the input data and re-run.",
}


def _pct(value: float) -> int:
    return abs(round(value))


def explain(r: Dict[str, Any], cfg: Config) -> Dict[str, str]:
    """Return `{reason, recommended_action}` for one AccountResult dict."""
    tier = r["tier"]
    action = ACTIONS[tier]

    if tier == ERROR:
        return {"reason": f"Input rejected: {r['error']['message']}.", "recommended_action": action}

    if tier == TOO_NEW:
        if r.get("reason_code") == "NO_BASELINE":
            reason = ("There was no meaningful activity in the baseline period, so a trend cannot "
                      "be measured yet.")
        else:
            reason = (f"Only {r['weeks_of_history']} weeks of history; at least "
                      f"{cfg.min_weeks_to_score} are needed to measure a trend.")
        return {"reason": reason, "recommended_action": action}

    drop, last2 = r["drop_pct"], r["last2_drop_pct"]
    n_recent = cfg.recent_weeks

    if tier in (CRITICAL, AT_RISK, WATCH):
        if r["recent_level"] == 0:
            reason = (f"Logins have fallen to zero over the last {n_recent} weeks, against a normal "
                      f"level of about {r['baseline_level']:g} per week.")
        else:
            reason = (f"Average weekly logins over the last {n_recent} weeks are {_pct(drop)}% below "
                      f"the account's normal level, and the last 2 weeks are {_pct(last2)}% below it.")
        if "low_volume" in r["flags"]:
            reason += " Volumes are low, so the tier is capped at Watch."
        if "recovering" in r["flags"]:
            reason += " The most recent weeks show a partial recovery."
    elif tier == NEEDS_REVIEW:
        reason = (f"Average weekly logins over the last {n_recent} weeks are {_pct(drop)}% above the "
                  f"account's normal level, more than double.")
    else:
        if drop >= 0:
            reason = f"Usage is stable or rising: {_pct(drop)}% above the account's normal level."
        else:
            reason = (f"Usage is within the account's normal range ({_pct(drop)}% below normal, "
                      f"not enough to flag).")
        if "growing" in r["flags"]:
            reason = f"Usage is growing: {_pct(drop)}% above the account's normal level."
        if "volatile" in r["flags"]:
            reason += " Weekly usage is naturally choppy."

    if "early_ramp_down" in r["flags"]:
        reason += " Note: early weeks were well above current usage (possible long onboarding)."
    if "possible_platform_cause" in r["annotations"]:
        reason += " Possible platform-wide cause: many accounts moved together last week."
        action = "Check internal platform/outage status before customer outreach; pause outreach if widespread issue."
    return {"reason": reason, "recommended_action": action}
