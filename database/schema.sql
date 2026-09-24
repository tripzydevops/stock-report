-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. assets table
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    asset_class VARCHAR(20) NOT NULL CHECK (asset_class IN ('stock', 'etf', 'fund')),
    market VARCHAR(20) NOT NULL CHECK (market IN ('US', 'BIST', 'TEFAS', 'GLOBAL')),
    currency VARCHAR(5) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'TRY', 'EUR')),
    sector VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for assets
DROP TRIGGER IF EXISTS update_assets_modtime ON assets;
CREATE TRIGGER update_assets_modtime
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. price_history table
CREATE TABLE IF NOT EXISTS price_history (
    id BIGSERIAL PRIMARY KEY,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    open NUMERIC(18,6),
    high NUMERIC(18,6),
    low NUMERIC(18,6),
    close NUMERIC(18,6) NOT NULL,
    adj_close NUMERIC(18,6),
    volume BIGINT,
    UNIQUE (asset_id, date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_asset_id_date ON price_history (asset_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history (date DESC);

-- 3. daily_indicators table
CREATE TABLE IF NOT EXISTS daily_indicators (
    id BIGSERIAL PRIMARY KEY,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    ema_20 NUMERIC(18,6),
    ema_50 NUMERIC(18,6),
    ema_200 NUMERIC(18,6),
    rsi_14 NUMERIC(8,4),
    atr_14 NUMERIC(18,6),
    macd NUMERIC(18,6),
    macd_signal NUMERIC(18,6),
    macd_histogram NUMERIC(18,6),
    bb_upper NUMERIC(18,6),
    bb_middle NUMERIC(18,6),
    bb_lower NUMERIC(18,6),
    kc_upper NUMERIC(18,6),
    kc_lower NUMERIC(18,6),
    volume_ratio NUMERIC(8,4),
    high_52w NUMERIC(18,6),
    low_52w NUMERIC(18,6),
    UNIQUE (asset_id, date)
);

-- 4. trade_signals table
CREATE TABLE IF NOT EXISTS trade_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    strategy VARCHAR(50) NOT NULL,
    signal_date DATE NOT NULL,
    entry_price NUMERIC(18,6) NOT NULL,
    stop_loss NUMERIC(18,6),
    target_1 NUMERIC(18,6),
    target_2 NUMERIC(18,6),
    risk_reward_ratio NUMERIC(8,4),
    confidence_score NUMERIC(5,2),
    ai_rationale TEXT,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'target_hit', 'stopped_out', 'expired', 'invalidated')),
    outcome_pnl_pct NUMERIC(8,4),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_signals_date ON trade_signals (signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_trade_signals_asset_date ON trade_signals (asset_id, signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_trade_signals_status ON trade_signals (status);

-- 5. market_regime table
CREATE TABLE IF NOT EXISTS market_regime (
    id BIGSERIAL PRIMARY KEY,
    market VARCHAR(20) NOT NULL CHECK (market IN ('US', 'BIST')),
    date DATE NOT NULL,
    regime VARCHAR(20) NOT NULL CHECK (regime IN ('bullish', 'neutral', 'bearish')),
    index_close NUMERIC(18,6),
    ema_50 NUMERIC(18,6),
    ema_200 NUMERIC(18,6),
    notes TEXT,
    UNIQUE (market, date)
);

-- 6. fx_rates table
CREATE TABLE IF NOT EXISTS fx_rates (
    id BIGSERIAL PRIMARY KEY,
    pair VARCHAR(10) NOT NULL DEFAULT 'USDTRY' CHECK (pair IN ('USDTRY', 'EURTRY', 'EURUSD')),
    date DATE NOT NULL,
    rate NUMERIC(18,6) NOT NULL,
    UNIQUE (pair, date)
);

-- 7. watchlist_items table
CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    notes TEXT,
    alert_above NUMERIC(18,6),
    alert_below NUMERIC(18,6),
    added_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. portfolio_positions table
CREATE TABLE IF NOT EXISTS portfolio_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    quantity NUMERIC(18,6) NOT NULL,
    avg_entry_price NUMERIC(18,6) NOT NULL,
    entry_date DATE,
    stop_loss NUMERIC(18,6),
    target_price NUMERIC(18,6),
    notes TEXT,
    is_open BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for portfolio_positions
DROP TRIGGER IF EXISTS update_portfolio_positions_modtime ON portfolio_positions;
CREATE TRIGGER update_portfolio_positions_modtime
    BEFORE UPDATE ON portfolio_positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies Setup (Enabling RLS on tables but leaving open for now as no auth spec was provided)
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_regime ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;

-- Note: In a production Supabase app, you should create restrictive policies.
-- For now, allowing all operations for authenticated users or anon as needed.

-- View: v_latest_prices
CREATE OR REPLACE VIEW v_latest_prices AS
SELECT 
    a.id AS asset_id,
    a.symbol,
    a.name,
    a.asset_class,
    a.market,
    a.currency,
    a.sector,
    a.is_active,
    p.date AS latest_date,
    p.open,
    p.high,
    p.low,
    p.close AS latest_price,
    p.adj_close,
    p.volume,
    d.ema_20,
    d.ema_50,
    d.ema_200,
    d.rsi_14,
    d.atr_14,
    d.macd,
    d.macd_signal,
    d.macd_histogram,
    d.bb_upper,
    d.bb_middle,
    d.bb_lower,
    d.volume_ratio,
    d.high_52w,
    d.low_52w
FROM assets a
LEFT JOIN LATERAL (
    SELECT date, open, high, low, close, adj_close, volume
    FROM price_history ph
    WHERE ph.asset_id = a.id
    ORDER BY date DESC
    LIMIT 1
) p ON TRUE
LEFT JOIN LATERAL (
    SELECT ema_20, ema_50, ema_200, rsi_14, atr_14, macd, macd_signal,
           macd_histogram, bb_upper, bb_middle, bb_lower, volume_ratio,
           high_52w, low_52w
    FROM daily_indicators di
    WHERE di.asset_id = a.id
    ORDER BY date DESC
    LIMIT 1
) d ON TRUE
WHERE a.is_active = TRUE;

-- View: v_open_signals
CREATE OR REPLACE VIEW v_open_signals AS
SELECT 
    ts.id AS signal_id,
    ts.strategy,
    ts.signal_date,
    ts.entry_price,
    ts.stop_loss,
    ts.target_1,
    ts.target_2,
    ts.risk_reward_ratio,
    ts.confidence_score,
    ts.ai_rationale,
    a.symbol,
    a.name,
    a.market,
    a.asset_class
FROM trade_signals ts
JOIN assets a ON ts.asset_id = a.id
WHERE ts.status = 'open';
