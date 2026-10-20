# RetainIQ: Churn-Risk Early Warning for Vantage Retail Systems

**Status:** Production Design & Specification. Implementation details, API contract, and verification test plan are in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Problem, in our words

Vantage's Customer Success (CS) team learns about churn when the customer says so, which is too late to act. Dana wants a weekly list of accounts whose usage is falling, early enough for a CS rep to intervene. She has one signal (weekly login counts per account) and no definition of "at risk".

So the real task has three parts: (1) define "at risk" precisely enough to be tested and defended, (2) produce a ranked, explained list a CS team can act on each week, and (3) be honest about what login counts alone can and cannot tell us.

**Success looks like:** the right accounts flagged, few false alarms, no crashes on awkward data, and every flag explained in plain language with a suggested next step.

## 2. Assumptions

| # | Assumption | Why | Confirm with Dana |
|---|---|---|---|
| A1 | Each list is oldest to newest, one value per complete calendar week, last value is the latest complete week | The data has no dates | Yes: add `week_start` dates in v2 |
| A2 | A "login" is a session start per account, not distinct users | Not specified | What counts: SSO, API, shared kiosk devices? Session timeout policy and any recent change? (timeouts inflate or deflate counts) |
| A3 | The first 2 weeks of an account are onboarding and are excluded from its baseline | A-06 shows a week-1 spike (40) that settles at ~12 | Typical onboarding length |
| A4 | An account needs 10 weeks of history to be scored (2 onboarding, 4 recent, at least 4 baseline) | A trend from fewer weeks is mostly noise | Accept a slower first flag vs. more false alarms? |
| A5 | Each account is compared with its own history, not with other accounts | Account sizes and habits differ widely | n/a |
| A6 | Plan tier (Starter, Growth, Enterprise) is a rough proxy for account value, weights 1, 2, 3 | It is the only value signal in the data | Real ARR and renewal dates (v2 replaces the proxy) |
| A7 | CS can review roughly 3-5 flagged accounts per week | Keeps the "Critical" and "At risk" tiers small | Real CS capacity |
| A8 | Retail seasonality (e.g. Q4) is not modelled | 12 weeks cannot reveal a yearly cycle | Needs 52+ weeks |

## 3. Proposed definition of "at risk"

An account's **recent level** is the mean of its last 4 weeks. Its **normal level** (baseline) is the median of the up-to-8 weeks before that, skipping onboarding (first 2 weeks). The median prevents an anomalous week from distorting the baseline.

- **Drop percentage:** `(recent_level - baseline_level) / baseline_level` (expressed as a negative percentage where -50% means usage fell by 50%).
- **Last-2 drop percentage:** `(last2_level - baseline_level) / baseline_level`, evaluated over the most recent 2 weeks to distinguish continuing declines from early recoveries.
- **Noise:** Coefficient of variation ($CV = \sigma / \mu$) over the baseline period; a drop is considered meaningful only if the decline exceeds twice the account's baseline noise level ($2 \times CV$).

| Tier | Rule | What CS does |
|---|---|---|
| **Critical** | Usage decline $\ge 50\%$ (drop $\le -50\%$) and last-2 decline $\ge 30\%$ (last2 $\le -30\%$) | Contact this week; senior or executive outreach |
| **At risk** | Usage decline $\ge 30\%$ (drop $\le -30\%$), last-2 decline $\ge 30\%$, and meaningful decline | Proactive outreach within days |
| **Watch** | Usage decline $\ge 15\%$ (drop $\le -15\%$), last-2 decline $\ge 10\%$, and meaningful decline | Light-touch check-in; re-evaluate next week |
| **Needs review** | Usage surge $\ge +100\%$ (usage doubled) | Verify: data issue, new rollout, or genuine expansion |
| **Healthy** | Normal variation or growth (tagged `growing` if $+25\%$ or more, `volatile` if noise $\ge 20\%$) | No action needed |
| **Too new to score** | Under 10 weeks of history, or zero baseline activity | Route to onboarding, not churn prevention |

**Guards:**
- **Low volume:** a baseline under 5 logins a week is capped at Watch (`low_volume`), because percentages on tiny numbers are unreliable.
- **Platform-wide shift:** if at least 5 accounts are scored and the median week-over-week change in the latest week across the portfolio is $\le -20\%$ or $\ge +20\%$, flags are annotated `possible_platform_cause` and confidence is lowered to `Low`. The system synthesizes a consolidated Platform Incident briefing, instructing CS to investigate internal platform health (outages, release bugs, auth glitches, tracking errors, holidays) before contacting customers.
- **Confidence:** High at 12 or more weeks of history, Medium at 10-11 weeks, Low if a platform-wide anomaly is detected.
- **Noise check:** a change only counts if it is larger than twice the account's own normal week-to-week variation ($2 \times CV$).
- **Recovery check:** the last-2-weeks test stops a dip that has already bounced back from raising an alert (tagged `recovering`).
- **Early ramp-down note:** if an account's first weeks were well above its normal (baseline) level, we add an informational `early_ramp_down` tag. It never changes the tier.

**Why these numbers:**
- **4-week recent level:** about one month of behavior, long enough to smooth one odd week.
- **8-week baseline:** about two months of "normal".
- **-30% for At risk:** clear inflection point representing significant drop.
- **-50% for Critical:** half the usage is gone, which is unambiguous.
- **-15% with a persistence check for Watch:** catches slow erosion without alarming on a single weak week.
- **Defaults, not fitted values:** the seed data told us which cases to design for, and fixtures test the boundaries independently.
- **One config file:** every threshold can be changed in one place.

**Ranking:** within a tier, accounts are ordered by severity: $|\text{drop}| \times \text{plan weight}$, so a big Enterprise decline outranks a big Starter decline.

**Classification on the seed customer portfolio (8 accounts):**

| Account | Plan Tier | Drop vs Normal | RetainIQ Classification | Engine Diagnostic Reason |
|---|---|---|---|---|
| A-05 Cascade Meridian | Enterprise | -79% | **Critical** | Usage collapsed to near-zero (-79% over 4 weeks, -80% last 2 weeks). Sudden cliff at week 10. |
| A-01 Northwind Traders | Growth | -62% | **Critical** | Usage fell 62% over 4 weeks (-75% last 2 weeks). Sudden cliff at week 10. |
| A-04 Harborview Inc | Enterprise | -21% | **Watch** | Slow erosion: usage dropped 21% over 4 weeks (-30% last 2 weeks). Steady persistent decline. |
| A-06 Fresh Startup Co | Starter | n/a (5 weeks) | **Too new to score** | Only 5 weeks of history; week-1 spike (40 logins) settled to ~12 (onboarding phase). Routed to onboarding. |
| A-08 New Signup LLC | Starter | n/a (2 weeks) | **Too new to score** | Only 2 weeks of history; baseline cannot be measured yet. Handled safely with zero risk of crash. |
| A-07 Choppy Retail Co | Growth | -4% | **Healthy** (`volatile`) | Normal choppy retail login pattern. Baseline noise ($CV = 25\%$) explains variation. |
| A-02 Bluepeak Corp | Growth | +4% | **Healthy** | Stable, reliable weekly logins within normal historical range. |
| A-03 Solace Digital | Starter | +55% | **Healthy** (`growing`) | Strong upward usage expansion (+55% above baseline). |

## 4. Cases we consider, and how each is handled

| # | Case | Handling | Covered by |
|---|---|---|---|
| C1 | Sudden cliff | Critical or At risk via drop and last-2 | A-01, A-05 |
| C2 | Slow erosion that never trips a 30% bar | Watch tier with persistence check | A-04 |
| C3 | Onboarding spike then settling | First 2 weeks excluded; under 10 weeks is Too new | A-06 |
| C4 | Too little history | Too new, routed to onboarding, never crashes | A-08, boundary fixtures at 9/10/12 weeks |
| C5 | Naturally noisy usage | Drop must exceed 2x the account's own noise | A-07 |
| C6 | Stable | Healthy | A-02 |
| C7 | Strong growth | Healthy, tagged `growing` | A-03 |
| C8 | Usage drops to zero | Critical | Fixture |
| C9 | One-week dip that recovers (outage, holiday) | Not flagged: last-2 check | Fixture |
| C10 | Declined, then partly recovered | Watch, tagged `recovering` | Fixture |
| C11 | Very low volume (a few logins a week) | Capped at Watch, tagged `low_volume` | Fixture |
| C12 | Usage doubles | Needs review (spike or data issue) | Fixture |
| C13 | Whole portfolio shifts in one week | Annotate as possible platform cause, lower confidence | Fixture |
| C14 | Bad data (negative, missing, non-numeric, empty) | Rejected per account with a reason; the rest still run | Fixture |
| C15 | Unreliable metric (timeouts, shared devices) | Self-relative baseline cancels a constant policy; question raised with Dana | Documented, not testable on seed |
| C16 | Seasonality | Not handled; stated as a limitation | Documented |
| C17 | Onboarding that runs longer than 2 weeks (e.g. 3 high weeks, then steady) | The baseline uses the median, so 1-2 leftover high weeks do not move it; the noise check also covers a longer ramp; `early_ramp_down` tag added. Limit: login data alone cannot tell a long onboarding from an early collapse to low, steady usage; peer comparison in phase 2 is the fix | Fixtures |

## 5. How AI is used

Detection stays **deterministic**: the same data always gives the same tier, and every flag can be traced to numbers. AI is used where rules are weak, in turning a ranked table into action.

**The Churn Analyst Agent** is a bounded, tool-using LLM loop. Its tools are read-only functions over the engine's output (portfolio stats, flagged accounts, individual account features, walk-forward replay timeline). It produces:

1. **Weekly briefing for Dana:** Actionable synthesis of top churn risks, consolidated platform-wide incident summaries (when multiple accounts drop together), root-cause hypotheses, and CS questions.
2. **Outreach brief per flagged account:** What happened in plain language, pattern type (sudden cliff or slow erosion, computed by code), suggested next steps, and 2-3 tailored questions for the CS rep.

**How it improves the solution:** CS reps are not analysts, so a tier plus "-62%" does not tell them what to do on Monday. The agent turns it into a prioritised, readable action list, in consistent language, in seconds. It also becomes more valuable in phase 2, when tickets, renewal dates and usage depth feed in.

**What it does not do:** it never decides a tier and never calculates a number.

**Guardrails:**
- Every number in the output is checked against the engine's values; any mismatch rejects the output.
- Fall back to deterministic template text on validation failure, timeout, missing API key, or any provider error. The result clearly reports the source (`llm` or `template`). The demo never fails because of the LLM.
- The model receives account IDs and aggregate stats, never PII or customer names; names are re-attached afterwards.
- Temperature 0, structured JSON output, hard cap on tool calls, and cached results so the demo is repeatable.
- Output is advisory for human Customer Success managers; nothing is sent to customers automatically.

**Honest limit:** with only logins, the suggested actions are fairly generic. We say so rather than claim more.

## 6. Architecture overview

RetainIQ is architected as a robust 3-tier pipeline designed for production clarity, auditability, and speed:
Deterministic Python engine (pure functions) $\rightarrow$ FastAPI service $\rightarrow$ Single-page React UI, accompanied by an interactive CLI that generates the exact same reports and backtest replays.

The user interface delivers:
1. **Executive Summary Strip:** Real-time visibility into Flagged CS Load and breakdown across all customer health tiers (Critical, At Risk, Watch, Needs Review, Healthy, Too New).
2. **Ranked Risk Portfolio:** Prioritized table ordered by severity and contract plan weight, complete with 12-week login trend sparklines, pattern tags, and instant tier filtering.
3. **Interactive Account Detail Drawer:** Deep dive for individual accounts featuring historical login trajectories, onboarding/baseline/recent window indicators, walk-forward backtest replay timeline, and on-demand AI outreach briefs.
4. **Consolidated Platform Incident Overview:** Macro portfolio-level shift detection that groups correlated drops under a single incident investigation banner to prevent repetitive alerts.
5. **CS Weekly Intelligence Briefing:** Automated synthesis powered by the Churn Analyst Agent (Gemini) with strict factual validation against engine numbers and deterministic template fallback.
6. **Historical Portfolio Replay:** Walk-forward backtesting simulator demonstrating detection timeliness across past weeks without lookahead bias.
7. **What-If Threshold Sandbox:** Real-time engine threshold configuration for simulating sensitivity adjustments on CS workload.
8. **How It Works Documentation:** Plain-language explanations of math, formulas, and tier thresholds.

See [ARCHITECTURE.md](ARCHITECTURE.md) for full component specifications, mathematical formulas, API endpoints, and validation test plans.

## 7. Trade-offs we considered

| Decision | Alternative | Why we chose this |
|---|---|---|
| Rules and statistics | Trained ML or anomaly model | 8 accounts, no churn labels. Rules are testable and explainable. ML comes when labels exist |
| 10-week minimum history | Score from 8 weeks | Fewer false alarms: ensures 2 onboarding weeks, at least 4 baseline weeks for stable median estimation, and 4 recent weeks for trend measurement. Configurable in threshold settings |
| Tiers | One yes/no flag | CS capacity is limited; tiers let them triage |
| Own-history baseline | Compare with peers | Peer comparison needs more accounts; planned for phase 2 |
| LLM only for language and next steps | LLM as the classifier | A classifier that cannot show its working is hard to trust or debug |
| Plan tier as value proxy | Ignore value | Crude but better than treating all accounts equally; replaced by ARR in phase 2 |

## 8. Known limitations

- Login counts measure authentication events, not value. Inventory software often runs in the background.
- With only 12 weeks, seasonality cannot be separated from decline.
- Thresholds are reasoned, not validated against real churn outcomes.
- We cannot know the cause of a decline from usage alone; the agent can only suggest questions.

## 9. Phase 2 (feasible next steps) and future work

| Item | What | Needs |
|---|---|---|
| Richer signals | Distinct active users vs. seats, core actions (POs, adjustments, scans), integration health | Product event data from Vantage |
| Renewal-weighted priority | Rank by contract value and days to renewal | CRM or billing fields |
| Synthetic portfolio demo | About 100 accounts x 52 weeks, pre-generated and clearly labelled illustrative, to show the portfolio view, peer-cohort comparison and pattern discovery at scale | No external data; only demonstrates the pipeline, not accuracy |
| Change detection | EWMA or CUSUM for subtler shifts | 26+ weeks per account |
| Peer-cohort comparison | Flag accounts lagging similar accounts; separates seasonal from account-specific dips | 50+ comparable accounts |
| Feedback loop | CS marks each flag saved, churned or false alarm | A small UI action; this builds labels |
| Delivery | Weekly scheduled run to Slack or CRM | Integration access |
| Unsupervised discovery | Clustering or isolation forest as a tool for analysts, who promote good patterns into rules | About 100 accounts x 52 weeks |
| **Future** | Supervised churn model, seasonality-aware baselines, "who is saveable" modelling, briefs that use ticket and call notes | 12+ months of labelled churn across hundreds of accounts |

One year of data for 100 accounts is enough to discover patterns for human review. It is not enough for a reliable churn classifier: at typical churn rates that is only 10-15 churn events.

## 10. Questions for Dana

1. What exactly is counted as a login, and has the session timeout or SSO setup changed recently? (Session timeout policies directly inflate or deflate raw login counts).
2. Do renewal dates and contract values (ARR) exist in a CRM/billing system we can integrate? (Allows true contract-weighted triage instead of plan-tier proxies).
3. How long is a typical customer onboarding period? (Validates whether 2 weeks is appropriate or if certain cohorts require longer baseline exclusion).
4. How many flagged accounts can the CS team realistically act on each week? (Calibrates threshold strictness and tier caps against operational capacity).
5. Which hurts more: a false alarm (outreach to a customer who wasn't leaving) or a missed churn (silent cancellation)? (Guides the trade-off between early warning sensitivity vs. precision).
