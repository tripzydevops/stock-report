import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, events } = body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ ok: true, count: 0 });
    }

    const supabase = getServerSupabase();
    const rows = events.map((ev: any) => ({
      session_id: sessionId || null,
      event_type: ev.eventType || 'unknown',
      symbol: ev.symbol || null,
      archetype: ev.archetype || null,
      payload: ev.payload || {},
      created_at: ev.timestamp || new Date().toISOString()
    }));

    const { error } = await supabase.from('user_signals').insert(rows);

    if (error) {
      console.warn('[UserSignals API] Supabase insert warning:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err: any) {
    console.warn('[UserSignals API] Processing exception:', err.message);
    return NextResponse.json({ ok: true, count: 0 });
  }
}
