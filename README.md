# RetainIQ

Churn-risk early warning for Vantage Retail Systems. It reads weekly login counts per account and produces a ranked, explained list of accounts whose usage is falling. Design: [SOLUTION_DESIGN.md](SOLUTION_DESIGN.md). Build spec and API contract: [ARCHITECTURE.md](ARCHITECTURE.md).

This repository contains the **v1 backend**: the scoring engine, replay and starter comparison, the REST API, the CLI and the AI agent (with template fallback). The React UI is built separately and only calls the API.

## Run it

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt

# CLI report on the seed data (same engine as the API)
.\.venv\Scripts\python -m retainiq.cli --compare --backtest --briefing

# API on http://127.0.0.1:8000 (docs at /docs)
.\.venv\Scripts\python -m uvicorn retainiq.api.app:app --reload

# tests
.\.venv\Scripts\python -m pytest
```

All backend commands run from the `backend/` folder. The UI lives in `ui-bundle/` and calls the API.

CLI options: `--dataset seed|edge_cases|platform_shift|<path.json>`, `--set key=value` (threshold override, repeatable), `--mode template` (skip the LLM), `--json`.

### Optional: LLM briefings (Gemini 2.5 Flash-Lite on Vertex AI)

1. In your Google Cloud project, enable the Vertex AI API (`gcloud services enable aiplatform.googleapis.com`).
2. Create a service account with the role **Vertex AI User** (`roles/aiplatform.user`) and download its JSON key.
3. Copy `.env.example` to `.env` and set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` (default `us-central1`) and `GOOGLE_APPLICATION_CREDENTIALS` (path to the key). `LLM_MODEL` defaults to `gemini-2.5-flash-lite`.
4. Check `GET /api/health`: `llm_available` should be `true`.

Without these the agent returns template text and says so (`source: "template"`, with a `fallback_reason`). Nothing else changes. `LLM_PROVIDER=gemini` with `LLM_API_KEY` is also supported.

## API

| Method and path | Purpose |
|---|---|
| GET `/api/health` | Liveness, `llm_available` |
| GET `/api/config` | Thresholds and definitions |
| GET `/api/datasets` | `seed`, `edge_cases`, `platform_shift` |
| POST `/api/analyze` | `{dataset?, accounts?, config_overrides?}`: ranked results, summary, portfolio annotations (what-if panel) |
| GET `/api/accounts/{id}?dataset=` | One account plus replay timeline |
| GET `/api/backtest?dataset=` | Tier as of each past week, first alert week vs. starter |
| GET `/api/compare?dataset=` | Ours vs. starter: `agree`, `we_catch_more`, `starter_false_alarm`, `starter_error` |
| POST `/api/agent/briefing` | `{dataset?, mode?: auto\|template, refresh?}` weekly briefing |
| POST `/api/agent/accounts/{id}/brief` | Outreach brief for one account |

Errors always look like `{"error": {"code", "message"}}`. CORS is open for any origin (local demo).

## Layout

```
backend/
  retainiq/
    config.py loader.py features.py classify.py annotate.py rank.py explain.py
    pipeline.py backtest.py starter_baseline.py cli.py env.py
    agent/  client.py tools.py agent.py validate.py template.py cache.py
    api/app.py
  data/  seed_accounts.json (copy of the provided data, untouched)  edge_cases.json  platform_shift.json
  tests/  requirements.txt  pytest.ini  .env.example (copy to .env)
ui-bundle/     single-page React UI (calls the API)
starter_kit/   provided starter code, untouched (loaded by starter_baseline.py)
```

Only `pipeline.py` computes a tier. The API, CLI, agent and tests all call it.

## Result on the seed data

| Account | Tier | Drop |
|---|---|---|
| A-05 Cascade Meridian | Critical | -79% |
| A-01 Northwind Traders | Critical | -62% |
| A-04 Harborview Inc | Watch (missed by the starter utility at -17%) | -21% |
| A-02, A-03, A-07 | Healthy | +4%, +55%, -4% |
| A-06, A-08 | Too new to score (starter gives a false alarm / crashes) | n/a |

## Implementation notes and deviations from the design

- `early_ramp_down` compares the first 4 weeks with the **baseline** level, not the current level as first written. With the current level, genuine collapses (A-01, A-05) were mislabelled as long onboarding. Docs are updated to match.
- The agent pre-fetches portfolio stats and the flagged list, then lets the model call `get_account` / `get_replay` (max 6 calls, 20 s, temperature 0). Validation also requires every Critical and At-risk account to appear, in engine rank order.
- Template output is built straight from engine facts, so it is reported as `validated: true` without going through the LLM validator.
- The LLM adapter calls Gemini on Vertex AI (`VertexClient`; `LLMClient` is the seam for other providers). It has been tested with mocks only, not against the live API.
- Agent results are cached in `.cache/agent_cache.json` (keyed by facts, prompt version, model); `refresh: true` bypasses it.
- `dataset` also accepts `platform_shift` (the platform-wide shift fixture is kept apart so it cannot disturb the other datasets' portfolio statistics).

## Known limitations

- Login counts measure authentication events, not value; inventory software often runs in the background.
- 12 weeks cannot separate seasonality from decline; thresholds are reasoned, not validated against real churn.
- A long onboarding and an early collapse to low steady usage look identical in logins alone (see `early_collapse` fixture); peer comparison is the phase 2 fix.
- No authentication or rate limiting (local demo).
- Time series have no dates; the last value is assumed to be the latest complete week.

## Next steps (phase 2)

See SOLUTION_DESIGN.md section 9: richer signals, renewal-weighted priority, peer cohorts, feedback loop, scheduled delivery.
