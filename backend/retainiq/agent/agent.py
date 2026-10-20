"""The Churn Analyst Agent.

Flow per request:
  1. Pre-fetch portfolio facts (counts, flagged list, and the target account if any).
  2. If mode is "template" or no LLM is configured, return the template output.
  3. Otherwise run a bounded tool loop (max 6 tool calls, 20 s overall, temperature 0).
  4. Validate the output against the facts the tools returned. On any failure
     (provider error, timeout, schema or number mismatch) fall back to the template.
  5. Re-attach account names (the model never sees them) and report the source.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

from ..config import Config
from .cache import DEFAULT_PATH, AgentCache, make_key
from .client import LLMClient, LLMError, get_client
from .template import template_account_brief, template_briefing
from .tools import TOOL_DECLARATIONS, AgentTools
from .validate import Facts, validate_output

PROMPT_VERSION = "v1"
MAX_TOOL_CALLS = 6
TIMEOUT_SECONDS = 20.0

SYSTEM_PROMPT = """You are an assistant to a Customer Success manager at a B2B software company.
You turn the output of a deterministic churn-risk engine into a short, prioritised, readable briefing.

Rules:
- Use ONLY the numbers and facts provided by the tools or the message. Never calculate new numbers, never estimate.
- Never change or invent a tier. Copy each tier exactly as the engine reports it (e.g. CRITICAL, AT_RISK, WATCH, NEEDS_REVIEW).
- Refer to accounts only by the account_id returned by the tools.
- List accounts in the same order as their rank. Include every CRITICAL and AT_RISK account.
- State uncertainty when present: confidence, low_volume, possible_platform_cause, early_ramp_down.
- Do not speculate about causes; suggest questions the CS rep could ask instead.
- Keep each account to 2-3 sentences. Do not include URLs. Give at most 3 questions per account.
- Only login counts are available, so keep suggested actions general and say so in `note`.
- Tools may be called to look up more detail (get_account, get_replay). Do not exceed the tool budget.

Reply with ONLY a JSON object, no markdown, in exactly this shape:
{"headline": "string", "priorities": [{"account_id": "string", "tier": "string", "why": "string", "next_step": "string", "questions": ["string"]}], "note": "string"}
"""


class AgentTimeout(Exception):
    pass


class AgentOutputRejected(Exception):
    pass


_default_cache: Optional[AgentCache] = None


def _get_default_cache() -> AgentCache:
    global _default_cache
    if _default_cache is None:
        _default_cache = AgentCache(DEFAULT_PATH)
    return _default_cache


class Agent:
    def __init__(self, report: Dict[str, Any], cfg: Config, client: Optional[LLMClient] = "auto",
                 cache: Optional[AgentCache] = None, max_tool_calls: int = MAX_TOOL_CALLS,
                 timeout: float = TIMEOUT_SECONDS):
        self.report = report
        self.cfg = cfg
        self.client = get_client() if client == "auto" else client
        self.cache = cache if cache is not None else _get_default_cache()
        self.max_tool_calls = max_tool_calls
        self.timeout = timeout
        self._names = {r["account_id"]: r["account_name"] for r in report["results"]}

    # ----- public ---------------------------------------------------------
    def briefing(self, mode: str = "auto", refresh: bool = False) -> Dict[str, Any]:
        return self._run("briefing", None, mode, refresh)

    def account_brief(self, account_id: str, mode: str = "auto", refresh: bool = False) -> Dict[str, Any]:
        if account_id not in self._names:
            raise KeyError(account_id)
        return self._run("account_brief", account_id, mode, refresh)

    # ----- core -----------------------------------------------------------
    def _run(self, kind: str, target: Optional[str], mode: str, refresh: bool) -> Dict[str, Any]:
        template = (template_briefing(self.report) if kind == "briefing"
                    else template_account_brief(self.report, target))
        if mode == "template":
            return self._finalize(template, "template", True, reason="mode=template")
        if self.client is None:
            return self._finalize(template, "template", True, reason="llm_not_configured")

        tools = AgentTools(self.report, self.cfg)
        facts = Facts(self.cfg)
        prefetched: List[Dict[str, Any]] = []
        for name, args in self._prefetch_plan(target):
            result = tools.execute(name, args)
            facts.add(name, result)
            prefetched.append({"tool": name, "args": args, "result": result})

        key = make_key(prefetched, PROMPT_VERSION, self.client.model, kind, target)
        if not refresh:
            cached = self.cache.get(key)
            if cached is not None:
                cached["cached"] = True
                return cached

        try:
            output = self._llm_loop(kind, target, prefetched, tools, facts)
            ok, problems = validate_output(output, facts, self.cfg, kind=kind, target_id=target)
            if not ok:
                raise AgentOutputRejected("; ".join(problems[:5]))
        except LLMError as exc:
            return self._finalize(template, "template", True, reason=f"llm_error: {exc}")
        except AgentTimeout:
            return self._finalize(template, "template", True, reason="llm_timeout")
        except AgentOutputRejected as exc:
            return self._finalize(template, "template", True, reason=f"validation_failed: {exc}")
        except Exception as exc:  # the demo must never fail because of the LLM
            return self._finalize(template, "template", True, reason=f"agent_error: {type(exc).__name__}")

        result = self._finalize(output, "llm", True)
        self.cache.set(key, result)
        return result

    @staticmethod
    def _prefetch_plan(target: Optional[str]):
        plan = [("get_portfolio_stats", {}), ("list_flagged", {})]
        if target:
            plan.append(("get_account", {"account_id": target}))
        return plan

    def _llm_loop(self, kind, target, prefetched, tools: AgentTools, facts: Facts) -> Dict[str, Any]:
        deadline = time.monotonic() + self.timeout
        if kind == "briefing":
            task = "Write this week's briefing for the head of Customer Success covering every flagged account."
        else:
            task = (f"Write an outreach brief for account {target}: what happened in plain language, "
                    f"a suggested next step, and 2-3 questions for the rep. The priorities list must "
                    f"contain exactly this one account.")
        messages: List[Dict[str, Any]] = [{
            "role": "user",
            "text": f"{task}\n\nFacts already retrieved (JSON):\n{json.dumps(prefetched)}",
        }]
        calls = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AgentTimeout()
            resp = self.client.generate(SYSTEM_PROMPT, messages,
                                        TOOL_DECLARATIONS if calls < self.max_tool_calls else None,
                                        timeout=remaining)
            if not resp.tool_calls:
                return self._parse_json(resp.text)
            if calls + len(resp.tool_calls) > self.max_tool_calls:
                raise AgentOutputRejected("tool call budget exceeded")
            messages.append({"role": "model", "raw": resp.raw,
                             "tool_calls": [{"name": c.name, "args": c.args} for c in resp.tool_calls]})
            for call in resp.tool_calls:
                calls += 1
                result = tools.execute(call.name, call.args if isinstance(call.args, dict) else {})
                facts.add(call.name, result)
                messages.append({"role": "tool", "name": call.name, "result": result})

    @staticmethod
    def _parse_json(text: str) -> Dict[str, Any]:
        text = (text or "").strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise AgentOutputRejected("response is not JSON")
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError as exc:
            raise AgentOutputRejected("response is not valid JSON") from exc

    def _finalize(self, output: Dict[str, Any], source: str, validated: bool,
                  reason: Optional[str] = None) -> Dict[str, Any]:
        """Attach names (re-added after validation) and provenance."""
        priorities = []
        for p in output["priorities"]:
            q = dict(p)
            q["account_name"] = self._names.get(p["account_id"], p["account_id"])
            priorities.append(q)
        return {
            "source": source,
            "validated": validated,
            "cached": False,
            "model": self.client.model if source == "llm" and self.client else None,
            "fallback_reason": reason if source == "template" and reason not in
            (None, "mode=template") else None,
            "headline": output["headline"],
            "priorities": priorities,
            "note": output.get("note", ""),
        }
