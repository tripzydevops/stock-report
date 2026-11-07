import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function getEffectiveUserId(request: NextRequest): string {
  const url = new URL(request.url);
  const qUserId = url.searchParams.get('userId');
  if (qUserId && qUserId !== 'undefined' && qUserId !== 'null' && qUserId.trim()) {
    return qUserId.trim();
  }
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId !== 'undefined' && headerUserId !== 'null' && headerUserId.trim()) {
    return headerUserId.trim();
  }
  return 'default_user';
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const symbolParam = url.searchParams.get('symbol');
    const summaryParam = url.searchParams.get('summary');
    const portfolioParam = url.searchParams.get('portfolio');
    const market = url.searchParams.get('market');

    // Case 1: Single symbol dividend history
    if (symbolParam && symbolParam.trim()) {
      const cleanSym = symbolParam.trim().toUpperCase().replace('.IS', '');
      const { data, error } = await supabase
        .from('asset_dividends')
        .select(`
          id, symbol, ex_date, payment_date, record_date, amount, currency, frequency, is_confirmed, source
        `)
        .or(`symbol.eq.${cleanSym},symbol.eq.${cleanSym}.IS`)
        .order('ex_date', { ascending: false })
        .limit(100);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        symbol: cleanSym,
        dividends: data || [],
        count: data?.length || 0
      });
    }

    // Case 2: Portfolio dividend cashflow aggregation
    if (portfolioParam === 'true') {
      const userId = getEffectiveUserId(request);

      let posQuery = supabase
        .from('portfolio_positions')
        .select('asset_id, quantity, avg_entry_price, assets(symbol, name, market, currency)')
        .eq('is_open', true);

      if (userId && userId !== 'default_user') {
        posQuery = posQuery.eq('user_id', userId);
      } else {
        posQuery = posQuery.is('user_id', null);
      }

      const { data: positions, error: posErr } = await posQuery;
      if (posErr) {
        return NextResponse.json({ error: posErr.message }, { status: 500 });
      }

      const assetIds = (positions || []).map((p: any) => p.asset_id).filter(Boolean);
      
      let dividendMap = new Map<string, any[]>();
      if (assetIds.length > 0) {
        const { data: divs } = await supabase
          .from('asset_dividends')
          .select('*')
          .in('asset_id', assetIds)
          .order('ex_date', { ascending: false });

        if (divs) {
          for (const d of divs) {
            if (!dividendMap.has(d.asset_id)) {
              dividendMap.set(d.asset_id, []);
            }
            dividendMap.get(d.asset_id)!.push(d);
          }
        }
      }

      const portfolioDividends = (positions || []).map((pos: any) => {
        const asset = pos.assets || {};
        const sym = (asset.symbol || '').replace('.IS', '');
        const history = dividendMap.get(pos.asset_id) || [];
        const latest = history[0];

        // Annualized dividend
        const last365 = history.filter(h => {
          const dt = new Date(h.ex_date).getTime();
          return Date.now() - dt <= 365 * 86400000;
        });
        const annualDps = last365.reduce((sum, h) => sum + Number(h.amount), 0);
        const shares = Number(pos.quantity) || 0;
        const totalAnnualIncome = shares * annualDps;

        return {
          assetId: pos.asset_id,
          symbol: sym,
          name: asset.name || sym,
          market: asset.market || 'BIST',
          currency: asset.currency || 'TRY',
          shares,
          annualDps,
          totalAnnualIncome: Number(totalAnnualIncome.toFixed(2)),
          latestExDate: latest?.ex_date || null,
          latestDps: latest ? Number(latest.amount) : null,
          frequency: latest?.frequency || 'Annual',
          historyCount: history.length
        };
      });

      return NextResponse.json({
        userId,
        items: portfolioDividends,
        totalProjectedAnnualIncomeTRY: portfolioDividends
          .filter(p => p.currency === 'TRY')
          .reduce((sum, p) => sum + p.totalAnnualIncome, 0),
        totalProjectedAnnualIncomeUSD: portfolioDividends
          .filter(p => p.currency === 'USD')
          .reduce((sum, p) => sum + p.totalAnnualIncome, 0)
      });
    }

    // Case 3: Summary of all dividend paying assets (from v_dividend_summary)
    let summaryQuery = supabase
      .from('v_dividend_summary')
      .select('*')
      .order('trailing_yield_pct', { ascending: false, nullsFirst: false })
      .limit(summaryParam ? 100 : 500);

    if (market) {
      summaryQuery = summaryQuery.eq('market', market.toUpperCase());
    }

    const { data: summaryData, error: summaryErr } = await summaryQuery;
    if (summaryErr) {
      return NextResponse.json({ error: summaryErr.message }, { status: 500 });
    }

    return NextResponse.json(summaryData || []);
  } catch (err: any) {
    console.error('Dividends API exception:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
