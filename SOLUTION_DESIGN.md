# RetainIQ: Churn-Risk Early Warning for Vantage Retail Systems

**Status:** v1 design, written before implementation. The numbers in sections 3 and 4 come from a prototype run of the rules on the seed data. Implementation details, API contract and test plan are in [ARCHITECTURE.md](ARCHITECTURE.md).

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

An account's **current level** is the mean of its last 4 weeks. Its **normal level** (baseline) is the median of the up-to-8 weeks before that, skipping onboarding. The median keeps one odd week from distorting the baseline. The **drop** is current level divided by normal level, minus 1. **Last-2** is the same comparison using only the last 2 weeks, so we can tell whether the decline is continuing or recovering. **Noise** is the baseline's coefficient of variation; a drop only counts as meaningful if it is larger than twice the noise.

| Tier | Rule | What CS does |
|---|---|---|
| **Critical** | drop ≤ -50% and last-2 ≤ -30% | Contact this week, senior or executive outreach |
| **At risk** | drop ≤ -30%, last-2 ≤ -30%, and meaningful | Proactive outreach within days |
| **Watch** | drop ≤ -15%, last-2 ≤ -10%, and meaningful | Light-touch check-in; re-evaluate next week |
| **Needs review** | drop ≥ +100% (usage doubled) | Verify: data issue, new rollout or genuine growth |
| **Healthy** | Everything else (tagged `growing` at +25% or more, `volatile` if noise ≥ 20%) | Nothing |
| **Too new to score** | Under 10 weeks of history, or no baseline activity | Route to onboarding, not churn prevention |

**Guards:**
- **Low volume:** a baseline under 5 logins a week is capped at Watch, because percentages on tiny numbers are unreliable.
- **Platform-wide shift:** if most accounts fall or rise together in the latest week, flags are annotated "possible platform-wide cause" (outage, policy change) and confidence is lowered. Flags are never suppressed.
- **Confidence:** High at 12 or more weeks of history, Medium at 10-11.
- **Noise check:** a change only counts if it is larger than twice the account's own normal week-to-week variation.
- **Recovery check:** the last-2-weeks test stops a dip that has already bounced back from raising an alert.
- **Early ramp-down note:** if an account's first weeks were well above its normal (baseline) level, we add an informational `early_ramp_down` tag. It never changes the tier (see case C17).

**Why these numbers:**
- **4-week current level:** about one month of behaviour, long enough to smooth one odd week.
- **8-week baseline:** about two months of "normal".
- **-30% for At risk:** the starter utility's own default, kept as the bar.
- **-50% for Critical:** half the usage is gone, which is unambiguous.
- **-15% with a persistence check for Watch:** catches slow erosion without alarming on a single weak week.
- **Defaults, not fitted values:** the seed data told us which cases to design for, and the fixtures in section 4 test the boundaries independently.
- **One config file:** every threshold can be changed in one place.

**Ranking:** within a tier, accounts are ordered by |drop| × plan weight, so a big Enterprise decline outranks a big Starter decline.

**Result on the seed data (prototype):**

| Account | Plan | Drop vs normal | Ours | Starter utility |
|---|---|---|---|---|
| A-05 Cascade Meridian | Enterprise | -79% | **Critical** | Flagged |
| A-01 Northwind Traders | Growth | -62% | **Critical** | Flagged |
| A-04 Harborview Inc | Enterprise | -21% | **Watch** (slow erosion) | **Missed** (-17%) |
| A-06 Fresh Startup Co | Starter | n/a (5 weeks) | **Too new** (week-1 spike is onboarding) | **False alarm** (-70%) |
| A-08 New Signup LLC | Starter | n/a (2 weeks) | **Too new** | **Crashes** (division by zero) |
| A-07 Choppy Retail Co | Growth | -4% | Healthy, `volatile` | Not flagged |
| A-02 Bluepeak Corp | Growth | +4% | Healthy | Not flagged |
| A-03 Solace Digital | Starter | +55% | Healthy, `growing` | Not flagged |

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

**The Churn Analyst Agent** is a bounded, tool-using LLM loop. Its tools are read-only functions over the engine's output (flagged accounts, one account's features, replay timeline, portfolio stats). It produces:

1. **Weekly briefing for Dana:** which accounts need attention, in what order, and why, in a few sentences.
2. **Outreach brief per flagged account:** what happened in plain language, the pattern type (sudden cliff or slow erosion, computed by code), a suggested next step, and 2-3 questions the rep should ask (e.g. for a cliff, "did anything change around week 7, such as a key user leaving or an integration problem?").

**How it improves the solution:** CS reps are not analysts, so a tier plus "-62%" does not tell them what to do on Monday. The agent turns it into a prioritised, readable action list, in consistent language, in seconds. It also becomes more valuable in phase 2, when tickets, renewal dates and usage depth feed in.

**What it does not do:** it never decides a tier and never calculates a number.

**Guardrails:**
- Every number in the output is checked against the engine's values; any mismatch rejects the output.
- Fall back to template text on validation failure, timeout, missing API key or any error, and the result says which source was used. The demo can never fail because of the LLM.
- The model receives account IDs and aggregate stats, not customer names or raw records; names are re-attached afterwards.
- Temperature 0, structured output, a hard cap on tool calls, and cached results so the demo is repeatable.
- Output is advice for a human; nothing is sent to customers automatically.

**Honest limit:** with only logins, the suggested actions are fairly generic. We say so rather than claim more.

## 6. Solution overview

Python engine (pure functions) → FastAPI service → single-page React UI, plus a CLI that produces the same report. The UI has one job: call endpoints and show results (ranked list with sparklines, account detail, side-by-side comparison against the starter utility, replay timeline, agent briefing). See ARCHITECTURE.md for the layout, algorithm spec and API contract.

## 7. Trade-offs we considered

| Decision | Alternative | Why we chose this |
|---|---|---|
| Rules and statistics | Trained ML or anomaly model | 8 accounts, no churn labels. Rules are testable and explainable. ML comes when labels exist |
| 10-week minimum history | Score from 8 weeks | Fewer false alarms, but slower: the replay shows the starter utility flags A-05 one week earlier (week 9 vs. our week 10). Configurable; we recommend 10 |
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

1. How many flagged accounts can CS act on each week? (sets threshold strictness)
2. Which hurts more: a false alarm or a missed churn?
3. What exactly is counted as a login, and has the session timeout or SSO setup changed recently?
4. Do renewal dates and contract values exist somewhere we can read?
5. How long is a typical onboarding period?
