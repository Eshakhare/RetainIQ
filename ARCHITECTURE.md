# RetainIQ: Architecture and System Specification

Companion to [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md). This document defines the live technical architecture, data pipeline, API contracts, AI agent integration, and verification test plan for RetainIQ.

---

## 1. System Scope & Core Principles

RetainIQ is an early-warning churn risk system designed for Customer Success teams at B2B SaaS companies. It transforms weekly account login counts into prioritized, explainable risk assessments and recommended actions.

### Core Architecture Principles:
- **Deterministic Core:** All classification, threshold evaluations, noise filtering, and rankings run through pure mathematical Python functions. The LLM never classifies an account or invents numbers.
- **Fail-Safe Operation:** Invalid records (nulls, negatives, malformed formats) are safely quarantined per account. Malformed data never crashes the portfolio run.
- **Strict Factual Validation:** Any AI-generated briefing must pass programmatic validation against engine numbers. On any validation failure, timeout, or network issue, the system instantly falls back to deterministic template text.
- **Privacy by Design:** Customer names and PII are never sent to external LLMs. The agent sees only anonymous account IDs, plan tiers, and aggregated metrics; names are safely reattached locally before presentation.

---

## 2. System Architecture Diagram

```
  ┌─────────────────────────────┐                   ┌─────────────────────────────┐
  │   data/seed_accounts.json   │                   │    data/edge_cases.json     │
  │    (8 baseline accounts)    │                   │   (12 boundary fixtures)    │
  └──────────────┬──────────────┘                   └──────────────┬──────────────┘
                 │                                                 │
                 └────────────────────────┬────────────────────────┘
                                          │
                                          ▼
┌─────────────────────── retainiq (Core Python Engine) ────────────────────────┐
│ loader/validator → features → classifier → annotator → ranker → explainer     │
│                                                                               │
│                 backtest (walk-forward simulation per week)                   │
└───────────────┬─────────────────────────┬─────────────────────────┬───────────┘
                │                         │ AccountResult objects   │ read-only tools
                │ calls engine            ▼                         ▼
                │ (same report)   ┌───────────────┐         ┌───────────────┐
                ▼                 │    FastAPI    │ briefs  │     Agent     │
        ┌───────────────┐         │    /api/*     │ ◄────── │ (Gemini/Vertex│
        │      CLI      │         │   (CORS on)   │         │ + Validator)  │
        │ (same report) │         └───────▲───────┘         └───────┬───────┘
        └───────────────┘                 │                         │ fallback on
                                          │ HTTP calls              ▼ any failure
                                  ┌───────┴───────┐         ┌───────────────┐
                                  │   React SPA   │         │   Template    │
                                  │  (Vite + TS)  │         │   Fallback    │
                                  └───────────────┘         └───────────────┘
```

---

## 3. Project Structure

```
RetainIQ/
├── SOLUTION_DESIGN.md        # Problem definition, assumptions, business trade-offs
├── ARCHITECTURE.md           # Technical architecture, algorithm spec, API contract
├── README.md                 # Setup, verification commands, and quickstart guide
├── data/
│   ├── seed_accounts.json    # Case study portfolio (8 customer accounts)
│   ├── edge_cases.json       # Valid boundary test fixtures (12 accounts)
│   └── platform_shift.json   # Coordinated platform-wide drop fixture (6 accounts)
├── backend/
│   ├── pytest.ini            # Pytest test configuration
│   ├── requirements.txt      # Python dependencies (FastAPI, uvicorn, pytest)
│   └── retainiq/
│       ├── config.py         # Engine thresholds, formulas, and plain-language definitions
│       ├── loader.py         # Dataset loading, account validation, and quarantine
│       ├── features.py       # Sliding windows, baseline median, drop %, noise (CV), pattern
│       ├── classify.py       # Deterministic tier assignment rules
│       ├── annotate.py       # Portfolio-wide shift detection and account tagging
│       ├── rank.py           # Priority ranking by tier and ARR plan weight
│       ├── explain.py        # Deterministic explanation reasons and recommended actions
│       ├── backtest.py       # Walk-forward weekly replay without lookahead bias
│       ├── pipeline.py       # End-to-end portfolio scoring orchestrator
│       ├── cli.py            # Terminal interface for batch scoring and backtesting
│       ├── env.py            # Zero-dependency .env loader
│       ├── api/              # FastAPI server routes and payload schemas
│       └── agent/            # Churn Analyst Agent, Vertex/Gemini client, tools, validator
└── ui-bundle/                # React single-page application (TypeScript + Tailwind CSS)
    ├── src/
    │   ├── App.tsx           # Main application shell and state coordination
    │   ├── types.ts          # Shared TypeScript interfaces matching backend models
    │   ├── components/       # SummaryStrip, RankedTable, Drawer, BriefingCard, Header
    │   └── utils/            # Data formatting and styling utilities
    └── dist/                 # Production-compiled static assets
```

---

## 4. Detection Engine & Algorithm Specification

### Data Preprocessing & Validation
Each account record contains `account_id`, `account_name`, `plan_tier`, and `weekly_logins[]` (oldest to newest):
1. **Validation Check:** Every login count must be a finite, non-negative number ($\ge 0$). Invalid records (nulls, negatives, non-numeric values, empty histories) are flagged as `ERROR` and quarantined. Valid accounts proceed without interruption.
2. **History Check:** An account requires at least 10 weeks of historical data to establish an accurate trend. Accounts with fewer than 10 weeks are classified as `TOO_NEW` (Too new to score) and routed to Onboarding.

### Feature Calculation
- **Onboarding Window:** First 2 weeks (`weeks[0:2]`). Excluded from baseline to avoid onboarding activity spikes distorting normal levels.
- **Recent Window:** Last 4 weeks (`weeks[n-4:n]`). `recent_level = mean(last 4 weeks)`.
- **Baseline Window:** Up to 8 weeks immediately preceding the recent window (`weeks[2:n-4]`). `baseline_level = median(baseline weeks)`. Using the median ensures a single anomalous week does not distort baseline usage.
- **Drop Percentage:** `drop_pct = (recent_level - baseline_level) / baseline_level` (expressed as negative %, where -50% means usage fell by 50%).
- **Last-2 Drop Percentage:** `last2_drop_pct = (mean(last 2 weeks) - baseline_level) / baseline_level`. Evaluates recent momentum to distinguish persistent declines from early recoveries.
- **Baseline Noise:** Coefficient of variation: $CV = \sigma_{\text{baseline}} / \mu_{\text{baseline}}$.
- **Meaningful Drop Test:** A drop is only flagged if $|\text{drop\_pct}| > 2 \times CV$. This prevents naturally volatile accounts from triggering false alarms.

### Classification Rules (First Match Wins)

| Order | Health Tier | Decision Condition | Operational Meaning |
|---|---|---|---|
| 1 | **NEEDS_REVIEW** | $\text{drop} \ge +100\%$ (usage doubled) | Unusual surge: verify new location rollout or logging change |
| 2 | **CRITICAL** | $\text{drop} \le -50\%$ and $\text{last2} \le -30\%$ | Severe drop: immediate executive outreach this week |
| 3 | **AT_RISK** | $\text{drop} \le -30\%$, $\text{last2} \le -30\%$, and meaningful | High churn risk: proactive CSM intervention within days |
| 4 | **WATCH** | $\text{drop} \le -15\%$, $\text{last2} \le -10\%$, and meaningful | Slow erosion: light-touch check-in, monitor next week |
| 5 | **HEALTHY** | All other normal patterns | Stable or growing usage; no intervention required |

### Safety Guards & Informational Flags
- **Low Volume Cap:** If `baseline_level < 5` logins/week, Critical or At Risk classifications are capped at `WATCH` with the flag `low_volume`. Small absolute changes in tiny numbers must not generate high-urgency alarms.
- **Platform-Wide Shift Detection:** If at least 5 accounts are scored and the median week-over-week change across the portfolio in the latest week is $\le -20\%$ or $\ge +20\%$:
  - Every flagged account receives annotation `possible_platform_cause` with confidence lowered to `Low`.
  - A consolidated **Platform Incident** overview is generated so Customer Success triages internal engineering/platform health before contacting individual customers.
- **Pattern Classification:** Risk accounts are diagnosed as `sudden_cliff` (single-week drop $\ge 25\%$ of baseline within the last 8 weeks) or `slow_erosion`.
- **Recovery Flag:** Tagged `recovering` if the last 2 weeks rebound by $\ge 15$ percentage points compared to the 4-week average.
- **Early Ramp-Down:** Tagged `early_ramp_down` if the first 4 weeks average $\ge 1.5\times$ baseline level (informational only; does not alter tier).

### Priority Ranking
Flagged accounts are ranked first by tier severity (`CRITICAL`, `AT_RISK`, `WATCH`, `NEEDS_REVIEW`), and second by business impact:
$$\text{Priority Score} = |\text{drop\_pct}| \times \text{Plan Weight}$$
*(Plan weights: Enterprise = 3, Growth = 2, Starter = 1).*

---

## 5. API Contract & Data Schema

All communication between the frontend and backend uses pure JSON over REST.

| Method | Endpoint | Purpose | Key Request / Response Parameters |
|---|---|---|---|
| `GET` | `/api/health` | Health check & LLM availability | Returns `{status, llm_available, version}` |
| `GET` | `/api/config` | Engine thresholds & definitions | Returns active thresholds and plain-language formulas |
| `GET` | `/api/datasets` | List available datasets | Returns `[{id, name, accounts}]` |
| `POST` | `/api/analyze` | Main portfolio analysis | Body: `{dataset?, accounts?, config_overrides?}`<br>Returns `{generated_at, summary, results, annotations}` |
| `GET` | `/api/accounts/{id}` | Single account detail & replay | Returns full `AccountResult` plus `replay` timeline |
| `GET` | `/api/backtest` | Walk-forward simulation | Returns historical alert timeline for all accounts |
| `POST` | `/api/agent/briefing` | CS Weekly Intelligence Briefing | Returns `{source, validated, headline, platform_incident?, priorities, note}` |
| `POST` | `/api/agent/accounts/{id}/brief` | Account outreach brief | Returns single-account outreach guidance and questions |

### AccountResult Schema Sample
```json
{
  "account_id": "A-01",
  "account_name": "Northwind Traders",
  "plan_tier": "Growth",
  "weeks_of_history": 12,
  "tier": "CRITICAL",
  "confidence": "High",
  "recent_level": 14.5,
  "baseline_level": 38.0,
  "drop_pct": -61.8,
  "last2_drop_pct": -75.0,
  "noise_pct": 8.2,
  "flags": [],
  "pattern": "sudden_cliff",
  "cliff_week": 10,
  "annotations": [],
  "priority_score": 123.6,
  "rank": 2,
  "reason": "Average weekly logins over the last 4 weeks are 62% below normal level, and the last 2 weeks are 75% below it.",
  "recommended_action": "Contact this week; senior or executive outreach.",
  "weekly_logins": [42, 45, 38, 37, 39, 40, 38, 36, 35, 12, 10, 9],
  "windows": {
    "onboarding": [0, 1],
    "baseline": [2, 7],
    "recent": [8, 11]
  }
}
```

---

## 6. Churn Analyst Agent Integration

The Churn Analyst Agent translates deterministic engine metrics into natural, actionable guidance for Customer Success.

### Operational Guardrails:
1. **Bounded Tool Execution:** Agent runs in a bounded loop (maximum 6 tool calls, 20-second timeout, temperature 0).
2. **Deterministic Tools:** Read-only access via `get_portfolio_stats`, `list_flagged`, `get_account`, and `get_replay`.
3. **Macro Context Availability:** `get_portfolio_stats` is always prefetched, ensuring single-account briefs know if a wider platform shift is active.
4. **Strict Output Validator:** Every LLM response is checked by code:
   - JSON structure must match the exact schema.
   - Every number mentioned in the text must exist in the retrieved engine facts.
   - Account IDs and tiers must match engine classifications exactly.
   - Any validation failure, timeout, or network issue immediately returns the deterministic template fallback.
5. **Consolidated Platform Incident Handling:** When a platform shift is detected, the agent synthesizes a unified incident briefing instructing CS to verify internal engineering health (outages, release bugs, auth glitches, tracking errors, holidays) before contacting customers.

---

## 7. Frontend User Interface Architecture

The React UI (`ui-bundle/`) is structured into focused components with zero client-side business logic:

1. **Header:** Dataset selector (Seed Portfolio, Edge-Case Fixtures, Platform Shift) and Analyze action.
2. **Executive Summary Strip:** Cards showing Flagged CS Workload and distribution across health tiers (excluding quarantined errors).
3. **Weekly Intelligence Briefing Card:** Displays the AI-synthesized briefing with verification badges. When a platform incident is active, renders a consolidated overview card grouping all affected accounts without repetitive copy.
4. **Ranked Risk Portfolio Table:** Interactive table showing priority rank, tier badge, account name, plan, 12-week sparklines with shaded windows, drop metrics, pattern tags, and reason. Includes one-click tier filtering.
5. **Account Detail Drawer:** Side drawer displaying interactive login charts, exact window bounds, walk-forward backtest replay history, and on-demand customer outreach briefs.
6. **Tabs Section:**
   - **Historical Replay:** Walk-forward backtesting simulator validating detection week and timeliness.
   - **What-If Sandbox:** Interactive sliders to test threshold changes on live customer portfolios.
   - **How It Works:** In-app documentation of engine rules, mathematical formulas, and definitions.

---

## 8. Verification & Test Plan

The suite contains **90 automated tests** across four test modules:

- **`test_engine.py`:** Tests window segmentation, median baseline calculation, coefficient of variation, tier threshold boundaries (e.g. exactly -50%, -30%, -15%), recovery checks, low volume caps, and platform shift detection.
- **`test_api.py`:** Tests all FastAPI endpoints, CORS headers, parameter overrides, error handling, and JSON serialization.
- **`test_agent.py`:** Tests tool execution, mock LLM execution, schema validation, number verification (rejection of hallucinated numbers), tier tampering prevention, and template fallback triggers.
- **`test_vertex_client.py`:** Tests live and simulated LLM client communication, request shaping, and timeout handling.

---

## 9. Security, Reliability & Privacy

- **No Data Leakage:** Customer account names and raw user identifiers are stripped before tool arguments reach the LLM. The model only processes anonymous IDs (`A-01`) and aggregated numbers.
- **Zero Hallucination Tolerance:** Factual validation guarantees the LLM cannot fabricate statistics or change customer risk tiers.
- **Graceful Error Recovery:** Missing, corrupted, or null data points are quarantined safely at the account level without failing the batch execution.
- **Guaranteed Availability:** Because deterministic templates exist for every brief, Customer Success workflows continue uninterrupted even during total LLM or cloud API outages.
