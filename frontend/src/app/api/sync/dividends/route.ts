import { NextRequest, NextResponse } from 'next/server';
import { syncServerlessDividends } from '@/lib/serverlessDividendSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient serverless execution time for batch auditing

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const customSymbols = symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()) : undefined;

    const result = await syncServerlessDividends(customSymbols);
    return NextResponse.json({
      success: true,
      message: `Audited ${result.auditedCount} dividend assets. Found ${result.upcomingCount} upcoming confirmed ex-dates.`,
      result
    });
  } catch (err: any) {
    console.error('[API /api/sync/dividends GET] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal Server Error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let customSymbols: string[] | undefined = undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.symbols)) {
        customSymbols = body.symbols.map((s: string) => s.trim().toUpperCase());
      }
    } catch {
      // Body is optional
    }

    const result = await syncServerlessDividends(customSymbols);
    return NextResponse.json({
      success: true,
      message: `Audited ${result.auditedCount} dividend assets. Upserted ${result.upsertedCount} confirmed upcoming events into Supabase.`,
      result
    });
  } catch (err: any) {
    console.error('[API /api/sync/dividends POST] Error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Internal Server Error'
    }, { status: 500 });
  }
}
