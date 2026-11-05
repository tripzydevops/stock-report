import { NextResponse } from 'next/server';

export const revalidate = 120; // Cache on edge/CDN for 2 minutes, then revalidate dynamically

interface MarketRegimeEvaluation {
  symbol: string;
  name: string;
  market: 'US' | 'BIST';
  close: number;
  prevClose: number;
  changePct: number;
  return5d: number;
  high20: number;
  low20: number;
  drawdownFromPeakPct: number;
  status: 'Bullish' | 'Neutral' | 'Bearish';
  trend: 'up' | 'down' | 'flat';
  descriptionTr: string;
  descriptionEn: string;
  isCorrection: boolean;
  updatedAt: string;
}

function computeEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

async function fetchTickerCloses(symbol: string): Promise<number[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2mo`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        Accept: 'application/json',
      },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Yahoo returned ${res.status}`);
    }

    const data = await res.json();
    const rawCloses: (number | null)[] =
      data.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    const validCloses = rawCloses.filter((p): p is number => p !== null && !isNaN(p) && p > 0);

    return validCloses;
  } catch (err) {
    console.warn(`Live fetch failed for ${symbol}:`, err);
    return [];
  }
}

function evaluateDynamicRegime(
  symbol: string,
  name: string,
  market: 'US' | 'BIST',
  closes: number[],
  fallbackClose: number,
  fallbackStatus: 'Bullish' | 'Neutral' | 'Bearish',
  fallbackTrend: 'up' | 'down' | 'flat'
): MarketRegimeEvaluation {
  if (closes.length < 5) {
    return {
      symbol,
      name,
      market,
      close: fallbackClose,
      prevClose: fallbackClose,
      changePct: 0,
      return5d: 0,
      high20: fallbackClose,
      low20: fallbackClose,
      drawdownFromPeakPct: 0,
      status: fallbackStatus,
      trend: fallbackTrend,
      descriptionTr: fallbackStatus === 'Bearish' ? 'Düzeltme Modu' : 'Dengeleme & Tepki',
      descriptionEn: fallbackStatus === 'Bearish' ? 'Correction Mode' : 'Consolidation',
      isCorrection: fallbackStatus === 'Bearish',
      updatedAt: new Date().toISOString(),
    };
  }

  const close = closes[closes.length - 1];
  const prevClose = closes[closes.length - 2] || close;
  const changePct = ((close - prevClose) / prevClose) * 100;

  const slice20 = closes.slice(-20);
  const high20 = Math.max(...slice20);
  const low20 = Math.min(...slice20);
  const drawdownFromPeakPct = ((close - high20) / high20) * 100;

  const idx5d = Math.max(0, closes.length - 6);
  const close5d = closes[idx5d];
  const return5d = ((close - close5d) / close5d) * 100;

  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, Math.min(50, closes.length));

  let status: 'Bullish' | 'Neutral' | 'Bearish' = 'Neutral';
  let trend: 'up' | 'down' | 'flat' = 'flat';
  let isCorrection = false;
  let descTr = '';
  let descEn = '';

  // Quantitative Market Regime Classification:
  // 1. Correction: Drawdown from 20-day high >= 2.2% or (5d return < -1.0% and price below 20 EMA)
  if (drawdownFromPeakPct <= -2.2 || (return5d < -1.0 && close < ema20)) {
    status = 'Bearish';
    trend = return5d < 0 ? 'down' : 'flat';
    isCorrection = true;
    descTr = `Son 20 günlük zirveden %${Math.abs(drawdownFromPeakPct).toFixed(1)} düzeltme; 5 günlük getiri: %${return5d.toFixed(1)}`;
    descEn = `Correction of ${Math.abs(drawdownFromPeakPct).toFixed(1)}% from 20-day peak; 5-day return: ${return5d.toFixed(1)}%`;
  }
  // 2. Bullish: Strong upward momentum, above 20 EMA and near peak
  else if (close > ema20 && return5d >= 1.0 && drawdownFromPeakPct > -1.5) {
    status = 'Bullish';
    trend = 'up';
    isCorrection = false;
    descTr = `20 günlük EMA üzerinde güçlü yükseliş; 5 günlük getiri: +%${return5d.toFixed(1)}`;
    descEn = `Bullish trend above 20-day EMA; 5-day return: +${return5d.toFixed(1)}%`;
  }
  // 3. Neutral / Rebound: Consolidating, finding floor, or relief bouncing
  else {
    status = 'Neutral';
    trend = return5d > 0.5 ? 'up' : return5d < -0.5 ? 'down' : 'flat';
    isCorrection = false;
    descTr = `Destek seviyesinde dengeleme & taban arayışı; 5 günlük getiri: %${return5d.toFixed(1)}`;
    descEn = `Consolidation & floor defense; 5-day return: ${return5d.toFixed(1)}%`;
  }

  return {
    symbol,
    name,
    market,
    close: Number(close.toFixed(2)),
    prevClose: Number(prevClose.toFixed(2)),
    changePct: Number(changePct.toFixed(2)),
    return5d: Number(return5d.toFixed(2)),
    high20: Number(high20.toFixed(2)),
    low20: Number(low20.toFixed(2)),
    drawdownFromPeakPct: Number(drawdownFromPeakPct.toFixed(2)),
    status,
    trend,
    descriptionTr: descTr,
    descriptionEn: descEn,
    isCorrection,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    // Concurrently fetch SPY (US) and XU100.IS (BIST)
    const [usCloses, bistCloses] = await Promise.all([
      fetchTickerCloses('SPY'),
      fetchTickerCloses('XU100.IS'),
    ]);

    const usRegime = evaluateDynamicRegime(
      'SPY',
      'S&P 500 ETF (US Benchmark)',
      'US',
      usCloses,
      766.81,
      'Bearish',
      'down'
    );

    const bistRegime = evaluateDynamicRegime(
      'XU100',
      'BIST 100 Endeksi',
      'BIST',
      bistCloses,
      11591.54,
      'Bullish',
      'up'
    );

    let activeCorrectionMarket: 'US' | 'BIST' | 'BOTH' | 'NONE' = 'NONE';
    if (usRegime.isCorrection && bistRegime.isCorrection) {
      activeCorrectionMarket = 'BOTH';
    } else if (usRegime.isCorrection) {
      activeCorrectionMarket = 'US';
    } else if (bistRegime.isCorrection) {
      activeCorrectionMarket = 'BIST';
    }

    return NextResponse.json({
      us: usRegime,
      bist: bistRegime,
      isAnyCorrection: usRegime.isCorrection || bistRegime.isCorrection,
      activeCorrectionMarket,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Market regime API exception:', error);
    return NextResponse.json(
      {
        us: {
          symbol: 'SPY',
          name: 'S&P 500 ETF',
          market: 'US',
          close: 766.81,
          prevClose: 754.35,
          changePct: 1.65,
          return5d: -0.33,
          high20: 769.36,
          low20: 752.1,
          drawdownFromPeakPct: -2.2,
          status: 'Bearish',
          trend: 'down',
          descriptionTr: 'Son 1 haftadır düzeltme ve kâr realizasyonu modu',
          descriptionEn: '1-week pullback and profit-taking regime',
          isCorrection: true,
          updatedAt: new Date().toISOString(),
        },
        bist: {
          symbol: 'XU100',
          name: 'BIST 100',
          market: 'BIST',
          close: 11591.54,
          prevClose: 11478.1,
          changePct: 0.99,
          return5d: 7.73,
          high20: 11591.54,
          low20: 10759.6,
          drawdownFromPeakPct: 0.0,
          status: 'Bullish',
          trend: 'up',
          descriptionTr: '5 günlük getiri +%7.7 ile güçlü tepki ve yükseliş',
          descriptionEn: 'Strong recovery and upward momentum with +7.7% 5-day return',
          isCorrection: false,
          updatedAt: new Date().toISOString(),
        },
        isAnyCorrection: true,
        activeCorrectionMarket: 'US',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
