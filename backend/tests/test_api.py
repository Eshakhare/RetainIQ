"""API smoke tests for every endpoint, plus error contract."""
import pytest
from fastapi.testclient import TestClient

from retainiq.api.app import app

client = TestClient(app, raise_server_exceptions=False)


def test_health_config_datasets():
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["llm_available"] is False
    c = client.get("/api/config").json()
    assert c["thresholds"]["at_risk_drop"] == -0.30 and "tiers" in c["definitions"]
    ds = {d["id"]: d for d in client.get("/api/datasets").json()}
    assert ds["seed"]["accounts"] == 8 and "edge_cases" in ds


def test_cors_enabled():
    r = client.get("/api/health", headers={"Origin": "http://example.com"})
    assert r.headers["access-control-allow-origin"] == "*"


def test_analyze_default_and_shape():
    body = client.post("/api/analyze").json()
    assert body["summary"]["counts_by_tier"]["CRITICAL"] == 2 and body["summary"]["total_accounts"] == 8
    r = body["results"][0]
    for key in ("account_id", "tier", "confidence", "drop_pct", "last2_drop_pct", "noise_pct", "flags",
                "pattern", "annotations", "priority_score", "rank", "reason", "recommended_action",
                "weekly_logins", "windows", "starter"):
        assert key in r
    assert body["results"][0]["account_id"] == "A-05"


def test_analyze_what_if_and_custom_accounts():
    r = client.post("/api/analyze", json={"config_overrides": {"watch_drop": -0.30, "watch_last2": -0.30}}).json()
    assert {x["account_id"]: x["tier"] for x in r["results"]}["A-04"] == "HEALTHY"
    custom = {"accounts": [{"account_id": "X-1", "account_name": "Mine", "plan_tier": "Growth",
                            "weekly_logins": [20] * 8 + [8, 8, 8, 8]}, {"account_id": "bad", "weekly_logins": [-1]}]}
    r = client.post("/api/analyze", json=custom).json()
    tiers = {x["account_id"]: x["tier"] for x in r["results"]}
    assert tiers == {"X-1": "CRITICAL", "bad": "ERROR"}


def test_analyze_errors_use_contract():
    r = client.post("/api/analyze", json={"config_overrides": {"nope": 1}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_CONFIG"
    r = client.post("/api/analyze", json={"dataset": "nope"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "UNKNOWN_DATASET"
    r = client.post("/api/analyze", json={"accounts": "not a list"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_REQUEST"


def test_account_detail_with_replay():
    r = client.get("/api/accounts/A-05").json()
    assert r["tier"] == "CRITICAL" and r["replay"]["first_alert_week"] == 10
    assert len(r["replay"]["timeline"]) == 12
    missing = client.get("/api/accounts/A-99")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "ACCOUNT_NOT_FOUND"
    err = client.get("/api/accounts/E-invalid_empty", params={"dataset": "edge_cases"}).json()
    assert err["tier"] == "ERROR" and err["replay"] is None


def test_backtest_and_compare():
    bt = {b["account_id"]: b for b in client.get("/api/backtest").json()}
    assert bt["A-05"]["first_alert_week"] == 10 and bt["A-05"]["starter_first_flag_week"] == 9
    assert bt["A-02"]["first_alert_week"] is None
    cmp = {c["account_id"]: c["verdict"] for c in client.get("/api/compare").json()}
    assert cmp["A-04"] == "we_catch_more" and cmp["A-06"] == "starter_false_alarm" \
        and cmp["A-08"] == "starter_error"


def test_edge_case_dataset_runs_end_to_end():
    r = client.post("/api/analyze", json={"dataset": "edge_cases"}).json()
    assert r["summary"]["counts_by_tier"]["ERROR"] == 4
    assert client.get("/api/backtest", params={"dataset": "edge_cases"}).status_code == 200
    assert client.get("/api/compare", params={"dataset": "edge_cases"}).status_code == 200


def test_agent_endpoints_template_and_fallback():
    r = client.post("/api/agent/briefing", json={"mode": "template"}).json()
    assert r["source"] == "template" and r["validated"] is True and len(r["priorities"]) == 3
    r = client.post("/api/agent/briefing", json={}).json()  # auto, no key -> template
    assert r["source"] == "template" and r["fallback_reason"] == "llm_not_configured"
    r = client.post("/api/agent/accounts/A-04/brief", json={"mode": "template"}).json()
    assert r["priorities"][0]["account_id"] == "A-04" and r["priorities"][0]["account_name"] == "Harborview Inc"
    assert client.post("/api/agent/accounts/A-99/brief").status_code == 404
    bad = client.post("/api/agent/briefing", json={"mode": "chatty"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "INVALID_MODE"


def test_unknown_route_uses_error_contract():
    r = client.get("/api/nothing")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
