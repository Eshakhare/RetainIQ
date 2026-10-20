"""Template briefings built from engine facts with fixed sentences (no LLM)."""
from __future__ import annotations

from typing import Any, Dict, List

from ..config import AT_RISK, CRITICAL, FLAGGED_TIERS, NEEDS_REVIEW, WATCH

TIER_LABEL = {
    CRITICAL: "Critical", AT_RISK: "At risk", WATCH: "Watch", NEEDS_REVIEW: "Needs review",
    "HEALTHY": "Healthy", "TOO_NEW": "Too new to score", "ERROR": "Rejected input",
}
_ACTIONABLE = FLAGGED_TIERS + (NEEDS_REVIEW,)
HONEST_LIMIT = "Based on weekly login counts only, so suggested actions are general."


def _questions(r: Dict[str, Any]) -> List[str]:
    qs: List[str] = []
    if "possible_platform_cause" in r.get("annotations", []):
        qs.append("Did the account experience any system downtime, login failure, or service disruption during the drop?")
        qs.append("Has engineering or product confirmed an incident or deployment during the latest drop?")
    elif r["tier"] == NEEDS_REVIEW:
        qs.append("Was there a new rollout, new locations or a change in how logins are counted?")
    elif r["pattern"] == "sudden_cliff":
        week = r.get("cliff_week")
        when = f"around week {week}" if week else "recently"
        qs.append(f"Did anything change {when}, such as a key user leaving or an integration problem?")
        qs.append("Is the account's main contact still engaged with the product?")
    elif r["pattern"] == "slow_erosion":
        qs.append("Is the team gradually using the product less, or moving work to other tools?")
        qs.append("Are there open support issues or missing features frustrating users?")
    if "recovering" in r["flags"]:
        qs.append("What helped usage start to bounce back in the most recent weeks?")
    if "low_volume" in r["flags"]:
        qs.append("Is this a very small team, where a few logins a week is normal?")
    return qs[:3]


def _priority(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "account_id": r["account_id"],
        "tier": r["tier"],
        "why": r["reason"],
        "next_step": r["recommended_action"],
        "questions": _questions(r),
    }


def _note(report: Dict[str, Any]) -> str:
    parts = []
    if report["annotations"]:
        parts.append("Possible platform-wide cause: many accounts moved together last week; "
                     "check before contacting customers.")
    parts.append(HONEST_LIMIT)
    return " ".join(parts)


def template_briefing(report: Dict[str, Any]) -> Dict[str, Any]:
    flagged = [r for r in report["results"] if r["tier"] in _ACTIONABLE]
    counts = report["summary"]["counts_by_tier"]
    if not flagged:
        headline = "No accounts need attention this week."
    else:
        bits = [f"{counts[t]} {TIER_LABEL[t]}" for t in (CRITICAL, AT_RISK, WATCH, NEEDS_REVIEW) if counts[t]]
        headline = f"{len(flagged)} accounts need attention: " + ", ".join(bits) + "."
        if len(flagged) == 1:
            headline = headline.replace("1 accounts", "1 account")
    return {
        "headline": headline,
        "priorities": [_priority(r) for r in flagged][:10],
        "note": _note(report),
    }


def template_account_brief(report: Dict[str, Any], account_id: str) -> Dict[str, Any]:
    r = next(x for x in report["results"] if x["account_id"] == account_id)
    return {
        "headline": f"{r['account_name']}: {TIER_LABEL[r['tier']]}.",
        "priorities": [_priority(r)],
        "note": _note(report),
    }
