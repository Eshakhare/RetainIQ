# RetainIQ

**Predictive Churn-Risk Early Warning Engine for Vantage Retail Systems.**

RetainIQ analyzes weekly account login trajectories to detect customer engagement declines before churn occurs. It provides Customer Success teams with an executive dashboard, explainable risk classifications, a walk-forward simulation backtester, and automated intelligence briefings.

> **Architecture & Design Documentation:**
> - For problem definition, operational assumptions, and business trade-offs, read **[SOLUTION_DESIGN.md](SOLUTION_DESIGN.md)**.
> - For technical architecture, algorithm specs, API contracts, and React UI layout, read **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## How to Run the System

### 1. Start the Backend API (FastAPI & Engine)
Prerequisites: Python 3.10+

```powershell
# Navigate to the backend directory
cd backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install -r requirements.txt

# Start the API server on http://localhost:8000 (Swagger interactive docs at http://localhost:8000/docs)
python -m uvicorn retainiq.api.app:app --reload
```

### 2. Start the Frontend Application (React + Vite)
Prerequisites: Node.js 18+

```powershell
# In a separate terminal, navigate to the frontend directory
cd ui-bundle

# Install dependencies
npm install

# Start the development server (runs on http://localhost:5173)
npm run dev
```
👉 Open your browser at **http://localhost:5173**.

### 3. Run via Command-Line Interface (CLI)
The CLI runs the exact same deterministic engine and produces the same reports as the web API:

```powershell
cd backend

# Standard ranked report on the seed customer portfolio
.\.venv\Scripts\python -m retainiq.cli

# Test other datasets
.\.venv\Scripts\python -m retainiq.cli --dataset platform_shift
.\.venv\Scripts\python -m retainiq.cli --dataset edge_cases

# Run historical walk-forward backtest (first alert week per account)
.\.venv\Scripts\python -m retainiq.cli --backtest

# Generate weekly intelligence briefing (AI or template fallback)
.\.venv\Scripts\python -m retainiq.cli --briefing

# Apply on-the-fly threshold overrides and output JSON
.\.venv\Scripts\python -m retainiq.cli --set at_risk_drop=-0.20 --json
```

### 4. Run Automated Tests
The test suite contains **90 automated tests** covering window slicing, classification boundaries, noise guards, API routes, agent tool loops, and validation guardrails:

```powershell
cd backend
.\.venv\Scripts\python -m pytest
```

---

## AI Agent Configuration (Optional: Google Cloud Vertex AI / Gemini)

RetainIQ includes a **Churn Analyst Agent** powered by Google Gemini (default: `gemini-2.5-flash-lite`). It synthesizes weekly summaries, identifies platform-wide anomalies, and drafts account outreach briefs.

### Supported Providers:
1. **Google Cloud Vertex AI (Default):**
   - Enable Vertex AI in your GCP project: `gcloud services enable aiplatform.googleapis.com`
   - Create a service account with the **Vertex AI User** role (`roles/aiplatform.user`) and download its JSON key.
   - In `backend/.env`, configure:
     ```bash
     LLM_PROVIDER=vertex
     GOOGLE_CLOUD_PROJECT=your-gcp-project-id
     GOOGLE_CLOUD_LOCATION=us-central1
     GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
     LLM_MODEL=gemini-2.5-flash-lite
     ```
2. **Google Gemini API Key:**
   - In `backend/.env`, configure:
     ```bash
     LLM_PROVIDER=gemini
     LLM_API_KEY=your-gemini-api-key
     LLM_MODEL=gemini-2.5-flash-lite
     ```

### Deterministic Fallback:
If no LLM credentials are configured or if external API calls fail or time out, **the system automatically falls back to deterministic template text** (`source: "template"` with `fallback_reason`). Core scoring and dashboard operations never fail because of an LLM.

---

## API Summary

All endpoints return JSON and have CORS enabled for development.

| Method & Path | Purpose |
|---|---|
| `GET /api/health` | Service health and LLM availability status |
| `GET /api/config` | Active thresholds and plain-language definitions |
| `GET /api/datasets` | List available datasets (`seed`, `edge_cases`, `platform_shift`) |
| `POST /api/analyze` | Run engine scoring; supports custom records and threshold overrides |
| `GET /api/accounts/{id}?dataset=` | Single account detail, feature windows, and replay timeline |
| `GET /api/backtest?dataset=` | Walk-forward replay simulation and first alert week per account |
| `POST /api/agent/briefing` | Generate CS Weekly Intelligence Briefing (AI or template fallback) |
| `POST /api/agent/accounts/{id}/brief` | Generate single-account outreach guidance and diagnostic questions |

---

## Classification Results on the Seed Data

| Account | Plan Tier | 4-Week Drop | RetainIQ Classification | Diagnostic Reason |
|---|---|---|---|---|
| A-05 Cascade Meridian | Enterprise | -79% | **Critical** | Sudden cliff collapse at week 10; usage fell to near zero. |
| A-01 Northwind Traders | Growth | -62% | **Critical** | Sudden cliff collapse at week 10. |
| A-04 Harborview Inc | Enterprise | -21% | **Watch** | Slow erosion pattern; persistent decline exceeding noise floor. |
| A-02 Bluepeak Corp | Growth | +4% | **Healthy** | Stable usage within normal historical range. |
| A-07 Choppy Retail Co | Growth | -4% | **Healthy** (`volatile`) | Normal retail login variance; drop does not exceed noise floor ($2 \times CV$). |
| A-03 Solace Digital | Starter | +55% | **Healthy** (`growing`) | Strong upward usage expansion. |
| A-06 Fresh Startup Co | Starter | n/a | **Too new to score** | 5 weeks of history; initial spike is onboarding. Routed to onboarding. |
| A-08 New Signup LLC | Starter | n/a | **Too new to score** | 2 weeks of history; insufficient baseline. Handled safely without error. |

---

## Known Limitations

- **Authentication vs. Value:** Login counts measure authentication events, not workflow completion or product value depth. Background inventory syncs and shared terminal logins can distort pure session counts.
- **Retail Seasonality:** With 12 weeks of historical data, annual seasonality (such as Q4 holiday spikes or post-holiday lulls) cannot be statistically separated from customer churn without 52+ weeks.
- **Heuristic Thresholds:** Thresholds are mathematically reasoned and backtested against historical variance, but have not yet been calibrated against true contract termination labels.
- **Early Collapse vs. Long Onboarding:** Login data alone cannot reliably distinguish an extended 4-week customer onboarding from an account that suffered an early collapse to low steady usage without peer-cohort benchmarks.
- **Local Prototype Scope:** The local demo does not implement multi-tenant authentication, user RBAC, or persistent cloud database storage.
- **Date Semantics:** Time series represent weekly sequences without explicit calendar dates; the final entry is assumed to be the latest completed calendar week.

---

## Phase 2 Roadmap: What We Can Achieve

Future iterations can expand RetainIQ from a single-signal warning system into an enterprise customer intelligence platform:

1. **Richer Telemetry Signals:** Ingest distinct active seats, core workflow events (purchase orders, inventory adjustments, barcode scans), and support ticket escalations.
2. **Contract & Renewal Weighting:** Prioritize accounts by actual ARR and upcoming renewal dates rather than subscription plan proxies.
3. **Peer-Cohort Benchmarking:** Compare accounts against similar retail segments and store counts to separate macroeconomic trends from account-specific disengagement.
4. **CS Feedback Loop:** Allow CS reps to mark alerts as *Saved*, *Churned*, or *False Alarm* directly in the UI, building labelled ground truth for supervised machine learning.
5. **Automated Notification Delivery:** Scheduled weekly digests delivered directly to Slack or synced into HubSpot/Salesforce CRM.

👉 **For the complete Phase 2 specification and data requirements, see [SOLUTION_DESIGN.md Section 9](SOLUTION_DESIGN.md#9-phase-2-feasible-next-steps-and-future-work).**

