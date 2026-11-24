import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

test.describe('Portfolio Idempotency & Concurrency Stress Verification', () => {
  test.setTimeout(60000);
  let baseUrl: string;
  let token: string;
  let supabase: any;
  let userId: string;
  const createdTestOrderRefs: string[] = [];

  let aselsAssetId: string | null = null;
  let akbnkAssetId: string | null = null;
  let initialAselsPos: any = null;
  let initialAkbnkPos: any = null;

  test.afterAll(async () => {
    if (supabase && userId) {
      try {
        // 1. Delete created test orders by exact references
        for (const ref of createdTestOrderRefs) {
          await supabase
            .from('portfolio_orders')
            .delete()
            .eq('user_id', userId)
            .eq('order_ref', ref);
        }

        // 2. Delete test auto-deposits created during test run
        await supabase
          .from('portfolio_transfers')
          .delete()
          .eq('user_id', userId)
          .like('notes', '%Funded position ASELS%');

        await supabase
          .from('portfolio_transfers')
          .delete()
          .eq('user_id', userId)
          .like('notes', '%Funded position AKBNK%');

        // 3. Restore or delete ASELS position
        if (aselsAssetId) {
          if (initialAselsPos) {
            await supabase
              .from('portfolio_positions')
              .update({
                quantity: initialAselsPos.quantity,
                avg_entry_price: initialAselsPos.avg_entry_price,
                is_open: initialAselsPos.is_open,
              })
              .eq('id', initialAselsPos.id);
          } else {
            await supabase
              .from('portfolio_positions')
              .delete()
              .eq('user_id', userId)
              .eq('asset_id', aselsAssetId);
          }
        }

        // 4. Restore or delete AKBNK position
        if (akbnkAssetId) {
          if (initialAkbnkPos) {
            await supabase
              .from('portfolio_positions')
              .update({
                quantity: initialAkbnkPos.quantity,
                avg_entry_price: initialAkbnkPos.avg_entry_price,
                is_open: initialAkbnkPos.is_open,
              })
              .eq('id', initialAkbnkPos.id);
          } else {
            await supabase
              .from('portfolio_positions')
              .delete()
              .eq('user_id', userId)
              .eq('asset_id', akbnkAssetId);
          }
        }
      } catch (e) {
        console.warn('Test teardown warning:', e);
      }
    }
  });

  test.beforeAll(async () => {
    const envLocalPath = path.resolve(__dirname, '../.env.local');
    const parsedEnv: Record<string, string> = { ...process.env } as Record<string, string>;
    if (fs.existsSync(envLocalPath)) {
      const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim();
          if (!parsedEnv[k]) parsedEnv[k] = v;
        }
      }
    }

    baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const url = parsedEnv.NEXT_PUBLIC_SUPABASE_URL;
    const key = parsedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const email = parsedEnv.TEST_USER_A_EMAIL;
    const pwd = parsedEnv.TEST_USER_A_PASSWORD;

    if (!url || !key || !email || !pwd) {
      console.warn('Skipping authenticated tests: test user credentials not found in env');
      return;
    }

    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    if (error || !authData?.session?.access_token) {
      throw new Error(`Failed to authenticate test user: ${error?.message}`);
    }

    token = authData.session.access_token;
    userId = authData.user.id;

    // Snapshot initial positions before test execution to guarantee zero residual test pollution
    const [aselsAsset, akbnkAsset] = await Promise.all([
      supabase.from('assets').select('id').or('symbol.eq.ASELS,symbol.eq.ASELS.IS').limit(1).maybeSingle(),
      supabase.from('assets').select('id').or('symbol.eq.AKBNK,symbol.eq.AKBNK.IS').limit(1).maybeSingle(),
    ]);

    aselsAssetId = aselsAsset.data?.id || null;
    akbnkAssetId = akbnkAsset.data?.id || null;

    if (aselsAssetId) {
      const { data: pos } = await supabase
        .from('portfolio_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('asset_id', aselsAssetId)
        .limit(1)
        .maybeSingle();
      initialAselsPos = pos ? { ...pos } : null;
    }

    if (akbnkAssetId) {
      const { data: pos } = await supabase
        .from('portfolio_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('asset_id', akbnkAssetId)
        .limit(1)
        .maybeSingle();
      initialAkbnkPos = pos ? { ...pos } : null;
    }
  });

  test('1. Verify concurrent orders with same Idempotency-Key return deduplicated response', async ({ request }) => {
    test.skip(!token, 'Requires authenticated session');

    const testIdempotencyKey = `ORD-TEST-IDEM-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    createdTestOrderRefs.push(testIdempotencyKey);
    const payload = {
      symbol: 'ASELS',
      shares: 1,
      price: 340.00,
      market: 'BIST',
      name: 'Aselsan',
      currency: 'TRY',
      side: 'BUY',
      orderType: 'Limit',
      status: 'Filled',
      client_order_id: testIdempotencyKey,
      autoFund: true,
    };

    // Dispatch two concurrent POST requests with the identical idempotency key
    const [res1, res2] = await Promise.all([
      request.post(`${baseUrl}/api/portfolio/positions`, {
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': testIdempotencyKey,
        },
      }),
      request.post(`${baseUrl}/api/portfolio/positions`, {
        data: payload,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Idempotency-Key': testIdempotencyKey,
        },
      }),
    ]);

    expect(res1.ok()).toBeTruthy();
    expect(res2.ok()).toBeTruthy();

    const json1 = await res1.json();
    const json2 = await res2.json();

    // Exactly one must be the primary execution or both resolve successfully with deduplicated state
    const isAtLeastOneDeduplicated = json1.deduplicated === true || json2.deduplicated === true;
    expect(json1.success).toBe(true);
    expect(json2.success).toBe(true);
    expect(isAtLeastOneDeduplicated || json1.order?.id === json2.order?.id).toBe(true);
  });

  test('2. Verify rapid legitimate repeat purchases with different keys both succeed', async ({ request }) => {
    test.skip(!token, 'Requires authenticated session');

    const keyA = `ORD-TEST-LEGIT-A-${Date.now()}`;
    const keyB = `ORD-TEST-LEGIT-B-${Date.now() + 10}`;
    createdTestOrderRefs.push(keyA, keyB);

    const payloadA = {
      symbol: 'AKBNK',
      shares: 1,
      price: 70.00,
      market: 'BIST',
      name: 'Akbank T.A.Ş.',
      currency: 'TRY',
      side: 'BUY',
      orderType: 'Limit',
      status: 'Filled',
      client_order_id: keyA,
      autoFund: true,
    };

    const payloadB = {
      ...payloadA,
      client_order_id: keyB,
    };

    // First purchase
    const resA = await request.post(`${baseUrl}/api/portfolio/positions`, {
      data: payloadA,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Idempotency-Key': keyA,
      },
    });

    // Second purchase immediately after (same symbol, same quantity, same price)
    const resB = await request.post(`${baseUrl}/api/portfolio/positions`, {
      data: payloadB,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Idempotency-Key': keyB,
      },
    });

    expect(resA.ok()).toBeTruthy();
    expect(resB.ok()).toBeTruthy();

    const jsonA = await resA.json();
    const jsonB = await resB.json();

    expect(jsonA.success).toBe(true);
    expect(jsonB.success).toBe(true);
    // Since keys are distinct, neither should be blocked by a similarity guard
    expect(jsonA.order?.id).not.toBe(jsonB.order?.id);
  });

  test('3. Verify serverless dividend sync endpoint guarantees credit idempotency', async ({ request }) => {
    test.setTimeout(120000);

    // Run dividend sync twice sequentially
    const res1 = await request.get(`${baseUrl}/api/sync/dividends`);
    expect(res1.ok()).toBeTruthy();
    const json1 = await res1.json();

    const res2 = await request.get(`${baseUrl}/api/sync/dividends`);
    expect(res2.ok()).toBeTruthy();
    const json2 = await res2.json();

    expect(json1.success).toBe(true);
    expect(json2.success).toBe(true);

    // On the second immediate run, newly credited transfers must be 0 (all already credited or skipped)
    if (json2.dueDividendsSettled) {
      expect(json2.dueDividendsSettled.creditedCount).toBe(0);
    }
  });

  test('4. Verify persistent failed-action recovery UI and user discard flow', async ({ page }) => {
    // Seed mock failed mutation via addInitScript before page loads
    await page.addInitScript(() => {
      const mockFailed = [{
        id: 'mock-fail-001',
        clientOrderId: 'ORD-TEST-FAIL-MOCK',
        type: 'SELL',
        body: { symbol: 'THYAO', shares: 50, price: 310.0, currency: 'TRY' },
        lastError: 'Cannot execute SELL order: Insufficient quantity (holding: 10, requested: 50)',
        createdAt: new Date().toISOString(),
        status: 'FAILED',
      }];
      localStorage.setItem('marketpulse_failed_mutations', JSON.stringify(mockFailed));
      localStorage.setItem('market_pulse_active_tab', 'portfolio');
    });

    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('domcontentloaded');

    // Click Portföyüm in sidebar
    const portfolioBtn = page.locator('aside button[data-tab="portfolio"]').first();
    await expect(portfolioBtn).toBeVisible({ timeout: 10000 });
    await portfolioBtn.click();

    // Verify the persistent banner is visible with failure reason and controls
    const failedBanner = page.locator('[data-testid="failed-mutations-banner"]').first();
    await expect(failedBanner).toBeVisible({ timeout: 15000 });

    const failedSymbol = page.locator('[data-testid="failed-mutations-banner"]').locator('text=THYAO').first();
    await expect(failedSymbol).toBeVisible();

    const discardBtn = page.locator('[data-testid="discard-failed-action"]').first();
    await expect(discardBtn).toBeVisible();

    // Click discard and verify banner clears from view and localStorage
    await discardBtn.click();
    await expect(failedBanner).not.toBeVisible({ timeout: 5000 });

    const storedFailed = await page.evaluate(() => {
      const raw = localStorage.getItem('marketpulse_failed_mutations');
      return raw ? JSON.parse(raw) : [];
    });
    expect(storedFailed.length).toBe(0);
  });
});
