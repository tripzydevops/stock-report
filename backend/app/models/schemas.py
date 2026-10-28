from enum import Enum
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

class AssetClass(str, Enum):
    stock = "stock"
    etf = "etf"
    fund = "fund"

class Market(str, Enum):
    US = "US"
    BIST = "BIST"
    TEFAS = "TEFAS"
    GLOBAL = "GLOBAL"

class Currency(str, Enum):
    USD = "USD"
    TRY = "TRY"
    EUR = "EUR"

class SignalStatus(str, Enum):
    open = "open"
    target_hit = "target_hit"
    stopped_out = "stopped_out"
    expired = "expired"
    invalidated = "invalidated"

class MarketRegimeStatus(str, Enum):
    bullish = "bullish"
    neutral = "neutral"
    bearish = "bearish"

class StrategyName(str, Enum):
    momentum_breakout = "momentum_breakout"
    trend_pullback = "trend_pullback"
    volatility_squeeze = "volatility_squeeze"
    fund_momentum = "fund_momentum"
    mean_reversion = "mean_reversion"
    anchored_vwap_bounce = "anchored_vwap_bounce"
    liquidity_sweep_reclaim = "liquidity_sweep_reclaim"
    relative_strength_divergence = "relative_strength_divergence"

class AssetCreate(BaseModel):
    symbol: str = Field(max_length=20)
    name: str
    asset_class: AssetClass
    market: Market
    currency: Currency = Currency.USD
    sector: str | None = None

    @field_validator("symbol")
    @classmethod
    def format_symbol(cls, v: str) -> str:
        return v.strip().upper()

class AssetResponse(AssetCreate):
    id: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PriceBar(BaseModel):
    date: date
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float
    adj_close: float | None = None
    volume: int | None = None
    model_config = ConfigDict(from_attributes=True)

class IndicatorSnapshot(BaseModel):
    date: date
    ema_20: float | None = None
    ema_50: float | None = None
    ema_200: float | None = None
    rsi_14: float | None = None
    atr_14: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    macd_histogram: float | None = None
    bb_upper: float | None = None
    bb_middle: float | None = None
    bb_lower: float | None = None
    kc_upper: float | None = None
    kc_lower: float | None = None
    volume_ratio: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    model_config = ConfigDict(from_attributes=True)

class TradeSignalCreate(BaseModel):
    asset_id: str
    strategy: StrategyName
    signal_date: date
    entry_price: float
    stop_loss: float | None = None
    target_1: float | None = None
    target_2: float | None = None
    risk_reward_ratio: float | None = None
    confidence_score: float | None = Field(None, ge=1.0, le=10.0)
    ai_rationale: str | None = None
    model_config = ConfigDict(from_attributes=True)

class TradeCard(BaseModel):
    """The complete trade recommendation card shown to user"""
    asset: AssetResponse
    signal: TradeSignalCreate
    indicators: IndicatorSnapshot
    market_regime: MarketRegimeStatus
    position_size_shares: int | None = None
    position_size_value: float | None = None
    risk_amount: float | None = None
    model_config = ConfigDict(from_attributes=True)

class MarketRegimeResponse(BaseModel):
    market: Market
    date: date
    regime: MarketRegimeStatus
    index_close: float
    ema_50: float
    ema_200: float
    notes: str | None = None
    model_config = ConfigDict(from_attributes=True)

class RiskCalculation(BaseModel):
    account_size: float
    risk_pct: float
    entry_price: float
    stop_loss: float
    currency: Currency
    risk_amount: float | None = None
    shares_to_buy: int | None = None
    position_value: float | None = None
    model_config = ConfigDict(from_attributes=True)

class DailyScanResult(BaseModel):
    scan_date: date
    us_regime: MarketRegimeResponse | None = None
    bist_regime: MarketRegimeResponse | None = None
    trade_cards: list[TradeCard] = Field(default_factory=list)
    assets_scanned: int = 0
    signals_found: int = 0
    model_config = ConfigDict(from_attributes=True)

class ReportFileResponse(BaseModel):
    id: str
    report_type: str
    storage_path: str
    trading_date: date
    generated_at: datetime
    file_size_bytes: int | None = None
    row_count: int | None = None
    checksum_sha256: str | None = None
    is_latest: bool
    download_url: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class PriceSnapshotCreate(BaseModel):
    asset_id: str
    snapshot_time: datetime
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None
    source: str = "marketpulse_daily"

class PriceSnapshotResponse(PriceSnapshotCreate):
    id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class StockMovementResponse(BaseModel):
    id: str
    asset_id: str
    symbol: str | None = None
    name: str | None = None
    market: str | None = None
    movement_time: datetime
    direction: str | None = None
    change_amount: float | None = None
    change_pct: float | None = None
    signal: str | None = None
    score: float | None = None
    metadata: dict | None = None
    report_file_id: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class BacktestConfig(BaseModel):
    initial_capital: float = 100_000.0
    commission_bps: float = 10.0  # 10 bps = 0.10% per leg
    slippage_bps: float = 5.0     # 5 bps = 0.05% per leg
    risk_per_trade_pct: float = 1.0  # 1% equity risk per trade
    max_open_positions: int = 10
    max_hold_days: int = 20
    risk_free_rate: float = 0.04  # 4% annual risk-free rate
    model_config = ConfigDict(from_attributes=True)

class BacktestTradeLog(BaseModel):
    symbol: str
    strategy: str
    entry_date: str
    entry_price: float
    exit_date: str | None = None
    exit_price: float
    shares: int
    position_value: float
    pnl: float
    pnl_pct: float
    fees: float
    days_held: int
    outcome: str  # WIN, LOSS, OPEN
    exit_reason: str  # TARGET_HIT, STOPPED_OUT, EXPIRED, ACTIVE
    model_config = ConfigDict(from_attributes=True)

class BacktestEquityPoint(BaseModel):
    date: str
    equity: float
    cash: float
    positions_value: float
    drawdown_pct: float
    model_config = ConfigDict(from_attributes=True)

class BacktestResult(BaseModel):
    config: BacktestConfig
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    profit_factor: float
    expectancy: float
    initial_capital: float
    final_equity: float
    total_return_pct: float
    cagr_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    avg_trade_pnl_pct: float
    avg_holding_days: float
    equity_curve: list[BacktestEquityPoint] = []
    trades: list[BacktestTradeLog] = []
    strategy_breakdown: dict[str, dict[str, Any]] = {}
    model_config = ConfigDict(from_attributes=True)

