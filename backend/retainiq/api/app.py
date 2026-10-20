"""FastAPI service. A thin layer: every tier is computed by the engine."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from .. import __version__
from ..agent.agent import Agent
from ..agent.client import get_client
from ..backtest import backtest, compare, replay_series
from ..config import DEFINITIONS, FLAGGED_TIERS, Config, ConfigError
from ..env import load_env
from ..loader import DATASETS, DatasetError, MAX_ACCOUNTS, list_datasets, load_raw_accounts
from ..pipeline import analyze_portfolio

load_env()

app = FastAPI(title="RetainIQ API", version=__version__,
              description="Churn-risk early warning for weekly login data.")
# No auth in v1 (local demo): CORS is open for any origin. Noted as a production gap.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError):
    return _error(exc.status, exc.code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def _http_error(_: Request, exc: StarletteHTTPException):
    code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
    return _error(exc.status_code, code, str(exc.detail))


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    return _error(422, "INVALID_REQUEST", f"{loc}: {first.get('msg', 'invalid request')}".strip(": "))


@app.exception_handler(Exception)
async def _unhandled(_: Request, exc: Exception):
    return _error(500, "INTERNAL_ERROR", "unexpected server error")


# ---------------------------------------------------------------- helpers
def _cfg(overrides: Optional[Dict[str, Any]]) -> Config:
    try:
        return Config.from_overrides(overrides)
    except ConfigError as exc:
        raise ApiError(422, "INVALID_CONFIG", str(exc))


def _report(dataset: str, accounts: Optional[List[Any]] = None,
            overrides: Optional[Dict[str, Any]] = None):
    cfg = _cfg(overrides)
    try:
        raw = accounts if accounts is not None else load_raw_accounts(dataset)
        report = analyze_portfolio(raw, cfg)
    except DatasetError as exc:
        code = "UNKNOWN_DATASET" if dataset not in DATASETS and accounts is None else "INVALID_ACCOUNTS"
        raise ApiError(404 if code == "UNKNOWN_DATASET" else 422, code, str(exc))
    return report, cfg


def _find(report: Dict[str, Any], account_id: str) -> Dict[str, Any]:
    for r in report["results"]:
        if r["account_id"] == account_id:
            return r
    raise ApiError(404, "ACCOUNT_NOT_FOUND", f"no account {account_id!r} in this dataset")


# ---------------------------------------------------------------- models
class AnalyzeRequest(BaseModel):
    dataset: str = "seed"
    accounts: Optional[List[Any]] = None
    config_overrides: Optional[Dict[str, Any]] = None


class AgentRequest(BaseModel):
    dataset: str = "seed"
    mode: str = "auto"
    refresh: bool = False


def _mode(mode: str) -> str:
    if mode not in ("auto", "template"):
        raise ApiError(422, "INVALID_MODE", "mode must be 'auto' or 'template'")
    return mode


# ---------------------------------------------------------------- endpoints
@app.get("/api/health")
def health():
    return {"status": "ok", "llm_available": get_client() is not None, "version": __version__}


@app.get("/api/config")
def config():
    return {"thresholds": Config().to_dict(), "definitions": DEFINITIONS, "flagged_tiers": list(FLAGGED_TIERS)}


@app.get("/api/datasets")
def datasets():
    return list_datasets()


@app.post("/api/analyze")
def analyze(body: Optional[AnalyzeRequest] = None):
    body = body or AnalyzeRequest()
    report, cfg = _report(body.dataset, body.accounts, body.config_overrides)
    return report


@app.get("/api/accounts/{account_id}")
def account(account_id: str, dataset: str = Query("seed")):
    report, cfg = _report(dataset)
    result = dict(_find(report, account_id))
    if result["tier"] == "ERROR":
        result["replay"] = None
    else:
        result["replay"] = replay_series(result["weekly_logins"], cfg)
    return result


@app.get("/api/backtest")
def backtest_endpoint(dataset: str = Query("seed")):
    report, cfg = _report(dataset)
    return backtest(report["results"], cfg)


@app.get("/api/compare")
def compare_endpoint(dataset: str = Query("seed")):
    report, _ = _report(dataset)
    return compare(report["results"])


@app.post("/api/agent/briefing")
def agent_briefing(body: Optional[AgentRequest] = None):
    body = body or AgentRequest()
    mode = _mode(body.mode)
    report, cfg = _report(body.dataset)
    return Agent(report, cfg).briefing(mode=mode, refresh=body.refresh)


@app.post("/api/agent/accounts/{account_id}/brief")
def agent_account_brief(account_id: str, body: Optional[AgentRequest] = None):
    body = body or AgentRequest()
    mode = _mode(body.mode)
    report, cfg = _report(body.dataset)
    _find(report, account_id)
    return Agent(report, cfg).account_brief(account_id, mode=mode, refresh=body.refresh)
