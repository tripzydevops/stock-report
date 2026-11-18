import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabaseServer';

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const cleanSym = symbol.replace('.IS', '').trim().toUpperCase();
    const isBist = symbol.endsWith('.IS') || cleanSym.length === 5 || [
      'TURSG', 'ISMEN', 'AKBNK', 'THYAO', 'FROTO', 'BIMAS', 'ASELS', 'TUPRS',
      'KCHOL', 'EREGL', 'SISE', 'YKBNK', 'SAHOL', 'ENKAI', 'HALKB', 'VAKBN',
      'KRDMD', 'PETKM', 'TCELL', 'AEFES', 'AGHOL', 'CCOLA', 'BRSAN'
    ].includes(cleanSym);

    const supabase = getServerSupabase();

    // 1. Fetch cached fundamentals directly from Supabase asset_fundamentals
    const { data: record, error: dbErr } = await supabase
      .from('asset_fundamentals')
      .select('data, updated_at')
      .eq('symbol', cleanSym)
      .maybeSingle();

    if (record && record.data) {
      return NextResponse.json({
        success: true,
        data: record.data,
        source: 'database',
        updatedAt: record.updated_at
      });
    }

    // 2. If not found in database, invoke fundamental_service via background Python
    try {
      const { spawnSync } = await import('child_process');
      const path = await import('path');
      const fs = await import('fs');

      const pyCandidates = [
        path.resolve(process.cwd(), '..', 'backend', '.venv', 'Scripts', 'python.exe'),
        path.resolve(process.cwd(), '..', 'backend', '.venv', 'bin', 'python'),
        'python'
      ];
      let pythonBin: string | null = null;
      for (const p of pyCandidates) {
        if (p.includes(path.sep) && (fs.existsSync as any)(/*turbopackIgnore: true*/ p)) {
          pythonBin = p;
          break;
        }
      }

      if (pythonBin) {
        const rootDir = path.resolve(process.cwd(), '..');
        const scriptCode = `
import sys
from app.services.fundamental_service import fetch_stock_fundamentals, save_fundamentals_to_supabase
import json
try:
    res = fetch_stock_fundamentals('${cleanSym}')
    if res:
        save_fundamentals_to_supabase(res)
        print(json.dumps(res))
    else:
        print("{}")
except Exception as e:
    sys.exit(1)
`;
        const proc = (spawnSync as any)(/*turbopackIgnore: true*/ pythonBin, ['-c', scriptCode], {
          cwd: rootDir,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONPATH: `backend${path.delimiter}.`
          },
          timeout: 10000
        });

        if (proc.stdout) {
          const outStr = proc.stdout.toString('utf-8').trim();
          const firstBrace = outStr.indexOf('{');
          if (firstBrace !== -1) {
            const parsed = JSON.parse(outStr.slice(firstBrace));
            if (parsed && parsed.profile) {
              return NextResponse.json({
                success: true,
                data: parsed,
                source: 'live_synced',
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      }
    } catch (spawnErr) {
      console.warn(`Live fetch failed for ${cleanSym}:`, spawnErr);
    }

    // 3. Fallback: derive minimal profile from assets catalog
    const { data: assetInfo } = await supabase
      .from('assets')
      .select('*')
      .or(`symbol.eq.${cleanSym},symbol.eq.${cleanSym}.IS`)
      .maybeSingle();

    if (assetInfo) {
      const fallbackPayload = {
        symbol: cleanSym,
        profile: {
          symbol: cleanSym,
          yfSymbol: isBist ? `${cleanSym}.IS` : cleanSym,
          companyName: assetInfo.name || cleanSym,
          description: `${assetInfo.name || cleanSym} is a listed company in ${assetInfo.market || 'BIST'} sector ${assetInfo.sector || 'Market'}.`,
          headquarters: isBist ? 'Istanbul, Turkey' : 'United States',
          employees: null,
          yearFounded: null,
          website: null,
          sector: assetInfo.sector || 'Equities',
          industry: assetInfo.sector || 'Equities',
          currency: isBist ? 'TRY' : 'USD'
        },
        financialsGrowth: [],
        capitalStructure: {
          marketCap: null,
          totalDebt: null,
          totalCash: null,
          enterpriseValue: null,
          bookValue: null,
          priceToBook: null
        },
        keyData: {
          marketCap: null,
          beta5y: null,
          dividendYield: null,
          shortInterestPct: null,
          sharesOutstanding: null,
          volume: null,
          averageVolume: null,
          high52w: null,
          low52w: null,
          trailingPE: null,
          forwardPE: null
        },
        analysts: {
          targetMean: null,
          targetHigh: null,
          targetLow: null,
          numberOfOpinions: null,
          recommendationKey: 'none',
          currentPrice: null
        },
        updatedAt: new Date().toISOString()
      };

      return NextResponse.json({
        success: true,
        data: fallbackPayload,
        source: 'catalog_fallback'
      });
    }

    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  } catch (err: any) {
    console.error('Error in /api/assets/[symbol]/fundamentals:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
