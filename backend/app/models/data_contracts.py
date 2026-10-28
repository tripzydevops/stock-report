"""
Data Contracts and Schema Validation using Pandera.
Enforces runtime structural guarantees on market feeds, indicators, and trade signals.
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd
import pandera.pandas as pa
from pandera.pandas import Column, Check, DataFrameSchema
from pandera.errors import SchemaError, SchemaErrors

logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# 1. OHLCV Data Contract
# ---------------------------------------------------------
OHLCV_SCHEMA = DataFrameSchema(
    columns={
        "open": Column(float, Check.gt(0), nullable=False, required=True),
        "high": Column(float, Check.gt(0), nullable=False, required=True),
        "low": Column(float, Check.gt(0), nullable=False, required=True),
        "close": Column(float, Check.gt(0), nullable=False, required=True),
        "volume": Column(float, Check.ge(0), nullable=True, required=False),
        "adj_close": Column(float, Check.gt(0), nullable=True, required=False),
    },
    checks=[
        Check(
            lambda df: (df["high"] >= df["low"] - 1e-5).all(),
            name="high_ge_low",
            error="High must be greater than or equal to Low",
        ),
        Check(
            lambda df: (df["high"] >= df["open"] - 1e-5).all(),
            name="high_ge_open",
            error="High must be greater than or equal to Open",
        ),
        Check(
            lambda df: (df["high"] >= df["close"] - 1e-5).all(),
            name="high_ge_close",
            error="High must be greater than or equal to Close",
        ),
        Check(
            lambda df: (df["low"] <= df["open"] + 1e-5).all(),
            name="low_le_open",
            error="Low must be less than or equal to Open",
        ),
        Check(
            lambda df: (df["low"] <= df["close"] + 1e-5).all(),
            name="low_le_close",
            error="Low must be less than or equal to Close",
        ),
    ],
    coerce=True,
    strict=False,  # Allow extra metadata columns (e.g., date, symbol)
)


def validate_ohlcv_dataframe(
    df: pd.DataFrame,
    strict: bool = False,
    preserve_original_columns: bool = False,
) -> pd.DataFrame:
    """
    Validates OHLCV DataFrame against OHLCV_SCHEMA.
    If strict=True, raises SchemaError on invalid data.
    If strict=False, logs warnings, filters out corrupted rows, and returns clean data.
    If preserve_original_columns=True, retains original column names instead of lowercase.
    """
    if df is None or df.empty:
        return df

    work_df = df.copy()
    work_df.columns = [str(c).lower().replace(" ", "_") for c in work_df.columns]

    if strict:
        validated = OHLCV_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated

    try:
        validated = OHLCV_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated
    except (SchemaError, SchemaErrors) as err:
        logger.warning(f"Data contract validation failed on OHLCV feed: {err}. Sanitizing rows...")
        valid_mask = (
            (work_df["open"] > 0)
            & (work_df["high"] > 0)
            & (work_df["low"] > 0)
            & (work_df["close"] > 0)
            & (work_df["high"] >= work_df["low"] - 1e-5)
            & (work_df["high"] >= work_df["open"] - 1e-5)
            & (work_df["high"] >= work_df["close"] - 1e-5)
            & (work_df["low"] <= work_df["open"] + 1e-5)
            & (work_df["low"] <= work_df["close"] + 1e-5)
        )
        if "volume" in work_df.columns:
            valid_mask = valid_mask & ((work_df["volume"].isna()) | (work_df["volume"] >= 0))

        if preserve_original_columns:
            cleaned = df.loc[valid_mask].copy()
        else:
            cleaned = work_df[valid_mask].copy()
        logger.info(f"Sanitized OHLCV feed: retained {len(cleaned)}/{len(work_df)} rows.")
        return cleaned


# ---------------------------------------------------------
# 2. Daily Indicators Data Contract
# ---------------------------------------------------------
DAILY_INDICATOR_SCHEMA = DataFrameSchema(
    columns={
        "rsi_14": Column(float, Check.in_range(0.0, 100.0), nullable=True, required=False),
        "atr_14": Column(float, Check.ge(0.0), nullable=True, required=False),
        "volume_ratio": Column(float, Check.ge(0.0), nullable=True, required=False),
        "ema_20": Column(float, nullable=True, required=False),
        "ema_50": Column(float, nullable=True, required=False),
        "ema_200": Column(float, nullable=True, required=False),
        "macd": Column(float, nullable=True, required=False),
        "macd_signal": Column(float, nullable=True, required=False),
        "bb_upper": Column(float, nullable=True, required=False),
        "bb_middle": Column(float, nullable=True, required=False),
        "bb_lower": Column(float, nullable=True, required=False),
        "high_52w": Column(float, Check.gt(0.0), nullable=True, required=False),
        "low_52w": Column(float, Check.gt(0.0), nullable=True, required=False),
    },
    checks=[
        Check(
            lambda df: (
                (df["bb_upper"].isna())
                | (df["bb_lower"].isna())
                | (df["bb_upper"] >= df["bb_lower"] - 1e-5)
            ).all(),
            name="bb_upper_ge_lower",
            error="Bollinger Band Upper must be >= Lower",
        ),
        Check(
            lambda df: (
                (df["high_52w"].isna())
                | (df["low_52w"].isna())
                | (df["high_52w"] >= df["low_52w"] - 1e-5)
            ).all(),
            name="high_52w_ge_low_52w",
            error="52-Week High must be >= 52-Week Low",
        ),
    ],
    coerce=True,
    strict=False,
)


def validate_indicators_dataframe(
    df: pd.DataFrame,
    strict: bool = False,
    preserve_original_columns: bool = False,
) -> pd.DataFrame:
    """
    Validates Indicator DataFrame against DAILY_INDICATOR_SCHEMA.
    """
    if df is None or df.empty:
        return df

    work_df = df.copy()
    work_df.columns = [str(c).lower().replace(" ", "_") for c in work_df.columns]

    if strict:
        validated = DAILY_INDICATOR_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated

    try:
        validated = DAILY_INDICATOR_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated
    except (SchemaError, SchemaErrors) as err:
        logger.warning(f"Indicator contract check note: {err}. Applying clamp corrections...")
        if "rsi_14" in work_df.columns:
            work_df["rsi_14"] = work_df["rsi_14"].clip(lower=0.0, upper=100.0)
        return df.copy() if preserve_original_columns else work_df


# ---------------------------------------------------------
# 3. Stock Movement Data Contract
# ---------------------------------------------------------
STOCK_MOVEMENT_SCHEMA = DataFrameSchema(
    columns={
        "direction": Column(
            str,
            Check.isin(["UP", "DOWN", "FLAT"]),
            nullable=False,
            required=True,
        ),
        "change_amount": Column(float, nullable=True, required=False),
        "change_pct": Column(float, nullable=True, required=False),
    },
    coerce=True,
    strict=False,
)


def validate_movements_dataframe(
    df: pd.DataFrame,
    strict: bool = False,
    preserve_original_columns: bool = False,
) -> pd.DataFrame:
    """Validates Stock Movements DataFrame."""
    if df is None or df.empty:
        return df
    work_df = df.copy()
    work_df.columns = [str(c).lower().replace(" ", "_") for c in work_df.columns]
    if strict:
        validated = STOCK_MOVEMENT_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated
    return df if preserve_original_columns else work_df


# ---------------------------------------------------------
# 4. Long Equity Trade Signal Data Contract
# ---------------------------------------------------------
TRADE_SIGNAL_SCHEMA = DataFrameSchema(
    columns={
        "entry_price": Column(float, Check.gt(0.0), nullable=False, required=True),
        "stop_loss": Column(float, Check.gt(0.0), nullable=True, required=False),
        "target_1": Column(float, Check.gt(0.0), nullable=True, required=False),
        "risk_reward_ratio": Column(float, Check.ge(0.0), nullable=True, required=False),
    },
    checks=[
        Check(
            lambda df: (
                (df["stop_loss"].isna()) | (df["stop_loss"] < df["entry_price"])
            ).all(),
            name="stop_loss_below_entry",
            error="Spot long trade stop_loss must be below entry_price",
        ),
        Check(
            lambda df: (
                (df["target_1"].isna()) | (df["target_1"] > df["entry_price"])
            ).all(),
            name="target_above_entry",
            error="Spot long trade target_1 must be above entry_price",
        ),
    ],
    coerce=True,
    strict=False,
)


def validate_trade_signals_dataframe(
    df: pd.DataFrame,
    strict: bool = False,
    preserve_original_columns: bool = False,
) -> pd.DataFrame:
    """
    Validates Spot Long Trade Signals DataFrame.
    Filters out inverted setups if strict=False.
    """
    if df is None or df.empty:
        return df

    # Map possible alternative column names (e.g. Target -> target_1)
    work_df = df.copy()
    work_df.columns = [str(c).lower().replace(" ", "_") for c in work_df.columns]
    if "target" in work_df.columns and "target_1" not in work_df.columns:
        work_df["target_1"] = work_df["target"]
    if "r:r_ratio" in work_df.columns and "risk_reward_ratio" not in work_df.columns:
        work_df["risk_reward_ratio"] = work_df["r:r_ratio"]

    if strict:
        validated = TRADE_SIGNAL_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated

    try:
        validated = TRADE_SIGNAL_SCHEMA.validate(work_df)
        return df.loc[validated.index].copy() if preserve_original_columns else validated
    except (SchemaError, SchemaErrors) as err:
        logger.warning(f"Trade signal contract violation: {err}. Filtering inverted setups...")
        valid_mask = (work_df["entry_price"] > 0)
        if "stop_loss" in work_df.columns:
            valid_mask = valid_mask & ((work_df["stop_loss"].isna()) | (work_df["stop_loss"] < work_df["entry_price"]))
        if "target_1" in work_df.columns:
            valid_mask = valid_mask & ((work_df["target_1"].isna()) | (work_df["target_1"] > work_df["entry_price"]))
        
        if preserve_original_columns:
            return df.loc[valid_mask].copy()
        return work_df[valid_mask].copy()
