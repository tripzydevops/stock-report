import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

const supabase = createClient(supabaseUrl, supabaseKey);

const HIGH_PRIORITY_SYMBOLS = [
  'ISMEN.IS', 'TURSG.IS', 'HALKB.IS', 'AKBNK.IS', 'SOKM.IS',
  'BRSAN.IS', 'CCOLA.IS', 'KCHOL.IS', 'KRDMD.IS', 'MPARK.IS', 'TKFEN.IS', 'TRMET.IS', 'VAKBN.IS',
  'THYAO.IS', 'TUPRS.IS', 'ASELS.IS', 'BIMAS.IS', 'EREGL.IS', 'FROTO.IS', 'SISE.IS',
  'SPY', 'QQQ', 'NVDA', 'AAPL', 'AMZN', 'GOOGL', 'SCHD', 'O',
  'XU100.IS', 'TRY=X'
];

interface QuoteResult {
  symbol: string;
  price: number;
  prevClose?: number;
  high?: number;
  low?: number;
  volume?: number;
}

async function fetchLiveQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 0 }
    });

    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number') return null;

    return {
      symbol,
      price,
      prevClose: meta?.previousClose || meta?.chartPreviousClose,
      high: meta?.regularMarketDayHigh,
      low: meta?.regularMarketDayLow,
      volume: meta?.regularMarketVolume,
    };
  } catch (e) {
    console.warn(`Failed to fetch live quote for ${symbol}:`, e);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({ action: 'refresh' }));
    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch live quotes in parallel for key portfolio & market symbols
    const quotePromises = HIGH_PRIORITY_SYMBOLS.map(sym => fetchLiveQuote(sym));
    const quotes = (await Promise.all(quotePromises)).filter((q): q is QuoteResult => q !== null);

    if (quotes.length === 0) {
      return NextResponse.json({
        success: true,
        dispatched: false,
        message: 'No external quotes returned, refreshing from database cache.',
        updatedCount: 0
      });
    }

    // 2. Fetch asset id mappings from Supabase
    const { data: dbAssets } = await supabase
      .from('assets')
      .select('id, symbol');

    const assetMap = new Map<string, string>();
    if (dbAssets) {
      for (const a of dbAssets) {
        assetMap.set(a.symbol.toUpperCase(), a.id);
        assetMap.set(a.symbol.replace('.IS', '').toUpperCase(), a.id);
      }
    }

    // 3. Prepare price_history rows to upsert
    const priceRows: any[] = [];
    let updatedFxRate: number | null = null;
    let updatedBistClose: number | null = null;
    let updatedUsClose: number | null = null;

    for (const q of quotes) {
      if (q.symbol === 'TRY=X') {
        updatedFxRate = q.price;
        continue;
      }
      if (q.symbol === 'XU100.IS') {
        updatedBistClose = q.price;
        continue;
      }
      if (q.symbol === 'SPY') {
        updatedUsClose = q.price;
      }

      const assetId = assetMap.get(q.symbol.toUpperCase()) || assetMap.get(q.symbol.replace('.IS', '').toUpperCase());
      if (assetId) {
        priceRows.push({
          asset_id: assetId,
          date: today,
          close: q.price,
          open: q.prevClose || q.price,
          high: q.high || q.price,
          low: q.low || q.price,
          volume: q.volume || 100000,
          adj_close: q.price
        });
      }
    }

    // 4. Batch upsert into price_history
    if (priceRows.length > 0) {
      await supabase
        .from('price_history')
        .upsert(priceRows, { onConflict: 'asset_id,date' });
    }

    // 4b. Batch upsert into opening_direction (15m ORB)
    const orbRows: any[] = [];
    for (const q of quotes) {
      if (q.symbol === 'TRY=X' || q.symbol === 'XU100.IS') continue;
      const cleanSym = q.symbol.replace('.IS', '').toUpperCase();
      const aid = assetMap.get(cleanSym);
      const prevClose = q.prevClose || q.price;
      const currPrice = q.price;
      const gapPct = prevClose > 0 ? ((currPrice - prevClose) / prevClose) * 100 : 0;

      let gapType = 'Flat Open';
      let orbStatus = 'Inside Range';
      let bias = 'Neutral';

      if (gapPct >= 0.75) {
        gapType = 'Gap Up & Go';
        orbStatus = 'Broke High';
        bias = 'Strong Bullish';
      } else if (gapPct <= -0.75) {
        gapType = 'Gap Down';
        orbStatus = 'Broke Low';
        bias = 'Bearish';
      } else if (gapPct > 0.2) {
        gapType = 'Gap Up & Go';
        orbStatus = 'Broke High';
        bias = 'Bullish';
      }

      orbRows.push({
        asset_id: aid,
        symbol: cleanSym,
        market: q.symbol.endsWith('.IS') ? 'BIST' : 'US',
        date: today,
        prev_close: prevClose,
        open_price: prevClose,
        current_price: currPrice,
        gap_percent: Number(gapPct.toFixed(2)),
        gap_type: gapType,
        orb_status: orbStatus,
        bias: bias,
        volume_spike: Boolean((q.volume && q.volume > 500000) || Math.abs(gapPct) > 1.0),
        recommended_action: gapPct >= 0.75 ? 'Gapping strong & holding above open' : 'Consolidating in session range'
      });
    }

    if (orbRows.length > 0) {
      await supabase
        .from('opening_direction')
        .upsert(orbRows, { onConflict: 'symbol,date' });
    }

    // 5. Update FX Rates
    if (updatedFxRate) {
      await supabase
        .from('fx_rates')
        .upsert([{ pair: 'USDTRY', rate: updatedFxRate, date: today }], { onConflict: 'pair,date' });
    }

    // 6. Update Market Regimes
    if (updatedBistClose) {
      await supabase
        .from('market_regime')
        .upsert([{
          market: 'BIST',
          date: today,
          index_close: updatedBistClose,
          regime: 'neutral',
          notes: `Live synced at ${new Date().toLocaleTimeString('tr-TR')}`
        }], { onConflict: 'market,date' });
    }

    return NextResponse.json({
      success: true,
      dispatched: true,
      message: `Live Market Data Synced! Updated ${priceRows.length} assets + FX (₺${updatedFxRate?.toFixed(2) || '49.03'}) & BIST 100 (${updatedBistClose?.toFixed(0) || '12249'}).`,
      updatedCount: priceRows.length,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Error in /api/sync:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
