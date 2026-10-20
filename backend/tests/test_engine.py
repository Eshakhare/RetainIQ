"""Golden tests (seed), fixtures, boundaries, config validation and replay."""
import pytest

from retainiq.backtest import compare, replay_series
from retainiq.config import Config, ConfigError
from retainiq.loader import load_raw_accounts
from retainiq.pipeline import analyze, analyze_portfolio, score_series


def by_id(results):
    return {r["account_id"]: r for r in results}


@pytest.fixture(scope="module")
def seed():
    return by_id(analyze(load_raw_accounts("seed")))


@pytest.fixture(scope="module")
def edge():
    return by_id(analyze(load_raw_accounts("edge_cases")))


# ------------------------------------------------------------------ golden seed
@pytest.mark.parametrize("aid,tier", [
    ("A-01", "CRITICAL"), ("A-02", "HEALTHY"), ("A-03", "HEALTHY"), ("A-04", "WATCH"),
    ("A-05", "CRITICAL"), ("A-06", "TOO_NEW"), ("A-07", "HEALTHY"), ("A-08", "TOO_NEW"),
])
def test_seed_tiers(seed, aid, tier):
    assert seed[aid]["tier"] == tier


def test_seed_numbers_match_design(seed):
    assert seed["A-01"]["drop_pct"] == -61.8
    assert seed["A-05"]["drop_pct"] == -79.0
    a4 = seed["A-04"]
    assert (a4["recent_level"], a4["baseline_level"]) == (17.75, 22.5)
    assert (a4["drop_pct"], a4["last2_drop_pct"]) == (-21.1, -24.4)
    assert a4["priority_score"] == 63.3
    assert a4["windows"] == {"onboarding": [0, 1], "baseline": [2, 7], "recent": [8, 11]}
    assert a4["confidence"] == "High"


def test_seed_patterns_and_flags(seed):
    assert seed["A-01"]["pattern"] == "sudden_cliff"
    assert seed["A-05"]["pattern"] == "sudden_cliff"
    assert seed["A-04"]["pattern"] == "slow_erosion"
    assert "growing" in seed["A-03"]["flags"]
    assert "volatile" in seed["A-07"]["flags"]
    assert seed["A-02"]["flags"] == []


def test_seed_ranking_and_reasons(seed):
    ranks = {a: r["rank"] for a, r in seed.items()}
    assert ranks["A-05"] == 1 and ranks["A-01"] == 2 and ranks["A-04"] == 3
    assert all(r["reason"] and r["recommended_action"] for r in seed.values())
    assert "21% below" in seed["A-04"]["reason"] and "24% below" in seed["A-04"]["reason"]


def test_seed_no_platform_shift():
    report = analyze_portfolio(load_raw_accounts("seed"))
    assert report["annotations"] == []
    assert report["summary"]["flagged"] == 3


def test_seed_compare_verdicts():
    cmp = {c["account_id"]: c for c in compare(analyze(load_raw_accounts("seed")))}
    assert cmp["A-04"]["verdict"] == "we_catch_more" and cmp["A-04"]["starter"]["flagged"] is False
    assert cmp["A-06"]["verdict"] == "starter_false_alarm"
    assert cmp["A-08"]["verdict"] == "starter_error" and "ZeroDivisionError" in cmp["A-08"]["starter"]["error"]
    assert cmp["A-01"]["verdict"] == "agree"


# ------------------------------------------------------------------ fixtures
@pytest.mark.parametrize("name,tier", [
    ("zero_collapse", "CRITICAL"), ("transient_dip", "HEALTHY"), ("recovering", "WATCH"),
    ("low_volume", "WATCH"), ("spike", "NEEDS_REVIEW"), ("len_9", "TOO_NEW"), ("len_10", "CRITICAL"),
    ("no_baseline", "TOO_NEW"), ("long_onboarding_3", "HEALTHY"), ("long_onboarding_4", "HEALTHY"),
    ("long_onboarding_5", "HEALTHY"), ("early_collapse", "HEALTHY"),
])
def test_edge_tiers(edge, name, tier):
    assert edge[f"E-{name}"]["tier"] == tier


def test_edge_flags(edge):
    assert "recovering" in edge["E-recovering"]["flags"]
    assert "low_volume" in edge["E-low_volume"]["flags"]
    assert edge["E-no_baseline"]["reason_code"] == "NO_BASELINE"
    assert edge["E-len_10"]["confidence"] == "Medium"
    for n in ("long_onboarding_3", "long_onboarding_4", "long_onboarding_5", "early_collapse"):
        assert "early_ramp_down" in edge[f"E-{n}"]["flags"], n
    assert edge["E-long_onboarding_4"]["drop_pct"] == -4.0
    assert edge["E-long_onboarding_5"]["drop_pct"] == pytest.approx(-36.8, abs=0.1)


def test_early_ramp_not_flagged_on_real_collapse(seed):
    assert "early_ramp_down" not in seed["A-01"]["flags"]


def test_invalid_accounts_rejected_others_run(edge):
    for n in ("negative", "null", "string", "empty"):
        r = edge[f"E-invalid_{n}"]
        assert r["tier"] == "ERROR" and r["error"]["code"] and r["reason"]
    assert edge["E-zero_collapse"]["tier"] == "CRITICAL"


def test_platform_shift_annotates_and_lowers_confidence():
    report = analyze_portfolio(load_raw_accounts("platform_shift"))
    assert report["annotations"][0]["code"] == "possible_platform_cause"
    flagged = [r for r in report["results"] if r["tier"] in ("CRITICAL", "AT_RISK", "WATCH")]
    assert len(flagged) == 6  # never suppressed
    assert all("possible_platform_cause" in r["annotations"] and r["confidence"] == "Low" for r in flagged)


def test_bad_input_shapes_do_not_crash():
    raw = [None, 5, {"account_id": "X"}, {"weekly_logins": [1] * 12},
           {"account_id": "D", "weekly_logins": [1] * 12}, {"account_id": "D", "weekly_logins": [1] * 12},
           {"account_id": "F", "weekly_logins": [float("inf")] * 12},
           {"account_id": "B", "weekly_logins": [True] * 12}, {"account_id": "S", "weekly_logins": "abc"}]
    results = analyze(raw)
    assert len(results) == len(raw) - 0
    codes = sorted(r["reason_code"] for r in results if r["tier"] == "ERROR")
    assert "DUPLICATE_ID" in codes and "MISSING_LOGINS" in codes and "INVALID_RECORD" in codes


# ------------------------------------------------------------------ boundaries
def _series(recent, baseline=100.0):
    return [baseline] * 8 + [recent] * 4  # onboarding 2 + baseline 6 + recent 4


@pytest.mark.parametrize("recent,tier", [
    (70.0, "AT_RISK"),      # exactly -30%
    (70.1, "WATCH"),        # just inside -30%
    (50.0, "CRITICAL"),     # exactly -50%
    (50.1, "AT_RISK"),
    (85.0, "WATCH"),        # exactly -15%
    (85.1, "HEALTHY"),
    (200.0, "NEEDS_REVIEW"),  # exactly +100%
    (199.9, "HEALTHY"),
])
def test_threshold_boundaries(recent, tier):
    assert score_series(_series(recent), Config())["tier"] == tier


def test_noise_check_blocks_choppy_decline():
    weekly = [10, 10, 60, 20, 60, 20, 60, 20, 30, 30, 30, 30]  # baseline CV 0.5, drop -25%
    assert score_series(weekly, Config())["tier"] == "HEALTHY"


def test_min_history_boundary():
    base = [30] * 6 + [8, 6, 5, 4]
    assert score_series(base[1:], Config())["tier"] == "TOO_NEW"           # 9 weeks
    assert score_series(base, Config())["tier"] == "CRITICAL"              # 10 weeks
    assert score_series([30, 30, 30, 30, 30, 30, 8, 6, 5, 4, 4, 4], Config())["confidence"] == "High"


def test_constant_policy_change_cancels_out():
    a = [5 * x for x in [20, 22, 21, 23, 20, 21, 22, 20, 21, 23, 22, 21]]
    assert score_series(a, Config())["tier"] == "HEALTHY"


# ------------------------------------------------------------------ config
def test_config_overrides_change_result():
    raw = load_raw_accounts("seed")
    cfg = Config.from_overrides({"watch_drop": -0.30, "watch_last2": -0.30})
    assert by_id(analyze(raw, cfg))["A-04"]["tier"] == "HEALTHY"
    cfg = Config.from_overrides({"min_weeks_to_score": 9})
    assert by_id(analyze(raw, cfg))["A-05"]["tier"] == "CRITICAL"


@pytest.mark.parametrize("bad", [
    {"nope": 1}, {"at_risk_drop": 0.5}, {"at_risk_drop": "x"}, {"min_weeks_to_score": 9.5},
    {"min_weeks_to_score": 3}, {"critical_drop": -0.2}, {"recent_weeks": True},
    {"at_risk_drop": float("nan")}, "not a dict",
])
def test_config_override_validation(bad):
    with pytest.raises(ConfigError):
        Config.from_overrides(bad)


# ------------------------------------------------------------------ replay
def test_replay_matches_design():
    results = by_id(analyze(load_raw_accounts("seed")))
    a5 = replay_series(results["A-05"]["weekly_logins"], Config())
    a1 = replay_series(results["A-01"]["weekly_logins"], Config())
    assert (a5["first_alert_week"], a5["first_alert_tier"], a5["starter_first_flag_week"]) == (10, "CRITICAL", 9)
    assert (a1["first_alert_week"], a1["first_alert_tier"], a1["starter_first_flag_week"]) == (10, "AT_RISK", 10)


def test_replay_has_no_lookahead():
    weekly = by_id(analyze(load_raw_accounts("seed")))["A-05"]["weekly_logins"]
    rep = replay_series(weekly, Config())
    for point in rep["timeline"]:
        w = point["week"]
        assert point["tier"] == score_series(weekly[:w], Config())["tier"]
    # Changing future weeks must not alter the past.
    mutated = weekly[:9] + [999, 999, 999]
    rep2 = replay_series(mutated, Config())
    assert rep["timeline"][:9] == rep2["timeline"][:9]
