import pytest
import pandas as pd
from pandera.errors import SchemaError
from app.models.data_contracts import (
    OHLCV_SCHEMA,
    DAILY_INDICATOR_SCHEMA,
    STOCK_MOVEMENT_SCHEMA,
    TRADE_SIGNAL_SCHEMA,
    validate_ohlcv_dataframe,
    validate_indicators_dataframe,
    validate_movements_dataframe,
    validate_trade_signals_dataframe,
)


def test_valid_ohlcv_passes_strict():
    df = pd.DataFrame({
        "open": [100.0, 102.0],
        "high": [105.0, 106.0],
        "low": [98.0, 101.0],
        "close": [103.0, 104.0],
        "volume": [1500000.0, 2000000.0],
    })
    validated = validate_ohlcv_dataframe(df, strict=True)
    assert len(validated) == 2
    assert "close" in validated.columns


def test_inverted_high_low_fails_strict():
    df = pd.DataFrame({
        "open": [100.0],
        "high": [95.0],  # high is lower than open/low
        "low": [98.0],
        "close": [96.0],
        "volume": [1000.0],
    })
    with pytest.raises(SchemaError):
        validate_ohlcv_dataframe(df, strict=True)


def test_sanitizes_corrupt_ohlcv_in_non_strict():
    df = pd.DataFrame({
        "open": [100.0, -10.0, 50.0],
        "high": [105.0, 20.0, 45.0],  # row 1 has negative open, row 2 has high < open (45 < 50)
        "low": [98.0, 5.0, 40.0],
        "close": [103.0, 15.0, 42.0],
        "volume": [1000.0, 500.0, 800.0],
    })
    cleaned = validate_ohlcv_dataframe(df, strict=False)
    assert len(cleaned) == 1
    assert cleaned.iloc[0]["open"] == 100.0


def test_valid_indicators_passes():
    df = pd.DataFrame({
        "rsi_14": [45.5, 72.1],
        "atr_14": [2.4, 3.1],
        "bb_upper": [110.0, 115.0],
        "bb_lower": [90.0, 92.0],
        "high_52w": [120.0, 120.0],
        "low_52w": [80.0, 80.0],
    })
    validated = validate_indicators_dataframe(df, strict=True)
    assert len(validated) == 2


def test_invalid_rsi_fails_strict_and_clamps_non_strict():
    df = pd.DataFrame({
        "rsi_14": [105.0],  # Out of range 0-100
    })
    with pytest.raises(SchemaError):
        validate_indicators_dataframe(df, strict=True)

    clamped = validate_indicators_dataframe(df, strict=False)
    assert clamped.iloc[0]["rsi_14"] == 100.0


def test_inverted_bollinger_bands_fails_strict():
    df = pd.DataFrame({
        "bb_upper": [80.0],
        "bb_lower": [100.0],  # upper < lower!
    })
    with pytest.raises(SchemaError):
        validate_indicators_dataframe(df, strict=True)


def test_valid_trade_signals_passes():
    df = pd.DataFrame({
        "entry_price": [100.0],
        "stop_loss": [92.0],
        "target_1": [120.0],
        "risk_reward_ratio": [2.5],
    })
    validated = validate_trade_signals_dataframe(df, strict=True)
    assert len(validated) == 1


def test_inverted_trade_signal_fails_strict_and_filters_non_strict():
    # Long trade with stop loss ABOVE entry price
    df = pd.DataFrame({
        "entry_price": [100.0, 50.0],
        "stop_loss": [105.0, 45.0],  # Row 0 has stop_loss > entry_price
        "target_1": [120.0, 60.0],
        "risk_reward_ratio": [1.5, 2.0],
    })
    with pytest.raises(SchemaError):
        validate_trade_signals_dataframe(df, strict=True)

    filtered = validate_trade_signals_dataframe(df, strict=False)
    assert len(filtered) == 1
    assert filtered.iloc[0]["entry_price"] == 50.0


def test_stock_movement_direction_validation():
    valid_df = pd.DataFrame({
        "direction": ["UP", "DOWN", "FLAT"],
        "change_pct": [2.5, -1.2, 0.0],
    })
    assert len(validate_movements_dataframe(valid_df, strict=True)) == 3

    invalid_df = pd.DataFrame({
        "direction": ["SIDEWAYS"],
    })
    with pytest.raises(SchemaError):
        validate_movements_dataframe(invalid_df, strict=True)
