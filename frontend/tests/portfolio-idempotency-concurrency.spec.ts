import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

function getTestAuth(): { baseUrl: string; token: string; supabase: any; userId: string } {
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

  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const url = parsedEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = parsedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = parsedEnv.TEST_USER_A_EMAIL;
  const pwd = parsedEnv.TEST_USER_A_PASSWORD;

  return { baseUrl, token: '', supabase: url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null, userId: '' };
}

test.describe('Portfolio Idempotency & Concurrency Stress Verification', () => {
  test.setTimeout(60000);
  let baseUrl: string;
  let token: string;
  let supabase: any;
  let userId: string;
  const createdTestOrderRefs: string[] = [];

  test.afterAll(async () => {
    if (supabase && userId && createdTestOrderRefs.length > 0) {
      try {
        for (const ref of createdTestOrderRefs) {
          await supabase
            .from('portfolio_orders')
            .delete()
            .eq('user_id', userId)
            .eq('order_ref', ref);
        }
      } catch (e) {
        console.warn('Test cleanup warning:', e);
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

    baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3001';
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
});
