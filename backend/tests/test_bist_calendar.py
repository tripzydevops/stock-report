import pytest
from datetime import datetime, date, timezone, timedelta
from app.services.bist_calendar import (
    BIST_MARKET_HOLIDAYS,
    BIST_HALF_DAYS,
    is_bist_holiday,
    is_bist_half_day,
    is_bist_market_open,
    get_bist_trading_session_date,
    get_bist_trading_session_timestamp,
)


def test_bist_official_holidays_presence():
    """Verify official Turkish national and religious holidays exist across 2025-2028."""
    # 2025
    assert is_bist_holiday("2025-01-01")  # New Year
    assert is_bist_holiday("2025-04-23")  # National Sovereignty
    assert is_bist_holiday("2025-05-01")  # Labour Day
    assert is_bist_holiday("2025-05-19")  # Youth & Sports
    assert is_bist_holiday("2025-07-15")  # Democracy Day
    assert is_bist_holiday("2025-10-29")  # Republic Day

    # 2026
    assert is_bist_holiday("2026-01-01")
    assert is_bist_holiday("2026-03-20")  # Ramazan Bayramı
    assert is_bist_holiday("2026-05-27")  # Kurban Bayramı
    assert is_bist_holiday("2026-10-29")

    # 2027
    assert is_bist_holiday("2027-08-30")  # Victory Day
    assert is_bist_holiday("2027-10-29")

    # 2028
    assert is_bist_holiday("2028-05-01")
    assert is_bist_holiday("2028-08-30")


def test_bist_half_days_presence():
    """Verify official BIST half-day sessions (closes at 13:00 TRT)."""
    assert is_bist_half_day("2025-10-28")  # Republic Day Eve
    assert is_bist_half_day("2026-03-19")  # Ramazan Eve
    assert is_bist_half_day("2026-10-28")
    assert is_bist_half_day("2027-10-28")
    assert is_bist_half_day("2028-05-04")


def test_is_bist_market_open_regular_day():
    """Test market open check for regular trading day."""
    # Wednesday 2026-11-11 at 11:30 TRT (08:30 UTC) -> Open
    wed_open = datetime(2026, 11, 11, 8, 30, tzinfo=timezone.utc)
    assert is_bist_market_open(wed_open) is True

    # Wednesday 2026-11-11 at 09:30 TRT (06:30 UTC) -> Pre-market (Closed)
    wed_premarket = datetime(2026, 11, 11, 6, 30, tzinfo=timezone.utc)
    assert is_bist_market_open(wed_premarket) is False

    # Wednesday 2026-11-11 at 18:30 TRT (15:30 UTC) -> Post-market (Closed)
    wed_postmarket = datetime(2026, 11, 11, 15, 30, tzinfo=timezone.utc)
    assert is_bist_market_open(wed_postmarket) is False

    # Sunday 2026-11-15 at 14:00 TRT -> Weekend (Closed)
    sun = datetime(2026, 11, 15, 11, 0, tzinfo=timezone.utc)
    assert is_bist_market_open(sun) is False


def test_is_bist_market_open_half_day():
    """Test market open check on half-days (closes 13:00 TRT)."""
    # 2026-10-28 (Republic Day Eve) at 11:30 TRT (08:30 UTC) -> Open
    half_day_open = datetime(2026, 10, 28, 8, 30, tzinfo=timezone.utc)
    assert is_bist_market_open(half_day_open) is True

    # 2026-10-28 at 13:30 TRT (10:30 UTC) -> Closed (half-day closes at 13:00)
    half_day_closed = datetime(2026, 10, 28, 10, 30, tzinfo=timezone.utc)
    assert is_bist_market_open(half_day_closed) is False


def test_is_bist_market_open_full_holiday():
    """Test market open check on full holidays."""
    # 2026-10-29 (Republic Day) at 12:00 TRT -> Closed all day
    rep_day = datetime(2026, 10, 29, 9, 0, tzinfo=timezone.utc)
    assert is_bist_market_open(rep_day) is False


def test_get_bist_trading_session_date_resolutions():
    """Test resolution of trading session date across edge cases."""
    # 1. During normal session (2026-11-11 14:00 TRT = 11:00 UTC) -> today
    wed_session = datetime(2026, 11, 11, 11, 0, tzinfo=timezone.utc)
    assert get_bist_trading_session_date(wed_session) == date(2026, 11, 11)

    # 2. Pre-market Monday (2026-11-16 08:30 TRT = 05:30 UTC) -> rolls back to Friday 2026-11-13
    mon_premarket = datetime(2026, 11, 16, 5, 30, tzinfo=timezone.utc)
    assert get_bist_trading_session_date(mon_premarket) == date(2026, 11, 13)

    # 3. Full holiday (2026-10-29 Republic Day) -> rolls back to half-day 2026-10-28
    rep_day = datetime(2026, 10, 29, 14, 0, tzinfo=timezone.utc)
    assert get_bist_trading_session_date(rep_day) == date(2026, 10, 28)

    # 4. Pre-market on half-day (2026-10-28 09:00 TRT = 06:00 UTC) -> rolls back to 2026-10-27
    half_day_pre = datetime(2026, 10, 28, 6, 0, tzinfo=timezone.utc)
    assert get_bist_trading_session_date(half_day_pre) == date(2026, 10, 27)

    # 5. Timestamp resolver returns valid pd.Timestamp
    ts = get_bist_trading_session_timestamp(wed_session)
    assert ts.strftime("%Y-%m-%d") == "2026-11-11"
