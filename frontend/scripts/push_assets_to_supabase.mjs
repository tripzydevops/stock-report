import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const supabase = createClient(url, key);

async function run() {
  const jsonPath = path.resolve(process.cwd(), '../all_midas_assets.json');
  console.log('Reading from:', jsonPath);
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const assets = JSON.parse(raw);
  console.log(`Total assets to upsert: ${assets.length}`);

  // Update ANHYT to ANHYT.IS if present
  try {
    await supabase.from('assets').update({ symbol: 'ANHYT.IS' }).eq('symbol', 'ANHYT');
  } catch (e) {
    console.warn('ANHYT update note:', e.message);
  }

  const batchSize = 100;
  let insertedTotal = 0;

  for (let i = 0; i < assets.length; i += batchSize) {
    const chunk = assets.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('assets')
      .upsert(chunk, { onConflict: 'symbol' })
      .select('symbol');

    if (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
      // Fallback single item inserts
      for (const item of chunk) {
        const { error: singleErr } = await supabase
          .from('assets')
          .upsert(item, { onConflict: 'symbol' });
        if (singleErr) {
          console.error(`Failed on item ${item.symbol}:`, singleErr.message);
        } else {
          insertedTotal++;
        }
      }
    } else {
      insertedTotal += (data ? data.length : chunk.length);
      console.log(`Batch ${Math.floor(i / batchSize) + 1} / ${Math.ceil(assets.length / batchSize)} processed (${insertedTotal} cumulative items)`);
    }
  }

  console.log('\n--- VERIFICATION ---');
  const { data: counts, error: countErr } = await supabase
    .from('assets')
    .select('market, asset_class');

  if (countErr) {
    console.error('Count error:', countErr);
  } else {
    const summary = {};
    for (const row of counts) {
      const k = `${row.market} (${row.asset_class})`;
      summary[k] = (summary[k] || 0) + 1;
    }
    console.log('Total assets in Supabase:', counts.length);
    console.log('Breakdown:', summary);
  }
}

run().catch(console.error);
