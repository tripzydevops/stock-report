import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const supabase = createClient(supabaseUrl, supabaseKey);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const calendarPath = path.resolve(__dirname, '../src/data/bist_calendar.json');
let bistHolidays = new Set();
try {
  const calData = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));
  bistHolidays = new Set(Object.keys(calData.full_holidays || {}));
} catch (e) {
  console.warn('Could not read bist_calendar.json, falling back to built-in holiday set');
}

function getBistTradingSessionDate(now = new Date()) {
  const istanbulTimeMs = now.getTime() + 3 * 60 * 60 * 1000;
  const trtDate = new Date(istanbulTimeMs);
  const hour = trtDate.getUTCHours();
  const targetDate = new Date(trtDate);

  if (hour < 10) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  while (
    targetDate.getUTCDay() === 0 ||
    targetDate.getUTCDay() === 6 ||
    bistHolidays.has(targetDate.toISOString().slice(0, 10))
  ) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  return targetDate.toISOString().slice(0, 10);
}

async function fetchQuoteFromTradingView(symbol) {
  try {
    const clean = symbol.replace('.IS', '').toUpperCase();
    const res = await fetch('https://scanner.tradingview.com/turkey/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [`BIST:${clean}`] },
        columns: ['close', 'open', 'high', 'low', 'volume', 'change', 'change_abs']
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json?.data?.[0]?.d;
    if (!d || typeof d[0] !== 'number' || d[0] <= 0) return null;
    return {
      price: d[0],
      sessionDate: getBistTradingSessionDate(),
      open: typeof d[1] === 'number' ? d[1] : null,
      high: typeof d[2] === 'number' ? d[2] : null,
      low: typeof d[3] === 'number' ? d[3] : null,
      volume: typeof d[4] === 'number' ? Math.round(d[4]) : null,
      source: 'tradingview'
    };
  } catch {
    return null;
  }
}

async function fetchQuote(symbol) {
  try {
    const yfSymbol = symbol.endsWith('.IS') ? symbol : `${symbol}.IS`;
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=1d&range=2d`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return await fetchQuoteFromTradingView(symbol);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return await fetchQuoteFromTradingView(symbol);

    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return await fetchQuoteFromTradingView(symbol);
    }

    let sessionDate = new Date().toISOString().slice(0, 10);
    if (typeof meta?.regularMarketTime === 'number' && meta.regularMarketTime > 0) {
      const d = new Date(meta.regularMarketTime * 1000);
      if (!isNaN(d.getTime())) {
        sessionDate = d.toISOString().slice(0, 10);
      }
    }

    return {
      price,
      sessionDate,
      source: 'yahoo',
      open: typeof meta?.regularMarketOpen === 'number' && Number.isFinite(meta.regularMarketOpen) ? meta.regularMarketOpen : null,
      high: typeof meta?.regularMarketDayHigh === 'number' && Number.isFinite(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null,
      low: typeof meta?.regularMarketDayLow === 'number' && Number.isFinite(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null,
      volume: typeof meta?.regularMarketVolume === 'number' && Number.isFinite(meta.regularMarketVolume) ? meta.regularMarketVolume : null
    };
  } catch {
    return await fetchQuoteFromTradingView(symbol);
  }
}

async function runConcurrency(items, fn, limit = 15) {
  const results = [];
  const executing = new Set();

  for (const item of items) {
    const p = fn(item).then(res => {
      executing.delete(p);
      return res;
    });
    results.push(p);
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

async function main() {
  console.log('📡 Fetching active BIST assets from Supabase...');
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, symbol, name')
    .eq('market', 'BIST')
    .eq('is_active', true);

  if (error || !assets) {
    console.error('Failed to load assets:', error);
    process.exit(1);
  }

  console.log(`Found ${assets.length} active BIST assets. Ingesting live session quotes from Yahoo Finance...`);

  let fetched = 0;
  let skipped = 0;

  const quoteResults = await runConcurrency(assets, async (asset) => {
    const q = await fetchQuote(asset.symbol);
    if (q) {
      fetched++;
      return {
        asset_id: asset.id,
        date: q.sessionDate,
        close: q.price,
        open: q.open,
        high: q.high,
        low: q.low,
        volume: q.volume,
        adj_close: q.price,
        source: 'yahoo',
        observed_at: new Date().toISOString()
      };
    } else {
      skipped++;
      return null;
    }
  }, 15);

  const validRows = quoteResults.filter(Boolean);
  console.log(`\n✅ Successfully fetched ${validRows.length} quotes (${skipped} unavailable/skipped).`);

  if (validRows.length === 0) {
    console.error('No quotes fetched.');
    return;
  }

  console.log(`💾 Upserting ${validRows.length} rows into price_history (conflict: asset_id, date)...`);

  for (let i = 0; i < validRows.length; i += 100) {
    const chunk = validRows.slice(i, i + 100);
    const { error: upsertErr } = await supabase
      .from('price_history')
      .upsert(chunk, { onConflict: 'asset_id,date' });

    if (upsertErr) {
      console.error(`Chunk error [${i}..${i + chunk.length}]:`, upsertErr);
    } else {
      process.stdout.write(`  Upserted ${Math.min(i + 100, validRows.length)} / ${validRows.length}\r`);
    }
  }

  console.log(`\n🎉 Completed! Live BIST session quotes upserted to Supabase.`);
}

main().catch(err => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
