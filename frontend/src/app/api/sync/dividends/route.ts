import { NextRequest, NextResponse } from 'next/server';
import { syncServerlessDividends } from '@/lib/serverlessDividendSync';
import { verifyCronAuthorization, getAuthenticatedSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient serverless execution time for batch auditing

async function isAuthorizedRequest(request: NextRequest): Promise<boolean> {
  // 1. Cron secret authorization (CRON_SECRET)
  if (verifyCronAuthorization(request)) {
    return true;
  }

  // 2. Authenticated Admin Session
  try {
    const authClient = getAuthenticatedSupabase(request);
    const { data: { user }, error } = await authClient.auth.getUser();
    if (!error && user) {
      const email = user.email?.toLowerCase();
      const role = user.app_metadata?.role || user.user_metadata?.role;
      if (role === 'admin' || email === 'successofmentors@gmail.com') {
        return true;
      }
    }
  } catch (err) {
    console.warn('Auth check in /api/sync/dividends:', err);
  }

  // 3. Same-origin browser request
  const origin = request.headers.get('origin') || '';
  const host = request.headers.get('host') || '';
  const secFetchSite = request.headers.get('sec-fetch-site') || '';
  if (secFetchSite === 'same-origin' || (origin && host && origin.includes(host))) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await isAuthorizedRequest(request);
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized: valid cron secret, admin session, or same-origin request required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const customSymbols = symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()) : undefined;

    const result = await syncServerlessDividends(customSymbols);
    return NextResponse.json({
      success: true,
      message: `Audited ${result.auditedCount} dividend assets. Found ${result.upcomingCount} upcoming confirmed ex-dates.`,
      result
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[API /api/sync/dividends GET] Error:', err);
    return NextResponse.json({
      success: false,
      error: errorMsg || 'Internal Server Error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await isAuthorizedRequest(request);
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized: valid cron secret, admin session, or same-origin request required' }, { status: 401 });
    }
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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[API /api/sync/dividends POST] Error:', err);
    return NextResponse.json({
      success: false,
      error: errorMsg || 'Internal Server Error'
    }, { status: 500 });
  }
}
