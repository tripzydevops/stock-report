import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    let assetId: string | null = null;
    if (symbol) {
      const cleanSym = symbol.trim().toUpperCase().replace('.IS', '');
      const { data: assetData } = await supabase
        .from('assets')
        .select('id, symbol')
        .or(`symbol.eq.${cleanSym},symbol.eq.${cleanSym}.IS`)
        .limit(1)
        .maybeSingle();

      if (!assetData) {
        return NextResponse.json([]);
      }
      assetId = assetData.id;
    }

    let query = supabase
      .from('stock_movements')
      .select('*, assets(symbol, name, market)');

    if (assetId) {
      query = query.eq('asset_id', assetId);
    }
    if (fromDate) {
      query = query.gte('movement_time', fromDate);
    }
    if (toDate) {
      query = query.lte('movement_time', `${toDate}T23:59:59Z`);
    }

    query = query
      .order('movement_time', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const movements = (data || []).map((row: any) => ({
      id: row.id,
      asset_id: row.asset_id,
      symbol: row.assets?.symbol || null,
      name: row.assets?.name || null,
      market: row.assets?.market || null,
      movement_time: row.movement_time,
      direction: row.direction,
      change_amount: row.change_amount,
      change_pct: row.change_pct,
      signal: row.signal,
      score: row.score,
      metadata: row.metadata,
      report_file_id: row.report_file_id,
      created_at: row.created_at,
    }));

    return NextResponse.json(movements);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
