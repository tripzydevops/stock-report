"""
Borsa Istanbul (BIST) Authoritative Trading Calendar & Session Resolver.
Loads official exchange holidays, half-days, and trading session schedules
from the canonical calendar configuration.
"""
import json
import logging
from datetime import datetime, date, timezone, timedelta
from pathlib import Path
from typing import Optional, Set, Dict, Any
import pandas as pd

logger = logging.getLogger(__name__)

# Locate calendar JSON (searches local app data dir first, then shared root)
_THIS_DIR = Path(__file__).resolve().parent
_APP_DATA_FILE = _THIS_DIR.parent / "data" / "bist_calendar.json"
_SHARED_FILE = _THIS_DIR.parent.parent.parent / "shared" / "bist_calendar.json"

_CALENDAR_DATA: Dict[str, Any] = {}

if _APP_DATA_FILE.exists():
    try:
        with open(_APP_DATA_FILE, "r", encoding="utf-8") as f:
            _CALENDAR_DATA = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load BIST calendar from {_APP_DATA_FILE}: {e}")

if not _CALENDAR_DATA and _SHARED_FILE.exists():
    try:
        with open(_SHARED_FILE, "r", encoding="utf-8") as f:
            _CALENDAR_DATA = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load BIST calendar from {_SHARED_FILE}: {e}")

# Fallback defaults if file cannot be read
_DEFAULT_FULL_HOLIDAYS = {
    # 2025
    "2025-01-01", "2025-03-31", "2025-04-01", "2025-04-23", "2025-05-01",
    "2025-05-19", "2025-06-06", "2025-06-09", "2025-07-15", "2025-10-29",
    # 2026
    "2026-01-01", "2026-03-20", "2026-04-23", "2026-05-01", "2026-05-19",
    "2026-05-27", "2026-05-28", "2026-05-29", "2026-07-15", "2026-10-29",
    # 2027
    "2027-01-01", "2027-03-10", "2027-03-11", "2027-03-12", "2027-04-23",
    "2027-05-17", "2027-05-18", "2027-05-19", "2027-05-20", "2027-07-15",
    "2027-08-30", "2027-10-29",
    # 2028
    "2028-02-28", "2028-02-29", "2028-05-01", "2028-05-05", "2028-05-08",
    "2028-05-19", "2028-08-30"
}

_DEFAULT_HALF_DAYS = {
    "2025-06-05", "2025-10-28",
    "2026-03-19", "2026-05-26", "2026-10-28",
    "2027-03-09", "2027-10-28",
    "2028-05-04"
}

BIST_MARKET_HOLIDAYS: Set[str] = set(
    _CALENDAR_DATA.get("full_holidays", {}).keys()
) if _CALENDAR_DATA.get("full_holidays") else _DEFAULT_FULL_HOLIDAYS

BIST_HALF_DAYS: Set[str] = set(
    _CALENDAR_DATA.get("half_days", {}).keys()
) if _CALENDAR_DATA.get("half_days") else _DEFAULT_HALF_DAYS


def is_bist_holiday(date_str: str) -> bool:
    """Returns True if the given YYYY-MM-DD date is a full official BIST closed holiday."""
    return date_str in BIST_MARKET_HOLIDAYS


def is_bist_half_day(date_str: str) -> bool:
    """Returns True if the given YYYY-MM-DD date is an official BIST half-day (closes 13:00 TRT)."""
    return date_str in BIST_HALF_DAYS


def is_bist_market_open(dt: Optional[datetime] = None) -> bool:
    """
    Checks if Borsa Istanbul is currently in an active trading session.
    TRT = UTC+3.
    Regular trading days: 10:00 to 18:10 TRT.
    Half-day trading days: 10:00 to 13:00 TRT.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    trt_time = dt.astimezone(timezone(timedelta(hours=3)))
    weekday = trt_time.weekday()
    date_str = trt_time.strftime("%Y-%m-%d")

    # Closed on weekends or full holidays
    if weekday in (5, 6) or is_bist_holiday(date_str):
        return False

    current_minutes = trt_time.hour * 60 + trt_time.minute
    market_open_minutes = 10 * 60  # 10:00

    if is_bist_half_day(date_str):
        market_close_minutes = 13 * 60  # 13:00
    else:
        market_close_minutes = 18 * 60 + 10  # 18:10

    return market_open_minutes <= current_minutes < market_close_minutes


def get_bist_trading_session_date(dt: Optional[datetime] = None) -> date:
    """
    Returns the latest official Borsa Istanbul (BIST) trading session date.
    BIST trading hours: Monday–Friday 10:00–18:10 TRT (UTC+3) [10:00–13:00 on half days].
    Rolls back past weekends and official BIST market holidays.
    If called pre-market (< 10:00 AM TRT), rolls back to the previous session.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    trt_time = dt.astimezone(timezone(timedelta(hours=3)))
    hour = trt_time.hour
    target = trt_time.date()

    # Pre-market on any day: today's session has not opened yet, roll back 1 day
    if hour < 10:
        target = target - timedelta(days=1)

    # Roll back past weekends (Saturday=5, Sunday=6) and official full BIST market holidays
    while target.weekday() in (5, 6) or target.strftime("%Y-%m-%d") in BIST_MARKET_HOLIDAYS:
        target = target - timedelta(days=1)

    return target


def get_bist_trading_session_timestamp(dt: Optional[datetime] = None) -> pd.Timestamp:
    """Returns the latest official BIST trading session date as a pd.Timestamp."""
    return pd.Timestamp(get_bist_trading_session_date(dt))
