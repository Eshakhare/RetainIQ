# RetainIQ: Architecture and Build Spec (v1)

Companion to [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md). That document says *what and why*; this one says *how*. Written before implementation, so anything marked "expected" is design intent to be confirmed by tests.

## 1. v1 scope

**In:** deterministic scoring engine; tiers, ranking and plain-language reasons; replay (backtest); side-by-side comparison with the provided starter utility; edge-case fixtures; the AI agent (briefing and outreach briefs) with a template fallback; REST API; CLI; a single-page UI, built separately, that only calls the API; tests; README.

**Out (phase 2):** synthetic 100x52 portfolio tab, enrichment signals (users, events, renewals), peer cohorts, EWMA/CUSUM, feedback loop, scheduled delivery, any trained model.

## 2. System context

```
  ┌─────────────────────────────┐                   ┌─────────────────────────────┐
  │   data/seed_accounts.json   │                   │    data/edge_cases.json     │
  │         (untouched)         │                   │         (fixtures)          │
  └──────────────┬──────────────┘                   └──────────────┬──────────────┘
                 │                                                 │
                 └────────────────────────┬────────────────────────┘
                                          │
                                          ▼
┌─────────────────────── retainiq (Python package, no web deps) ───────────────────────┐
│ loader/validator → features → classifier → annotator → ranker → explainer (template) │
│                                                                                       │
│        backtest (replay as-of each week)     │     starter_baseline (comparison)      │
└───────────────┬─────────────────────────┬─────────────────────────┬──────────────────┘
                │                         │ AccountResult objects   │ read-only tools
                │ calls engine            ▼                         ▼
                │ (same report)   ┌───────────────┐         ┌───────────────┐
                ▼                 │    FastAPI    │ briefs  │     Agent     │
        ┌───────────────┐         │    /api/*     │ ◄────── │  LLM adapter  │
        │      CLI      │         │   (CORS on)   │         │  + validator  │
        │ (same report) │         └───────▲───────┘         └───────┬───────┘
        └───────────────┘                 │                         │ fallback on
                                          │ HTTP calls              ▼ any failure
                                  ┌───────┴───────┐         ┌───────────────┐
                                  │   React SPA   │         │   Template    │
                                  │  (React app)  │         │   Fallback    │
                                  └───────────────┘         └───────────────┘
```

**Principle:** the engine is pure functions on plain data. The API, CLI, agent and tests all call it; nothing else computes a tier.

## 3. Repository layout

```
retainiq/
  README.md  SOLUTION_DESIGN.md  ARCHITECTURE.md  requirements.txt
  data/        seed_accounts.json (never edited)   edge_cases.json
  retainiq/
    config.py          # all thresholds, with defaults and a docstring each
    loader.py          # load + validate; per-account errors, never a crash
    features.py        # windows, baseline, drop, last2, noise, pattern
    classify.py        # tier rules
    annotate.py        # platform-shift, low_volume, growing, volatile flags
    rank.py            # tier order, then |drop| x plan weight
    explain.py         # template reason + recommended action
    backtest.py        # replay as-of each week
    starter_baseline.py# provided utility, unchanged, wrapped to catch its errors
    pipeline.py        # analyze(accounts, config) -> list[AccountResult]
    cli.py
    agent/  client.py  tools.py  agent.py  validate.py  cache.py
    api/    app.py
  tests/
```

## 4. Algorithm spec

Input per account: `account_id, account_name, plan_tier, weekly_logins[]` (oldest first).

```
validate:  list of numbers, each >= 0 and finite; else account -> status ERROR with reason, others continue
n = len(weekly_logins)
if n < min_weeks_to_score (10):            tier = TOO_NEW
recent   = last 4 weeks            -> recent_level   = mean(recent)
pool     = weeks[onboarding_weeks(2) : n-4]
baseline = last up-to-8 of pool    -> baseline_level = median(baseline)
if baseline_level == 0:                    tier = TOO_NEW (reason NO_BASELINE)
drop  = recent_level / baseline_level - 1
last2 = mean(last 2 weeks) / baseline_level - 1
noise = pstdev(baseline) / mean(baseline)        # coefficient of variation
meaningful = |drop| > noise_multiplier(2) * noise
```

**Tier rules, first match wins:**

| Order | Tier | Condition |
|---|---|---|
| 1 | NEEDS_REVIEW | drop ≥ +1.00 |
| 2 | CRITICAL | drop ≤ -0.50 and last2 ≤ -0.30 |
| 3 | AT_RISK | drop ≤ -0.30 and last2 ≤ -0.30 and meaningful |
| 4 | WATCH | drop ≤ -0.15 and last2 ≤ -0.10 and meaningful |
| 5 | HEALTHY | otherwise |

Then: if `baseline_level < 5` and tier is CRITICAL or AT_RISK, cap at WATCH and add flag `low_volume`.

**Flags and pattern (informational):**
- `growing`: drop ≥ +0.25. `volatile`: noise ≥ 0.20.
- `early_ramp_down`: mean of the first 4 weeks is ≥ 1.5x the baseline level (implementation note: compared with the baseline rather than the current level, so a genuine collapse such as A-01 is not mislabelled as a long onboarding). Informational only; never changes the tier. Scored accounts only.
- Pattern, only for risk tiers: `sudden_cliff` if the largest single-week fall in the last 8 weeks is ≥ 25% of baseline; else `slow_erosion`; add `recovering` if last2 minus drop is ≥ +15 points.
- Confidence: High if baseline has ≥ 6 weeks (n ≥ 12), Medium if 4-5.
- Platform shift (portfolio level): if at least 5 accounts are scored and the median week-over-week change in the latest week is ≤ -20% or ≥ +20%, attach annotation `possible_platform_cause` to every flagged account and set confidence to Low. Flags are never suppressed.

**Ranking:** tier order CRITICAL, AT_RISK, WATCH, NEEDS_REVIEW, then others; within a tier, `|drop| x plan_weight` descending (Starter 1, Growth 2, Enterprise 3, unknown plan 1).

**Prototype results on the seed, as-of week 12:** A-01 Critical (-61.8%), A-05 Critical (-79.0%), A-04 Watch (-21.1%), A-02/A-03/A-07 Healthy, A-06/A-08 Too new. Replay: A-01 first At risk at week 10, A-05 first Critical at week 10. The starter utility flags A-05 at week 9 and A-01 at week 10, and crashes on A-08 (empty "previous" window).

## 5. Data contracts

**AccountResult** (what every endpoint returns per account):

```json
{
  "account_id": "A-04", "account_name": "Harborview Inc", "plan_tier": "Enterprise",
  "weeks_of_history": 12, "tier": "WATCH", "confidence": "High",
  "recent_level": 17.75, "baseline_level": 22.5, "drop_pct": -21.1, "last2_drop_pct": -24.4,
  "noise_pct": 7.6, "flags": [], "pattern": "slow_erosion", "annotations": [],
  "priority_score": 63.3, "rank": 3,
  "reason": "Average weekly logins over the last 4 weeks are 21% below the account's normal level, and the last 2 weeks are 24% below it.",
  "recommended_action": "Light-touch check-in; re-evaluate next week.",
  "weekly_logins": [24,23,25,24,22,23,21,20,19,18,17,17],
  "windows": {"onboarding": [0,1], "baseline": [2,7], "recent": [8,11]},
  "starter": {"trend_pct": -17.4, "flagged": false, "error": null}
}
```

Windows are zero-based inclusive index ranges so the UI can shade them on a sparkline. Errors use `{"error": {"code": "...", "message": "..."}}` with an HTTP status.

## 6. API contract (for the UI)

All JSON. CORS enabled for any origin in dev. `dataset` is `seed` (default) or `edge_cases`.

| Method and path | Purpose | Body or query | Returns |
|---|---|---|---|
| GET `/api/health` | Liveness, LLM availability | n/a | `{status, llm_available}` |
| GET `/api/config` | Thresholds and definitions, for the "how it works" panel | n/a | config object |
| GET `/api/datasets` | Available datasets | n/a | `[{id, name, accounts}]` |
| POST `/api/analyze` | Run the engine; the main "Analyze" button | `{dataset?, accounts?, config_overrides?}` | `{generated_at, summary:{counts_by_tier}, results:[AccountResult], annotations}` |
| GET `/api/accounts/{id}` | One account with full detail | `?dataset=` | AccountResult plus `replay` timeline |
| GET `/api/backtest` | Replay: tier at each past week, first alert week, versus starter | `?dataset=` | `[{account_id, timeline:[{week, tier, starter_flagged}], first_alert_week, starter_first_flag_week}]` |
| GET `/api/compare` | Ours vs. starter utility, side by side | `?dataset=` | `[{account_id, ours, starter, verdict}]`, verdict is `agree`, `we_catch_more`, `starter_false_alarm` or `starter_error` |
| POST `/api/agent/briefing` | Weekly briefing for Dana | `{dataset?, mode?: "auto"\|"template"}` | `{source:"llm"\|"template", validated:bool, headline, priorities:[{account_id, tier, why, next_step, questions[]}], note}` |
| POST `/api/agent/accounts/{id}/brief` | Outreach brief for one account | `{dataset?, mode?}` | same shape, one priority |

`POST /api/analyze` with `accounts` (the same shape as the seed) and `config_overrides` (e.g. `{"at_risk_drop": -0.20}`) powers the **what-if panel**, because the live session will include "what if..." questions. Overrides are validated against known keys and sane ranges.

## 7. AI agent design

**Purpose:** turn engine output into prioritised, readable action. It never classifies and never calculates.

**Loop:** a hard cap of 6 tool calls per request, 20 s overall timeout, temperature 0.

**Tools (read-only, deterministic wrappers over the pipeline):**
- `list_flagged(dataset)`: ranked accounts in CRITICAL, AT_RISK, WATCH, NEEDS_REVIEW with their key stats
- `get_account(account_id)`: features, pattern, flags, windows
- `get_replay(account_id)`: when each tier first appeared
- `get_portfolio_stats()`: counts by tier, platform-shift annotation

**Output schema:** as in the briefing endpoint. The model must return JSON that matches it.

**Validator (runs on every output):**
1. JSON parses and matches the schema.
2. Every number in the text, after rounding, appears in the set of facts retrieved by tools.
3. Every `account_id` referenced was returned by a tool; every tier stated equals the engine's tier.
4. No instruction-like content or URLs in the text.

Failure at any step returns the template output with `source:"template"`.

**Fallback matrix:** no API key, provider error, timeout, schema or number mismatch all lead to the template briefing, which is built from the same facts with fixed sentences. The UI shows the source badge, so nobody mistakes template text for AI text.

**Provider adapter:** `LLMClient.generate(system, messages, tools)`, configured by environment variables (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`). No provider or model is hard-coded; one adapter is implemented in v1.

**Privacy:** the model sees account IDs, plan tier and aggregate statistics only; names are re-attached after validation.

**Caching:** results keyed by a hash of (facts, prompt version, model) so the demo is repeatable and cheap; a `refresh` flag bypasses the cache.

**Prompt principles:** role is "assistant to a CS manager"; use only the numbers provided; state uncertainty (confidence, low volume, platform cause) when present; do not speculate about causes, only suggest questions to ask; keep each account to 2-3 sentences.

## 8. Test plan

**Golden tests on the seed (expected as-of week 12):**

| Account | Expected tier | Also asserts |
|---|---|---|
| A-01 | CRITICAL | pattern `sudden_cliff` |
| A-02 | HEALTHY | |
| A-03 | HEALTHY | flag `growing` |
| A-04 | WATCH | pattern `slow_erosion`; starter does not flag |
| A-05 | CRITICAL | pattern `sudden_cliff` |
| A-06 | TOO_NEW | starter false alarm captured in `/api/compare` |
| A-07 | HEALTHY | flag `volatile` |
| A-08 | TOO_NEW | starter error captured, not raised |

**Fixtures in `edge_cases.json` (expected from the prototype):**

| Fixture | Series | Expected |
|---|---|---|
| zero_collapse | 30,31,29,30,32,30,28,31,12,3,0,0 | CRITICAL |
| transient_dip | 20,21,19,22,20,21,20,21,20,8,19,21 | HEALTHY |
| recovering | 30,29,31,30,28,30,29,30,15,12,25,28 | WATCH, `recovering` |
| low_volume | 2,3,1,2,3,2,2,3,1,0,0,1 | WATCH, `low_volume` |
| spike | 10,11,9,10,10,11,10,9,25,28,30,31 | NEEDS_REVIEW |
| len_9 / len_10 | decline series of 9 and 10 weeks | TOO_NEW / CRITICAL |
| no_baseline | 0 x 10 weeks, then 5,6 | TOO_NEW (NO_BASELINE) |
| long_onboarding_3 | 40,35,30,12,11,13,12,12,11,13,12,12 | HEALTHY (baseline 12, change 0%), `early_ramp_down` |
| long_onboarding_4 | 40,35,30,28,12,11,13,12,12,11,13,12 | HEALTHY (change -4%), `early_ramp_down` |
| long_onboarding_5 | 40,35,30,28,25,12,11,13,12,12,11,13 | HEALTHY only because the noise check blocks it (change -37% against a baseline noise of 40%); documented limit |
| early_collapse | 40,40,40,5,5,5,5,5,5,5,5,5 | HEALTHY (known miss: looks like a settled account), `early_ramp_down`; phase 2 peer comparison addresses it |
| invalid | negative, null, string, empty list | per-account error, others still analysed |
| platform_shift | 6 accounts all falling 40% in the final week | annotation `possible_platform_cause`, confidence Low |

**Other tests:** threshold boundaries (exactly -30%, -15%, -50%); config override validation; agent validator rejects a wrong number, wrong tier, unknown account ID; agent falls back when the LLM client is mocked to fail or time out; API smoke tests for every endpoint; replay never reads future weeks (no look-ahead).

## 9. UI notes (React single page)

The UI holds no business logic: it renders what the API returns.

- **Header:** dataset selector, "Analyze" button, source badge for AI content.
- **Ranked table:** tier badge, account, plan, sparkline with shaded onboarding, baseline and recent windows, drop %, confidence, flags, reason.
- **Row detail:** full-size chart, the numbers behind the tier, recommended action, "Generate outreach brief" button (`/api/agent/accounts/{id}/brief`).
- **Weekly briefing card:** button calling `/api/agent/briefing`, with an AI or template badge.
- **Compare view:** ours vs. starter, from `/api/compare`, highlighting A-04 (missed), A-06 (false alarm), A-08 (crash).
- **Replay view:** timeline from `/api/backtest`.
- **What-if panel:** edit an account's weekly numbers or a threshold, re-run `/api/analyze`.
- Loading, empty and error states for each call; the API base URL is one constant.

**Connectivity:** the UI runs locally and calls the local API (CORS is open in dev), so there is no mixed-content or private-network issue. If the UI is ever hosted elsewhere, tunnel the API with a public HTTPS URL or deploy it to a small cloud service. The CLI produces the same report as the fallback.

## 10. Security and privacy

Read-only data; no customer content leaves the process except aggregate stats to the LLM; API keys only from environment variables; config overrides validated; no auth in v1 (local demo), noted as a production gap.

## 11. Risks

| Risk | Mitigation |
|---|---|
| LLM output contains a wrong number | Validator plus template fallback |
| LLM or network unavailable at the demo | Template mode, cached results, CLI |
| Thresholds challenged | Config file, what-if panel, replay results, stated reasoning |
| Starter utility seen as "wrong" | Compare it as a baseline and say what it does well; it is a starting point |
| Scope creep | Time-box below; anything not in section 1 is phase 2 |

## 12. Build order and time-box (about 4 hours)

| Step | Output | Done when | Time |
|---|---|---|---|
| 1 | Config, loader, features, classifier, ranker, template reasons | Golden seed tests pass | 1.25 h |
| 2 | Fixtures, annotations, boundary tests | Fixture table passes | 0.5 h |
| 3 | Replay and starter comparison | `/compare` shows A-04, A-06, A-08 correctly | 0.5 h |
| 4 | FastAPI endpoints and CLI | All endpoints smoke-tested | 0.5 h |
| 5 | Agent: tools, validator, adapter, fallback | Validator tests pass with mocked LLM | 0.75 h |
| 6 | README, final SOLUTION_DESIGN update to match the code | Docs match behaviour | 0.5 h |
| 7 | UI against the finished API | Demo walkthrough runs end to end | separate |

If the clock passes 4-5 hours, stop and move the remainder to the README's "next steps".

## 13. Open decisions

1. LLM provider and model for the agent: decided, Gemini 2.5 Flash-Lite on Vertex AI (service account); the adapter keeps other providers possible.
2. Minimum history: 10 weeks (fewer false alarms) or 9 (flags A-05 as early as the starter utility does, on a thinner baseline).
3. Whether the agent also gets a free-text "ask about the portfolio" box in v1, or only the two fixed outputs (recommended: fixed outputs only).
