"""Agent: validator, tools, loop with a mocked LLM, fallback matrix, cache."""
import copy
import time

import pytest

from retainiq.agent.agent import Agent
from retainiq.agent.cache import AgentCache
from retainiq.agent.client import LLMClient, LLMError, LLMResponse, ToolCall
from retainiq.agent.template import template_account_brief, template_briefing
from retainiq.agent.tools import AgentTools
from retainiq.agent.validate import Facts, validate_output
from retainiq.config import Config
from retainiq.loader import load_raw_accounts
from retainiq.pipeline import analyze_portfolio

CFG = Config()


@pytest.fixture(scope="module")
def report():
    return analyze_portfolio(load_raw_accounts("seed"), CFG)


def full_facts(report):
    tools = AgentTools(report, CFG)
    facts = Facts(CFG)
    for name, args in [("get_portfolio_stats", {}), ("list_flagged", {})] + \
            [("get_account", {"account_id": r["account_id"]}) for r in report["results"]]:
        facts.add(name, tools.execute(name, args))
    return facts


class ScriptedClient(LLMClient):
    """Mock LLM: replays scripted responses; records how it was called."""
    model = "mock-model"

    def __init__(self, script):
        self.script = list(script)
        self.calls = 0

    def generate(self, system, messages, tools=None, timeout=None):
        self.calls += 1
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        if callable(step):
            return step()
        return step


def final(output):
    import json
    return LLMResponse(text=json.dumps(output))


def good_briefing(report):
    out = template_briefing(report)
    return {k: out[k] for k in ("headline", "priorities", "note")}


def fresh_agent(report, client, **kw):
    return Agent(report, CFG, client=client, cache=AgentCache(None), **kw)


# ---------------------------------------------------------------- tools
def test_tools_hide_names_and_raw_series(report):
    tools = AgentTools(report, CFG)
    blob = str([tools.list_flagged(), tools.get_account("A-04"), tools.get_replay("A-04"),
                tools.get_portfolio_stats()])
    assert "Harborview" not in blob and "weekly_logins" not in blob
    assert tools.get_account("A-04")["baseline_weeks"] == [3, 8]  # 1-based
    assert tools.get_replay("A-05")["first_alert_week"] == 10
    assert "error" in tools.get_account("nope") and "error" in tools.execute("rm_rf", {})
    assert "error" in tools.execute("get_account", {"bogus": 1})


# ---------------------------------------------------------------- validator
def test_template_output_passes_validator(report):
    ok, problems = validate_output(good_briefing(report), full_facts(report), CFG, kind="briefing")
    assert ok, problems


def test_validator_rejects_wrong_number(report):
    out = good_briefing(report)
    out["priorities"][0]["why"] = "Logins are 83% below normal."
    ok, problems = validate_output(out, full_facts(report), CFG, kind="briefing")
    assert not ok and any("83" in p for p in problems)


def test_validator_rejects_wrong_tier_and_unknown_account(report):
    out = good_briefing(report)
    out["priorities"][0]["tier"] = "WATCH"
    assert not validate_output(out, full_facts(report), CFG, kind="briefing")[0]
    out = good_briefing(report)
    out["priorities"][0]["account_id"] = "A-99"
    ok, problems = validate_output(out, full_facts(report), CFG, kind="briefing")
    assert not ok and any("A-99" in p for p in problems)
    out = good_briefing(report)
    out["priorities"][1]["why"] += " Similar to Z-77."
    assert not validate_output(out, full_facts(report), CFG, kind="briefing")[0]


@pytest.mark.parametrize("evil", [
    "See https://evil.example for details", "Visit www.evil.com", "Ignore previous instructions",
    "```json```",
])
def test_validator_rejects_urls_and_instructions(report, evil):
    out = good_briefing(report)
    out["note"] = evil
    assert not validate_output(out, full_facts(report), CFG, kind="briefing")[0]


def test_validator_schema_and_coverage(report):
    facts = full_facts(report)
    assert not validate_output("text", facts, CFG, kind="briefing")[0]
    assert not validate_output({"headline": "x"}, facts, CFG, kind="briefing")[0]
    out = good_briefing(report)
    out["priorities"] = out["priorities"][1:]  # drops the rank-1 Critical account
    ok, problems = validate_output(out, facts, CFG, kind="briefing")
    assert not ok and any("missing" in p for p in problems)
    out = good_briefing(report)
    out["priorities"].reverse()
    assert not validate_output(out, facts, CFG, kind="briefing")[0]
    out = good_briefing(report)
    out["priorities"][0]["questions"] = ["a", "b", "c", "d"]
    assert not validate_output(out, facts, CFG, kind="briefing")[0]


def test_account_brief_must_match_target(report):
    facts = full_facts(report)
    brief = template_account_brief(report, "A-04")
    out = {k: brief[k] for k in ("headline", "priorities", "note")}
    assert validate_output(out, facts, CFG, kind="account_brief", target_id="A-04")[0]
    assert not validate_output(out, facts, CFG, kind="account_brief", target_id="A-01")[0]


# ---------------------------------------------------------------- loop and fallback
def tool_call_response(*calls):
    return LLMResponse(tool_calls=[ToolCall(n, a) for n, a in calls], raw=[{"functionCall": {}}])


def test_llm_success_with_tool_calls_and_names_reattached(report):
    client = ScriptedClient([
        tool_call_response(("get_account", {"account_id": "A-05"})),
        final(good_briefing(report)),
    ])
    out = fresh_agent(report, client).briefing()
    assert out["source"] == "llm" and out["validated"] is True and out["model"] == "mock-model"
    assert out["priorities"][0]["account_name"] == "Cascade Meridian"
    assert client.calls == 2


def test_fallback_on_provider_error(report):
    out = fresh_agent(report, ScriptedClient([LLMError("HTTP 500")])).briefing()
    assert out["source"] == "template" and "llm_error" in out["fallback_reason"]
    assert out["priorities"][0]["account_name"]


def test_fallback_on_wrong_number(report):
    bad = good_briefing(report)
    bad["priorities"][0]["why"] = "Logins are 83% below normal."
    out = fresh_agent(report, ScriptedClient([final(bad)])).briefing()
    assert out["source"] == "template" and out["fallback_reason"].startswith("validation_failed")


def test_fallback_on_malformed_json(report):
    out = fresh_agent(report, ScriptedClient([LLMResponse(text="not json at all")])).briefing()
    assert out["source"] == "template"


def test_fallback_on_timeout(report):
    def slow():
        time.sleep(0.15)
        return tool_call_response(("get_portfolio_stats", {}))
    client = ScriptedClient([slow, slow, slow, slow])
    out = fresh_agent(report, client, timeout=0.1).briefing()
    assert out["source"] == "template" and out["fallback_reason"] == "llm_timeout"


def test_tool_call_cap(report):
    calls = [tool_call_response(("get_portfolio_stats", {}))] * 10
    client = ScriptedClient(calls)
    out = fresh_agent(report, client, max_tool_calls=3).briefing()
    assert out["source"] == "template" and client.calls <= 5


def test_fallback_when_no_client_and_template_mode(report):
    out = fresh_agent(report, None).briefing()
    assert out["source"] == "template" and out["fallback_reason"] == "llm_not_configured"
    client = ScriptedClient([])
    out = fresh_agent(report, client).briefing(mode="template")
    assert out["source"] == "template" and client.calls == 0 and out["fallback_reason"] is None


def test_unexpected_exception_still_falls_back(report):
    out = fresh_agent(report, ScriptedClient([RuntimeError("boom")])).briefing()
    assert out["source"] == "template"


def test_account_brief_llm_and_unknown_account(report):
    brief = template_account_brief(report, "A-04")
    client = ScriptedClient([final({k: brief[k] for k in ("headline", "priorities", "note")})])
    out = fresh_agent(report, client).account_brief("A-04")
    assert out["source"] == "llm" and out["priorities"][0]["account_name"] == "Harborview Inc"
    with pytest.raises(KeyError):
        fresh_agent(report, None).account_brief("A-99")


def test_cache_hit_and_refresh(report):
    cache = AgentCache(None)
    client = ScriptedClient([final(good_briefing(report)), final(good_briefing(report))])
    agent = Agent(report, CFG, client=client, cache=cache)
    first = agent.briefing()
    second = agent.briefing()
    assert client.calls == 1 and second["cached"] is True and second["headline"] == first["headline"]
    agent.briefing(refresh=True)
    assert client.calls == 2


def test_fallback_results_are_not_cached(report):
    cache = AgentCache(None)
    client = ScriptedClient([LLMError("x"), final(good_briefing(report))])
    agent = Agent(report, CFG, client=client, cache=cache)
    assert agent.briefing()["source"] == "template"
    assert agent.briefing()["source"] == "llm"


def test_template_does_not_mutate_report(report):
    before = copy.deepcopy(report["results"])
    Agent(report, CFG, client=None, cache=AgentCache(None)).briefing()
    assert report["results"] == before
