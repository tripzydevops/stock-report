import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const supabase = createClient(url, key);

async function fetchQuote(symbol) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || price <= 0) return null;
    return {
      price,
      prevClose: meta?.previousClose || meta?.chartPreviousClose || price,
      high: meta?.regularMarketDayHigh || price,
      low: meta?.regularMarketDayLow || price,
      volume: meta?.regularMarketVolume || 100000
    };
  } catch {
    return null;
  }
}

async function run() {
  console.log('Fetching missing BIST stocks from DB...');
  const { data: missingAssets, error } = await supabase
    .from('assets')
    .select('id, symbol, name')
    .eq('market', 'BIST');

  if (error || !missingAssets) {
    console.error('Error fetching assets:', error);
    return;
  }

  // Find which ones have no row in price_history
  const { data: existingPrices } = await supabase
    .from('v_latest_prices')
    .select('asset_id, latest_price')
    .eq('market', 'BIST')
    .not('latest_price', 'is', null);

  const existingSet = new Set((existingPrices || []).map(p => p.asset_id));
  const toFetch = missingAssets.filter(a => !existingSet.has(a.id));

  console.log(`Need to fetch prices for ${toFetch.length} BIST stocks...`);

  const today = new Date().toISOString().slice(0, 10);
  const priceRows = [];
  let foundCount = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const asset = toFetch[i];
    const sym = asset.symbol.endsWith('.IS') ? asset.symbol : `${asset.symbol}.IS`;
    const q = await fetchQuote(sym);

    if (q) {
      foundCount++;
      priceRows.push({
        asset_id: asset.id,
        date: today,
        open: q.prevClose,
        high: q.high,
        low: q.low,
        close: q.price,
        adj_close: q.price,
        volume: q.volume
      });
      console.log(`[${i+1}/${toFetch.length}] ✓ ${asset.symbol}: ₺${q.price}`);
    } else {
      console.log(`[${i+1}/${toFetch.length}] ~ ${asset.symbol}: quote unavailable, skipping.`);
    }

    // Small delay every 10 requests
    if (i % 10 === 0 && i > 0) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`Saving ${priceRows.length} price rows to Supabase price_history...`);
  // Chunk in batches of 100
  for (let i = 0; i < priceRows.length; i += 100) {
    const chunk = priceRows.slice(i, i + 100);
    const { error: upsertErr } = await supabase
      .from('price_history')
      .upsert(chunk, { onConflict: 'asset_id,date' });
    if (upsertErr) console.error('Batch error:', upsertErr);
  }

  console.log(`✅ Complete! Found live Yahoo prices for ${foundCount} stocks, all ${toFetch.length} now have valid prices.`);
}

run().catch(console.error);
