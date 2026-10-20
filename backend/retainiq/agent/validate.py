"""Validator for agent output. Runs on every LLM result; any failure -> template fallback.

Checks:
 1. JSON matches the schema.
 2. Every number in the text (after rounding) appears in the facts retrieved by tools.
 3. Every account_id referenced was returned by a tool; every tier stated equals the engine's.
 4. No instruction-like content or URLs.
Briefing-only: every Critical / At risk account is covered, in engine rank order.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple

from ..config import AT_RISK, CRITICAL, LAST_WEEKS, TIER_ORDER, Config

_ID_RE = re.compile(r"\b[A-Z]{1,3}-[A-Za-z0-9_]+\b")
_NUM_RE = re.compile(r"\d+(?:\.\d+)?")
_URL_RE = re.compile(r"https?://|www\.|\b[\w-]+\.(?:com|net|org|io|ai|co)\b|<\s*script|javascript:", re.I)
_INSTRUCTION_RE = re.compile(
    r"ignore (?:all |any )?(?:previous|prior|above)|disregard|system prompt|new instructions|"
    r"you are now|```", re.I)

MAX_PRIORITIES = 10
MAX_TEXT = 700


class Facts:
    """Everything the model was allowed to see, collected from tool results."""

    def __init__(self, cfg: Config):
        self.numbers: Set[float] = set()
        self.tier_by_id: Dict[str, str] = {}
        self.ids: Set[str] = set()
        self.rank_by_id: Dict[str, int] = {}
        self.flagged_ids_by_tier: Dict[str, List[str]] = {CRITICAL: [], AT_RISK: []}
        self.listed_flagged = False
        for c in (cfg.recent_weeks, cfg.onboarding_weeks, cfg.baseline_max_weeks,
                  cfg.min_weeks_to_score, LAST_WEEKS):
            self._add_number(c)

    def add(self, tool_name: str, result: Dict[str, Any]) -> None:
        """Register one tool result."""
        if "error" in result and len(result) == 1:
            return
        if tool_name == "list_flagged":
            self.listed_flagged = True
            for a in result.get("accounts", []):
                if a["tier"] in self.flagged_ids_by_tier:
                    self.flagged_ids_by_tier[a["tier"]].append(a["account_id"])
        self._walk(result)

    def _walk(self, node: Any) -> None:
        if isinstance(node, dict):
            if "account_id" in node and isinstance(node["account_id"], str):
                self.ids.add(node["account_id"])
                if isinstance(node.get("tier"), str):
                    self.tier_by_id[node["account_id"]] = node["tier"]
                if isinstance(node.get("rank"), int):
                    self.rank_by_id[node["account_id"]] = node["rank"]
            for v in node.values():
                self._walk(v)
        elif isinstance(node, list):
            for v in node:
                self._walk(v)
        elif isinstance(node, (int, float)) and not isinstance(node, bool):
            self._add_number(node)

    def _add_number(self, x: float) -> None:
        x = abs(float(x))
        self.numbers.update({x, round(x), float(round(x, 1)), float(int(x))})


def _texts(output: Dict[str, Any]) -> List[str]:
    out = [output.get("headline", ""), output.get("note", "")]
    for p in output.get("priorities", []):
        out += [p.get("why", ""), p.get("next_step", "")] + list(p.get("questions", []))
    return out


def check_schema(output: Any) -> List[str]:
    errs: List[str] = []
    if not isinstance(output, dict):
        return ["output is not a JSON object"]
    if not isinstance(output.get("headline"), str) or not output["headline"].strip():
        errs.append("headline missing")
    if "note" in output and not isinstance(output["note"], str):
        errs.append("note must be a string")
    pri = output.get("priorities")
    if not isinstance(pri, list):
        return errs + ["priorities must be a list"]
    if len(pri) > MAX_PRIORITIES:
        errs.append("too many priorities")
    for i, p in enumerate(pri):
        if not isinstance(p, dict):
            errs.append(f"priority {i} is not an object")
            continue
        for key in ("account_id", "tier", "why", "next_step"):
            if not isinstance(p.get(key), str) or not p[key].strip():
                errs.append(f"priority {i}: {key} missing")
        qs = p.get("questions")
        if not isinstance(qs, list) or len(qs) > 3 or not all(isinstance(q, str) for q in qs):
            errs.append(f"priority {i}: questions must be a list of at most 3 strings")
        for key in ("why", "next_step"):
            if isinstance(p.get(key), str) and len(p[key]) > MAX_TEXT:
                errs.append(f"priority {i}: {key} too long")
    return errs


def validate_output(output: Any, facts: Facts, cfg: Config, *, kind: str,
                    target_id: Optional[str] = None) -> Tuple[bool, List[str]]:
    """Return `(ok, problems)`. `kind` is "briefing" or "account_brief"."""
    errs = check_schema(output)
    if errs:
        return False, errs
    problems: List[str] = []
    priorities = output["priorities"]

    # 3. accounts and tiers
    for p in priorities:
        aid = p["account_id"]
        if aid not in facts.ids:
            problems.append(f"unknown account_id {aid!r}")
        elif p["tier"] != facts.tier_by_id.get(aid):
            problems.append(f"{aid}: tier {p['tier']!r} does not match engine tier")
        if p["tier"] not in TIER_ORDER:
            problems.append(f"invalid tier {p['tier']!r}")

    if kind == "account_brief":
        if len(priorities) != 1 or priorities[0]["account_id"] != target_id:
            problems.append("account brief must contain exactly the requested account")
    else:
        got = [p["account_id"] for p in priorities]
        for tier in (CRITICAL, AT_RISK):
            for aid in facts.flagged_ids_by_tier[tier]:
                if aid not in got:
                    problems.append(f"{aid} ({tier}) is missing from the briefing")
        ranks = [facts.rank_by_id.get(a, 10**6) for a in got]
        if ranks != sorted(ranks):
            problems.append("priorities are not in engine rank order")

    # 2, 3, 4. text checks
    known_ids = facts.ids
    for text in _texts(output):
        if len(text) > MAX_TEXT * 2:
            problems.append("text too long")
            continue
        for token in _ID_RE.findall(text):
            if token not in known_ids:
                problems.append(f"unknown account reference {token!r}")
        stripped = text
        for aid in sorted(known_ids, key=len, reverse=True):
            stripped = stripped.replace(aid, " ")
        for m in _NUM_RE.findall(stripped):
            if float(m) not in facts.numbers and round(float(m)) not in facts.numbers:
                problems.append(f"number {m} not in retrieved facts")
        if _URL_RE.search(text) or _INSTRUCTION_RE.search(text):
            problems.append("instruction-like content or URL in text")

    # de-duplicate while keeping order
    seen, uniq = set(), []
    for p in problems:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return (not uniq), uniq
