import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

const supabase = createClient(supabaseUrl, supabaseKey);

export interface FactorOutputItem {
  symbol: string;
  percentile_rank: number;
  composite_z: number;
  ret_1m_pct: number;
  ret_3m_pct: number;
  vol_surge: number;
  realized_vol_pct: number;
  bb_z_score: number;
  rsi: number;
  factor_tier: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const minPercentileStr = searchParams.get('min_percentile');
    const minPercentile = minPercentileStr ? parseFloat(minPercentileStr) : null;

    // 1. Fetch all active assets from Supabase
    const { data: assets, error: assetErr } = await supabase
      .from('assets')
      .select('id, symbol, name')
      .eq('is_active', true);

    if (assetErr || !assets || assets.length === 0) {
      return NextResponse.json({ status: 'error', message: 'No active assets found' }, { status: 500 });
    }

    const idToSym: Record<string, string> = {};
    assets.forEach(a => { idToSym[a.id] = a.symbol; });

    // 2. Fetch price history bars for active assets
    const { data: priceHistory, error: phErr } = await supabase
      .from('price_history')
      .select('asset_id, close, volume, date')
      .order('date', { ascending: true });

    if (phErr || !priceHistory) {
      return NextResponse.json({ status: 'error', message: 'Failed to fetch price history' }, { status: 500 });
    }

    // Group price bars by symbol
    const barsBySym: Record<string, { close: number; volume: number; date: string }[]> = {};
    priceHistory.forEach(bar => {
      const sym = idToSym[bar.asset_id];
      if (!sym) return;
      if (!barsBySym[sym]) barsBySym[sym] = [];
      barsBySym[sym].push({
        close: Number(bar.close),
        volume: Number(bar.volume || 0),
        date: bar.date
      });
    });

    // 3. Compute raw factors for each symbol
    const rawMetrics: {
      symbol: string;
      ret_1m: number;
      ret_3m: number;
      vol_surge: number;
      trend_quality: number;
      bb_z_score: number;
      rsi: number;
      realized_vol: number;
    }[] = [];

    for (const [sym, bars] of Object.entries(barsBySym)) {
      if (bars.length < 2) continue;

      const closes = bars.map(b => b.close);
      const volumes = bars.map(b => b.volume);
      const lastClose = closes[closes.length - 1];

      // 1-month momentum (~21 bars or max available)
      const p1mIdx = Math.max(0, closes.length - 22);
      const ret_1m = (lastClose / closes[p1mIdx]) - 1.0;

      // 3-month momentum (~63 bars or max available)
      const p3mIdx = Math.max(0, closes.length - 64);
      const ret_3m = (lastClose / closes[p3mIdx]) - 1.0;

      // Volume surge (last vs 20-day mean)
      const recentVols = volumes.slice(-20);
      const avgVol = recentVols.length > 0 ? recentVols.reduce((a, b) => a + b, 0) / recentVols.length : 1;
      const lastVol = volumes[volumes.length - 1] || avgVol;
      const vol_surge = avgVol > 0 ? lastVol / avgVol : 1.0;

      // Realized volatility (20-day daily return standard deviation * sqrt(252))
      const dailyRets: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        if (closes[i - 1] > 0) {
          dailyRets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
        }
      }
      const recentRets = dailyRets.slice(-20);
      let realized_vol = 0.25;
      if (recentRets.length >= 2) {
        const meanRet = recentRets.reduce((a, b) => a + b, 0) / recentRets.length;
        const variance = recentRets.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) / (recentRets.length - 1);
        realized_vol = Math.sqrt(variance) * Math.sqrt(252);
      }
      if (realized_vol < 0.05) realized_vol = 0.05;

      const trend_quality = realized_vol > 0 ? ret_1m / realized_vol : 0;

      // Bollinger / SMA dislocation
      const recentCloses = closes.slice(-20);
      const meanClose = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length;
      let bb_z_score = 0;
      if (recentCloses.length >= 2) {
        const varClose = recentCloses.reduce((acc, c) => acc + Math.pow(c - meanClose, 2), 0) / (recentCloses.length - 1);
        const stdClose = Math.sqrt(varClose);
        if (stdClose > 0) bb_z_score = (lastClose - meanClose) / stdClose;
      }

      // Synthetic/approx RSI
      let rsi = 50.0;
      if (dailyRets.length >= 14) {
        const rsiRets = dailyRets.slice(-14);
        let gains = 0;
        let losses = 0;
        rsiRets.forEach(r => {
          if (r > 0) gains += r;
          else losses += Math.abs(r);
        });
        if (losses === 0) rsi = 100.0;
        else {
          const rs = gains / losses;
          rsi = 100.0 - (100.0 / (1.0 + rs));
        }
      }

      rawMetrics.push({
        symbol: sym.replace('.IS', ''),
        ret_1m,
        ret_3m,
        vol_surge,
        trend_quality,
        bb_z_score,
        rsi,
        realized_vol
      });
    }

    if (rawMetrics.length === 0) {
      return NextResponse.json({ status: 'success', assets_evaluated: 0, rankings: [] });
    }

    // Helper for Z-score standardisation across universe
    const calcZScores = (values: number[]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / Math.max(1, values.length - 1);
      const std = Math.sqrt(variance);
      return values.map(v => std > 0 ? (v - mean) / std : 0);
    };

    const ret1mZ = calcZScores(rawMetrics.map(m => m.ret_1m));
    const ret3mZ = calcZScores(rawMetrics.map(m => m.ret_3m));
    const volSurgeZ = calcZScores(rawMetrics.map(m => m.vol_surge));
    const trendZ = calcZScores(rawMetrics.map(m => m.trend_quality));

    // Calculate composite Z score: 40% 1M + 20% 3M + 20% Vol Surge + 20% Trend
    const compositeScores = rawMetrics.map((_, i) => (
      0.40 * ret1mZ[i] +
      0.20 * ret3mZ[i] +
      0.20 * volSurgeZ[i] +
      0.20 * trendZ[i]
    ));

    // Sort by composite score descending to compute percentile rank
    const sortedIndices = compositeScores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => a.score - b.score); // Ascending for rank calculation

    const totalCount = sortedIndices.length;
    const percentileRanks = new Array<number>(totalCount);

    sortedIndices.forEach((item, rank) => {
      // 1 to N rank converted to percentile (100 is top)
      percentileRanks[item.idx] = ((rank + 1) / totalCount) * 100.0;
    });

    // Form final items
    let rankings: FactorOutputItem[] = rawMetrics.map((m, i) => {
      const pct = percentileRanks[i];
      const compZ = compositeScores[i];

      let tier = "Tier-3 Neutral Core (Piyasa Dengesi)";
      if (pct >= 90) {
        tier = "Tier-1 Top Decile (Kurumsal Akümülasyon)";
      } else if (pct >= 75) {
        tier = "Tier-2 Outperforming Momentum (Güçlü Lider)";
      } else if (pct <= 15) {
        tier = "Tier-5 Deep Laggard (Dipte / Zayıf Akış)";
      } else if (pct <= 30) {
        tier = "Tier-4 Laggard (Satış Baskısında)";
      }

      return {
        symbol: m.symbol,
        percentile_rank: Number(pct.toFixed(1)),
        composite_z: Number(compZ.toFixed(2)),
        ret_1m_pct: Number((m.ret_1m * 100).toFixed(1)),
        ret_3m_pct: Number((m.ret_3m * 100).toFixed(1)),
        vol_surge: Number(m.vol_surge.toFixed(2)),
        realized_vol_pct: Number((m.realized_vol * 100).toFixed(1)),
        bb_z_score: Number(m.bb_z_score.toFixed(2)),
        rsi: Number(m.rsi.toFixed(1)),
        factor_tier: tier
      };
    });

    // Sort descending by percentile rank
    rankings.sort((a, b) => b.percentile_rank - a.percentile_rank);

    if (minPercentile !== null && !isNaN(minPercentile)) {
      rankings = rankings.filter(r => r.percentile_rank >= minPercentile);
    }

    return NextResponse.json({
      status: 'success',
      assets_evaluated: rankings.length,
      rankings
    });
  } catch (error: any) {
    console.error('Error computing factors route:', error);
    return NextResponse.json({ status: 'error', message: error?.message || 'Server error' }, { status: 500 });
  }
}
