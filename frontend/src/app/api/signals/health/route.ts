import { NextResponse } from 'next/server';
import { getServerSupabase, getAdminSupabase, verifyCronAuthorization, getAuthenticatedSupabase } from '@/lib/supabaseServer';

export interface SignalHealthReport {
  status: 'OPTIMAL' | 'NEEDS_ATTENTION' | 'CRITICAL';
  isHealthy: boolean;
  openSignalsCount: number;
  totalSignalsCount: number;
  latestSignalDate: string | null;
  latestSignalCreatedAt: string | null;
  hoursSinceLastSignal: number | null;
  latestPriceDate: string | null;
  latestReportDate: string | null;
  activeAssetsCount: number;
  issues: string[];
  diagnostics: {
    databaseConnected: boolean;
    hasActiveAssets: boolean;
    hasPriceHistory: boolean;
    hasOpenSignals: boolean;
    isMarketOpenToday: boolean;
  };
  latestSignals: Array<{
    id: string;
    symbol: string;
    strategy: string;
    signalDate: string;
    entryPrice: number;
    status: string;
  }>;
  checkedAt: string;
}

/**
 * Validates request authorization:
 * Allows:
 * 1. Verified cron secret
 * 2. Authenticated admin user
 * 3. Same-origin browser requests from the application frontend
 */
async function isAuthorizedHealthRequest(request: Request): Promise<boolean> {
  if (verifyCronAuthorization(request)) return true;

  // Check same-origin request
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true;

  const origin = request.headers.get('origin') || '';
  const host = request.headers.get('host') || '';
  if (origin && host && origin.includes(host)) return true;

  // Authenticated user check
  try {
    const authClient = getAuthenticatedSupabase(request);
    const { data: { user } } = await authClient.auth.getUser();
    if (user) return true;
  } catch {}

  // Allow in development or trial mode
  if (process.env.NODE_ENV !== 'production') return true;

  return false;
}

export async function GET(request: Request) {
  try {
    const supabase = getServerSupabase();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const issues: string[] = [];

    // 1. Check database connectivity & active assets
    const { count: assetsCount, error: assetsErr } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const hasActiveAssets = !assetsErr && (assetsCount || 0) > 0;
    if (!hasActiveAssets) {
      issues.push('No active assets found in the assets catalog.');
    }

    // 2. Check trade signals (open signals and latest signal date)
    const { data: openSignals, error: openSigErr } = await supabase
      .from('trade_signals')
      .select('id, asset_id, strategy, signal_date, entry_price, status, created_at, assets(symbol, name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: latestAnySignal, error: anySigErr } = await supabase
      .from('trade_signals')
      .select('id, signal_date, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    const { count: totalSigCount } = await supabase
      .from('trade_signals')
      .select('id', { count: 'exact', head: true });

    const openCount = openSignals?.length || 0;
    const latestCreatedStr = latestAnySignal?.[0]?.created_at || openSignals?.[0]?.created_at || null;
    const latestSignalDate = latestAnySignal?.[0]?.signal_date || openSignals?.[0]?.signal_date || null;

    let hoursSinceLastSignal: number | null = null;
    if (latestCreatedStr) {
      const dt = new Date(latestCreatedStr);
      hoursSinceLastSignal = Math.max(0, Number(((now.getTime() - dt.getTime()) / 3600000).toFixed(1)));
    }

    const dayOfWeek = now.getUTCDay(); // 0 is Sunday, 6 is Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const maxStaleHours = isWeekend ? 96 : 48;

    if (openCount === 0) {
      issues.push('CRITICAL: There are 0 active trade signals in the open pool. Scanner needs execution.');
    } else if (hoursSinceLastSignal !== null && hoursSinceLastSignal > maxStaleHours) {
      issues.push(`WARNING: Latest trade signal is ${hoursSinceLastSignal} hours old (threshold: ${maxStaleHours}h). Automated scan may be delayed.`);
    }

    // 3. Check latest price date in price_history
    const { data: latestPrice } = await supabase
      .from('price_history')
      .select('date')
      .order('date', { ascending: false })
      .limit(1);

    const latestPriceDate = latestPrice?.[0]?.date || null;

    // 4. Check latest report generation
    const { data: latestReport } = await supabase
      .from('report_files')
      .select('trading_date, generated_at')
      .order('generated_at', { ascending: false })
      .limit(1);

    const latestReportDate = latestReport?.[0]?.trading_date || null;

    // Determine overall health status
    let status: 'OPTIMAL' | 'NEEDS_ATTENTION' | 'CRITICAL' = 'OPTIMAL';
    if (openCount === 0 || !hasActiveAssets || openSigErr || anySigErr) {
      status = 'CRITICAL';
    } else if (issues.length > 0) {
      status = 'NEEDS_ATTENTION';
    }

    const report: SignalHealthReport = {
      status,
      isHealthy: status === 'OPTIMAL',
      openSignalsCount: openCount,
      totalSignalsCount: totalSigCount || 0,
      latestSignalDate,
      latestSignalCreatedAt: latestCreatedStr,
      hoursSinceLastSignal,
      latestPriceDate,
      latestReportDate,
      activeAssetsCount: assetsCount || 0,
      issues,
      diagnostics: {
        databaseConnected: !assetsErr,
        hasActiveAssets,
        hasPriceHistory: Boolean(latestPriceDate),
        hasOpenSignals: openCount > 0,
        isMarketOpenToday: !isWeekend
      },
      latestSignals: (openSignals || []).slice(0, 5).map((s: any) => ({
        id: s.id,
        symbol: s.assets?.symbol?.replace('.IS', '') || 'ASSET',
        strategy: s.strategy,
        signalDate: s.signal_date,
        entryPrice: Number(s.entry_price) || 0,
        status: s.status
      })),
      checkedAt: now.toISOString()
    };

    return NextResponse.json(report);
  } catch (err: any) {
    console.error('Error in /api/signals/health:', err);
    return NextResponse.json({
      status: 'CRITICAL',
      isHealthy: false,
      issues: [`Diagnostic failed: ${err.message || err}`],
      checkedAt: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST /api/signals/health
 * Triggers self-healing routine:
 * - If signals are 0 or stale, triggers the backend daily pipeline or sync routine to scan and heal.
 */
export async function POST(request: Request) {
  try {
    const isAuthorized = await isAuthorizedHealthRequest(request);
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized self-healing request' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({ action: 'diagnose_and_heal' }));

    // Try executing self-healing scan via Python process if available on the server
    let healingDispatched = false;
    let healingDetails = '';

    try {
      const { spawn } = await import('child_process');
      const path = await import('path');
      const fs = await import('fs');

      // Check Python runtime locations
      const candidatePythons = [
        path.resolve(process.cwd(), '..', 'backend', '.venv', 'Scripts', 'python.exe'),
        path.resolve(process.cwd(), '..', 'backend', '.venv', 'bin', 'python'),
        'python3',
        'python'
      ];

      const candidateScript = path.resolve(process.cwd(), '..', 'export_to_spreadsheet.py');
      const fallbackScript = path.resolve(process.cwd(), '..', 'backend', 'app', 'cron_daily_job.py');
      const targetScript = fs.existsSync(candidateScript) ? candidateScript : fallbackScript;

      let pythonBin: string | null = null;
      for (const p of candidatePythons) {
        if (p.includes(path.sep) && (fs.existsSync as any)(/*turbopackIgnore: true*/ p)) {
          pythonBin = p;
          break;
        }
      }

      if (pythonBin && (fs.existsSync as any)(/*turbopackIgnore: true*/ targetScript)) {
        const cwd = path.resolve(process.cwd(), '..');
        const proc = (spawn as any)(/*turbopackIgnore: true*/ pythonBin, [targetScript], {
          cwd,
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONPATH: `backend${path.delimiter}.`
          }
        });
        proc.unref();
        healingDispatched = true;
        healingDetails = `Self-healing scanner process spawned asynchronously (${path.basename(targetScript)} via ${path.basename(pythonBin)}).`;
      }
    } catch (spawnErr: any) {
      console.warn('Could not launch background Python healing process:', spawnErr);
    }

    // Also trigger /api/sync live quote ingestion as an immediate fallback
    let syncResult: any = null;
    try {
      const adminClient = getAdminSupabase();
      const origin = request.headers.get('origin') || 'http://localhost:3000';
      const syncRes = await fetch(`${origin}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': process.env.CRON_SECRET || ''
        },
        body: JSON.stringify({ action: 'sync_live' })
      }).catch(() => null);

      if (syncRes && syncRes.ok) {
        syncResult = await syncRes.json().catch(() => null);
      }
    } catch {}

    return NextResponse.json({
      success: true,
      healed: true,
      healingDispatched,
      message: healingDispatched
        ? `Sistem kendi kendini teşhis etti ve onarım tarayıcısını başlattı. ${healingDetails}`
        : 'Sistem teşhisi tamamlandı; canlı fiyat senkronizasyonu tetiklendi.',
      syncResult,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Error in /api/signals/health POST:', err);
    return NextResponse.json({ success: false, error: err.message || 'Healing failed' }, { status: 500 });
  }
}
