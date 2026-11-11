import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

async function generateQueryEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  if (!text || !apiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 1000) }] },
        outputDimensionality: 384
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = await res.json();
      return json?.embedding?.values || null;
    }
  } catch (err) {
    console.warn('Failed to generate query embedding via Gemini:', err);
  }
  return null;
}

function parseImpactScore(raw: any): number | null {
  if (raw === null || raw === undefined) return null;
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
  if (Number.isFinite(num) && num >= 0 && num <= 10) {
    return Number(num.toFixed(1));
  }
  return null;
}

function sanitizeTextQuery(q: string): string {
  // Strip characters that break PostgREST or() filter syntax
  return q.replace(/[,.()%"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || '';
    const symbol = searchParams.get('symbol')?.trim().toUpperCase() || '';
    const category = searchParams.get('category')?.trim() || '';
    const rawLimit = parseInt(searchParams.get('limit') || '25', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 25;

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      '';

    // 1. Semantic Search with pgvector if query is provided
    if (query && apiKey) {
      const queryEmbedding = await generateQueryEmbedding(query, apiKey);
      if (queryEmbedding && queryEmbedding.length === 384) {
        const { data: rpcMatches, error: rpcErr } = await supabase.rpc('match_market_catalysts', {
          query_embedding: queryEmbedding,
          match_threshold: 0.22,
          match_count: limit,
          filter_symbol: symbol ? symbol.replace('.IS', '') : null,
          filter_category: category && category !== 'ALL' ? category : null,
        });

        if (!rpcErr && Array.isArray(rpcMatches)) {
          return NextResponse.json({
            success: true,
            isSemantic: true,
            query,
            count: rpcMatches.length,
            catalysts: rpcMatches.map((r: any) => ({
              id: r.id,
              symbol: r.symbol,
              market: r.market || 'BIST',
              category: r.category,
              title: r.title,
              details: r.details,
              aiVerdict: r.ai_verdict,
              aiTakeaway: r.ai_takeaway,
              impactScore: parseImpactScore(r.impact_score),
              sourceUrl: r.source_url,
              publishedAt: r.published_at,
              similarity: typeof r.similarity === 'number' && Number.isFinite(r.similarity) ? Number(r.similarity.toFixed(4)) : null,
            })),
          });
        }
      }
    }

    // 2. Standard Filtered / Full-Text Query Fallback
    let dbQuery = supabase
      .from('market_catalysts')
      .select('id, symbol, market, category, title, details, ai_verdict, ai_takeaway, impact_score, source_url, published_at')
      .order('published_at', { ascending: false })
      .limit(limit);

    if (symbol) {
      dbQuery = dbQuery.eq('symbol', symbol.replace('.IS', ''));
    }
    if (category && category !== 'ALL') {
      dbQuery = dbQuery.eq('category', category);
    }
    const cleanSearch = sanitizeTextQuery(query);
    if (cleanSearch) {
      dbQuery = dbQuery.or(`title.ilike.%${cleanSearch}%,details.ilike.%${cleanSearch}%,ai_takeaway.ilike.%${cleanSearch}%`);
    }

    const { data, error } = await dbQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      isSemantic: false,
      query,
      count: data?.length || 0,
      catalysts: (data || []).map((r: any) => ({
        id: r.id,
        symbol: r.symbol,
        market: r.market || 'BIST',
        category: r.category,
        title: r.title,
        details: r.details,
        aiVerdict: r.ai_verdict,
        aiTakeaway: r.ai_takeaway,
        impactScore: parseImpactScore(r.impact_score),
        sourceUrl: r.source_url,
        publishedAt: r.published_at,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
