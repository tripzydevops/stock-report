import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const supabase = createClient(url, key);

async function fetchDividends(symbol) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?events=div&interval=1mo&range=5y`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const divs = json?.chart?.result?.[0]?.events?.dividends;
    if (!divs || typeof divs !== 'object') return null;

    const list = Object.values(divs).map(d => ({
      date: new Date(d.date * 1000).toISOString().slice(0, 10),
      amount: Number(d.amount)
    })).filter(d => Number.isFinite(d.amount) && d.amount > 0);

    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  } catch {
    return null;
  }
}

function determineFrequency(dates) {
  if (dates.length < 2) return 'Annual';
  // Count payouts in the last 15 months (approx 450 days)
  const now = Date.now();
  const recent = dates.filter(d => (now - new Date(d.date).getTime()) <= 450 * 86400000);
  const count = recent.length;
  if (count >= 10) return 'Monthly';
  if (count >= 3) return 'Quarterly';
  if (count === 2) return 'Semi-Annual';
  return 'Annual';
}

async function run() {
  console.log('Fetching assets catalog from Supabase...');
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, symbol, market, currency')
    .in('asset_class', ['stock', 'etf'])
    .limit(2000);

  if (error || !assets) {
    console.error('Error fetching assets:', error);
    return;
  }

  console.log(`Scanning dividends for ${assets.length} stocks and ETFs...`);

  let totalEventsFound = 0;
  let dividendPayersCount = 0;
  const allRows = [];

  // Concurrency pool
  const concurrency = 15;
  for (let i = 0; i < assets.length; i += concurrency) {
    const batch = assets.slice(i, i + concurrency);
    const promises = batch.map(async (asset) => {
      let querySym = asset.symbol;
      if (asset.market === 'BIST' && !querySym.endsWith('.IS')) {
        querySym = `${querySym}.IS`;
      } else if (asset.market === 'US') {
        querySym = querySym.replace('.', '-');
      }

      const divs = await fetchDividends(querySym);
      if (divs && divs.length > 0) {
        dividendPayersCount++;
        totalEventsFound += divs.length;
        const freq = determineFrequency(divs);

        for (const d of divs) {
          allRows.push({
            asset_id: asset.id,
            symbol: asset.symbol,
            ex_date: d.date,
            payment_date: d.date, // defaults to ex_date if unstated
            amount: d.amount,
            currency: asset.currency || (asset.market === 'US' ? 'USD' : 'TRY'),
            frequency: freq,
            is_confirmed: true,
            source: 'YAHOO_LIVE'
          });
        }
        console.log(`✓ [${asset.symbol}] Found ${divs.length} dividends (${freq}) - Last: ${divs[0].amount} on ${divs[0].date}`);
      }
    });

    await Promise.all(promises);
    if (i % 150 === 0 && i > 0) {
      console.log(`Progress: ${i} / ${assets.length} assets checked...`);
    }
  }

  console.log(`\nFound ${totalEventsFound} dividend events across ${dividendPayersCount} assets!`);
  console.log(`Upserting into Supabase asset_dividends in batches of 200...`);

  for (let i = 0; i < allRows.length; i += 200) {
    const chunk = allRows.slice(i, i + 200);
    const { error: upsertErr } = await supabase
      .from('asset_dividends')
      .upsert(chunk, { onConflict: 'asset_id,ex_date' });

    if (upsertErr) {
      console.error(`Batch ${i / 200 + 1} error:`, upsertErr.message);
    }
  }

  console.log('✅ Successfully synced all live dividends into Supabase!');
}

run().catch(console.error);
