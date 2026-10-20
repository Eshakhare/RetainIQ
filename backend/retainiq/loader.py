"""Load and validate account data. Bad accounts are reported, never raised."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

#: Dataset id -> (file name, display name)
DATASETS = {
    "seed": ("seed_accounts.json", "Seed data (8 accounts, case study)"),
    "edge_cases": ("edge_cases.json", "Edge-case fixtures (12 accounts)"),
    "platform_shift": ("platform_shift.json", "Platform-wide shift fixture (6 accounts)"),
}

MAX_WEEKS = 520          # sanity limit: 10 years of weekly data
MAX_ACCOUNTS = 5000


class DatasetError(Exception):
    """Unknown or unreadable dataset."""


def load_raw_accounts(dataset: str) -> List[Any]:
    """Return the raw `accounts` list of a named dataset."""
    if dataset not in DATASETS:
        raise DatasetError(f"unknown dataset {dataset!r}; choose one of {sorted(DATASETS)}")
    return load_accounts_file(DATA_DIR / DATASETS[dataset][0])


def load_accounts_file(path: Path) -> List[Any]:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError as exc:
        raise DatasetError(f"file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise DatasetError(f"invalid JSON in {path}: {exc}") from exc
    accounts = data.get("accounts") if isinstance(data, dict) else data
    if not isinstance(accounts, list):
        raise DatasetError(f"{path} must contain an 'accounts' list")
    return accounts


def list_datasets() -> List[Dict[str, Any]]:
    out = []
    for ds_id, (_, name) in DATASETS.items():
        try:
            count = len(load_raw_accounts(ds_id))
        except DatasetError:
            continue
        out.append({"id": ds_id, "name": name, "accounts": count})
    return out


def _bad_number(value: Any) -> Optional[str]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return f"non-numeric value {value!r}"
    if isinstance(value, float) and not math.isfinite(value):
        return "non-finite value"
    if value < 0:
        return f"negative value {value!r}"
    return None


def validate_account(raw: Any, index: int, seen_ids: set) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Validate one raw account.

    Returns `(account, None)` if valid, else `(None, error_stub)` where the stub
    carries enough identity for the UI to show the rejected row.
    """
    if not isinstance(raw, dict):
        return None, _stub(f"UNKNOWN-{index + 1}", None, None, "INVALID_RECORD", "account must be an object")

    account_id = raw.get("account_id")
    if not isinstance(account_id, str) or not account_id.strip():
        account_id = f"UNKNOWN-{index + 1}"
    else:
        account_id = account_id.strip()
    name = raw.get("account_name") if isinstance(raw.get("account_name"), str) else None
    plan = raw.get("plan_tier") if isinstance(raw.get("plan_tier"), str) else None

    def fail(code: str, message: str):
        return None, _stub(account_id, name, plan, code, message, raw.get("weekly_logins"))

    if account_id in seen_ids:
        return fail("DUPLICATE_ID", f"duplicate account_id {account_id!r}")
    if account_id.startswith("UNKNOWN-") and raw.get("account_id") != account_id:
        return fail("MISSING_ID", "account_id is missing or not a string")

    weekly = raw.get("weekly_logins")
    if weekly is None:
        return fail("MISSING_LOGINS", "weekly_logins is missing")
    if not isinstance(weekly, list):
        return fail("INVALID_LOGINS", "weekly_logins must be a list of numbers")
    if len(weekly) == 0:
        return fail("EMPTY_HISTORY", "weekly_logins is empty")
    if len(weekly) > MAX_WEEKS:
        return fail("TOO_LONG", f"weekly_logins has more than {MAX_WEEKS} weeks")
    for i, v in enumerate(weekly):
        problem = _bad_number(v)
        if problem:
            return fail("INVALID_VALUE", f"week {i + 1}: {problem}")

    seen_ids.add(account_id)
    return {
        "account_id": account_id,
        "account_name": name or account_id,
        "plan_tier": plan or "Unknown",
        "weekly_logins": [float(v) if isinstance(v, float) else v for v in weekly],
    }, None


def _stub(account_id, name, plan, code, message, weekly=None) -> Dict[str, Any]:
    safe_weekly = None
    if isinstance(weekly, list) and len(weekly) <= MAX_WEEKS:
        safe_weekly = [v if _bad_number(v) is None else None for v in weekly]
    return {
        "account_id": account_id,
        "account_name": name or account_id,
        "plan_tier": plan or "Unknown",
        "weekly_logins": safe_weekly,
        "error": {"code": code, "message": message},
    }


def validate_accounts(raw_accounts: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Split raw input into (valid accounts, rejected stubs), preserving order info."""
    if not isinstance(raw_accounts, list):
        raise DatasetError("accounts must be a list")
    if len(raw_accounts) > MAX_ACCOUNTS:
        raise DatasetError(f"too many accounts (max {MAX_ACCOUNTS})")
    valid, rejected, seen = [], [], set()
    for i, raw in enumerate(raw_accounts):
        account, err = validate_account(raw, i, seen)
        if account is not None:
            valid.append(account)
        else:
            rejected.append(err)
    return valid, rejected
