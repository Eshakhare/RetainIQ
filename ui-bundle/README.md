# RetainIQ UI

RetainIQ is a churn-risk early-warning dashboard designed for a Customer Success head.
The UI contains **no business logic**: it consumes the RetainIQ REST API and renders what comes back. Detection is 100% deterministic; AI is only used to write synthesized briefs and hypotheses.

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS
- Recharts
- Lucide React

## Getting Started

### 1. Start the Backend API
In a separate terminal, start the FastAPI backend service:
```powershell
cd backend
.\.venv\Scripts\python -m uvicorn retainiq.api.app:app --reload
```
The backend API will be available at `http://127.0.0.1:8000`.

### 2. Install Frontend Dependencies
```powershell
cd ui-bundle
npm install
```

### 3. Run the Development Server
```powershell
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```powershell
npm run build
```

## Features
- **Deterministic Early-Warning Tiers**: Critical, At risk, Watch, Needs review, Healthy, Too new to score, Rejected input.
- **Weekly CS Intelligence Briefing (AI Showcase)**: Synthesized summaries with action priorities, root-cause hypotheses, and custom outreach questions.
- **Show the Working Drawer**: Detailed step-by-step mathematical breakdown, baseline and recent evaluation windows, sudden cliff detection, and historical replay.
- **Direct Engine Comparison**: Head-to-head comparison against the baseline starter kit with error recovery indicators.
- **What-If Scenario Simulation**: Adjust detection thresholds and tweak weekly logins to test engine sensitivity in real-time.
- **Configurable API Endpoint**: Easily switch or customize the API URL in the header settings modal.
