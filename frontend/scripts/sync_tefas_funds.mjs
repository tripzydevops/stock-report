import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const supabase = createClient(url, key);

async function fetchTefasQuote(code) {
  try {
    const res = await fetch('https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ fonKodu: code, dil: 'TR', periyod: 1 }),
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const list = json.resultList;
    if (!Array.isArray(list) || list.length === 0) return null;
    
    // Sort chronological
    list.sort((a, b) => new Date(a.tarih).getTime() - new Date(b.tarih).getTime());
    const latest = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : latest;

    return {
      code,
      name: latest.fonUnvan || null,
      date: latest.tarih,
      price: Number(latest.fiyat),
      prevPrice: Number(prev.fiyat),
    };
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('Fetching all TEFAS assets from Supabase...');
  const { data: tefasAssets, error } = await supabase
    .from('assets')
    .select('id, symbol, name')
    .eq('market', 'TEFAS');

  if (error || !tefasAssets) {
    console.error('Error fetching tefas assets:', error);
    return;
  }

  console.log(`Found ${tefasAssets.length} TEFAS assets in DB. Fetching official prices...`);

  const priceHistoryRows = [];
  const updatedAssets = [];
  let successCount = 0;

  for (const asset of tefasAssets) {
    const quote = await fetchTefasQuote(asset.symbol);
    if (quote && quote.price > 0) {
      successCount++;
      // TEFAS mutual funds only have daily NAV; no intraday open/high/low swings or volume
      priceHistoryRows.push({
        asset_id: asset.id,
        date: quote.date,
        open: null,
        high: null,
        low: null,
        close: quote.price,
        adj_close: quote.price,
        volume: null,
        source: 'tefas',
        observed_at: new Date().toISOString()
      });

      if (quote.name && (!asset.name || asset.name === asset.symbol)) {
        updatedAssets.push({ id: asset.id, name: quote.name });
      }

      console.log(`  ✓ ${asset.symbol}: ₺${quote.price} (${quote.date})`);
    } else {
      console.warn(`  ✗ ${asset.symbol}: No data from TEFAS`);
    }
  }

  if (priceHistoryRows.length > 0) {
    console.log(`Upserting ${priceHistoryRows.length} price rows to price_history...`);
    const { error: upsertErr } = await supabase
      .from('price_history')
      .upsert(priceHistoryRows, { onConflict: 'asset_id,date' });

    if (upsertErr) {
      console.error('Failed to upsert to price_history:', upsertErr);
    } else {
      console.log('✅ Successfully synced all TEFAS fund prices to price_history!');
    }
  }

  for (const up of updatedAssets) {
    await supabase.from('assets').update({ name: up.name }).eq('id', up.id);
  }

  console.log(`Done! Synced ${successCount} / ${tefasAssets.length} TEFAS funds.`);
}

run().catch(console.error);
