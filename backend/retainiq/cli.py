"""Command-line report: same engine, same output as the API.

    python -m retainiq.cli                      # seed data, ranked report
    python -m retainiq.cli --dataset edge_cases
    python -m retainiq.cli --compare --backtest
    python -m retainiq.cli --briefing           # weekly briefing (LLM if configured)
    python -m retainiq.cli --set at_risk_drop=-0.20 --json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from .agent.agent import Agent
from .backtest import backtest, compare
from .config import Config, ConfigError, FLAGGED_TIERS
from .env import load_env
from .loader import DATASETS, DatasetError, load_accounts_file, load_raw_accounts
from .pipeline import analyze_portfolio


def _parse_sets(pairs: List[str]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for p in pairs or []:
        if "=" not in p:
            raise ConfigError(f"--set expects key=value, got {p!r}")
        key, val = p.split("=", 1)
        try:
            out[key.strip()] = json.loads(val)
        except json.JSONDecodeError:
            raise ConfigError(f"--set {key}: {val!r} is not a number")
    return out


def _table(report: Dict[str, Any]) -> str:
    lines = []
    s = report["summary"]
    c = s["counts_by_tier"]
    lines.append(f"RetainIQ report  ({s['total_accounts']} accounts, {s['flagged']} flagged)")
    lines.append("  " + "  ".join(f"{t}={n}" for t, n in c.items() if n))
    for a in report["annotations"]:
        lines.append(f"  ! {a['message']}")
    lines.append("")
    header = f"{'#':>2}  {'Tier':<13}{'Account':<24}{'Plan':<11}{'Drop':>7}{'Last2':>7}  Conf"
    lines.append(header)
    lines.append("-" * len(header))
    for r in report["results"]:
        drop = "n/a" if r["drop_pct"] is None else f"{r['drop_pct']:+.0f}%"
        l2 = "n/a" if r["last2_drop_pct"] is None else f"{r['last2_drop_pct']:+.0f}%"
        lines.append(f"{r['rank']:>2}  {r['tier']:<13}{(r['account_id'] + ' ' + r['account_name'])[:23]:<24}"
                     f"{r['plan_tier']:<11}{drop:>7}{l2:>7}  {r['confidence'] or '-'}")
        if r["tier"] in FLAGGED_TIERS or r["tier"] == "NEEDS_REVIEW" or r["tier"] == "ERROR":
            lines.append(f"      why: {r['reason']}")
            lines.append(f"      do:  {r['recommended_action']}")
    return "\n".join(lines)


def main(argv: List[str] = None) -> int:
    load_env()
    p = argparse.ArgumentParser(prog="retainiq", description="Churn-risk early warning report")
    p.add_argument("--dataset", default="seed", help=f"one of {sorted(DATASETS)} or a path to a JSON file")
    p.add_argument("--set", action="append", metavar="KEY=VALUE", help="config override, repeatable")
    p.add_argument("--compare", action="store_true", help="show ours vs. the starter utility")
    p.add_argument("--backtest", action="store_true", help="show replay: first alert week per account")
    p.add_argument("--briefing", action="store_true", help="print the weekly briefing")
    p.add_argument("--mode", choices=["auto", "template"], default="auto", help="briefing mode")
    p.add_argument("--json", action="store_true", help="machine-readable output")
    args = p.parse_args(argv)

    try:
        cfg = Config.from_overrides(_parse_sets(args.set))
        raw = load_raw_accounts(args.dataset) if args.dataset in DATASETS \
            else load_accounts_file(Path(args.dataset))
        report = analyze_portfolio(raw, cfg)
    except (ConfigError, DatasetError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    extra: Dict[str, Any] = {}
    if args.compare:
        extra["compare"] = compare(report["results"])
    if args.backtest:
        extra["backtest"] = backtest(report["results"], cfg)
    if args.briefing:
        extra["briefing"] = Agent(report, cfg).briefing(mode=args.mode)

    if args.json:
        print(json.dumps({**report, **extra}, indent=2))
        return 0

    print(_table(report))
    if "compare" in extra:
        print("\nOurs vs. starter utility")
        for c in extra["compare"]:
            print(f"  {c['account_id']:<8}{c['ours']['tier']:<13}starter={c['starter']['flagged']!s:<6}"
                  f"{c['verdict']:<21}{c['note']}")
    if "backtest" in extra:
        print("\nReplay (week = weeks of history at the time)")
        for b in extra["backtest"]:
            alert_info = f"first alert: week {b['first_alert_week']} ({b['first_alert_tier']})" if b['first_alert_week'] else "no alert triggered"
            print(f"  {b['account_id']:<8}{alert_info}")
    if "briefing" in extra:
        b = extra["briefing"]
        print(f"\nWeekly briefing [{b['source']}]: {b['headline']}")
        for pr in b["priorities"]:
            print(f"  - {pr['account_id']} {pr['account_name']} ({pr['tier']}): {pr['why']}")
            print(f"      next: {pr['next_step']}")
            for q in pr["questions"]:
                print(f"      ask:  {q}")
        if b.get("note"):
            print(f"  note: {b['note']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
