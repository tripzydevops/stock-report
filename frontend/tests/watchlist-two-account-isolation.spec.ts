import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Safely load environment configuration without committing credentials
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envLocalPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('=') && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!env[k]) env[k] = v;
      }
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

const userAEmail = env.TEST_USER_A_EMAIL;
const userAPassword = env.TEST_USER_A_PASSWORD;
const userBEmail = env.TEST_USER_B_EMAIL;
const userBPassword = env.TEST_USER_B_PASSWORD;

test.describe('Watchlist Multi-Tenant Authenticated Persistence & Account Isolation', () => {
  let tokenA: string;
  let userIdA: string;
  let tokenB: string;
  let userIdB: string;

  // Track only fixture IDs created by this test to strictly prevent deleting any existing user items
  const createdFixtureIdsForA: string[] = [];
  const createdFixtureIdsForB: string[] = [];

  test.beforeAll(async () => {
    test.skip(
      !SUPABASE_URL || !SUPABASE_ANON_KEY || !userAEmail || !userAPassword || !userBEmail || !userBPassword,
      'Supabase configuration or test user credentials not configured in environment variables.'
    );

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Authenticate Account A
    const resA = await supabase.auth.signInWithPassword({
      email: userAEmail!,
      password: userAPassword!
    });
    expect(resA.error).toBeNull();
    expect(resA.data.session?.access_token).toBeDefined();
    tokenA = resA.data.session!.access_token;
    userIdA = resA.data.user!.id;

    // Authenticate Account B
    const resB = await supabase.auth.signInWithPassword({
      email: userBEmail!,
      password: userBPassword!
    });
    expect(resB.error).toBeNull();
    expect(resB.data.session?.access_token).toBeDefined();
    tokenB = resB.data.session!.access_token;
    userIdB = resB.data.user!.id;

    expect(userIdA).not.toEqual(userIdB);
  });

  test.afterAll(async ({ request }) => {
    // Restricted cleanup: ONLY remove disposable fixtures created by this test run
    for (const id of createdFixtureIdsForA) {
      await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      }).catch(() => {});
    }
    for (const id of createdFixtureIdsForB) {
      await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      }).catch(() => {});
    }
  });

  test('1. Two-Account API Lifecycle: Add -> Persist -> Edit -> Isolate -> Prevent Cross-Tenant Mutation -> Delete', async ({ request }) => {
    // 1. Account A adds a dedicated test item with distinct probe note
    const probeTag = `[DISPOSABLE_PROBE_${Date.now()}]`;
    const addResA = await request.post(`${BASE_URL}/api/watchlist`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      data: {
        symbol: 'THYAO.IS',
        notes: `${probeTag} Account A aviation thesis: strong passenger load`,
        alertAbove: 350,
        alertBelow: 280
      }
    });

    expect([200, 201]).toContain(addResA.status());
    const postJson = await addResA.json();
    expect(postJson.success).toBe(true);
    expect(postJson.item).toHaveProperty('id');
    const itemAId = postJson.item.id;
    createdFixtureIdsForA.push(itemAId);

    // 2. Account A refreshes GET /api/watchlist and confirms persistence
    const refreshGetA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(refreshGetA.status()).toBe(200);
    const refreshJsonA = await refreshGetA.json();
    const foundItemA = refreshJsonA.items.find((i: any) => i.id === itemAId);
    expect(foundItemA).toBeDefined();
    expect(foundItemA.notes).toContain(probeTag);
    expect(foundItemA.alertAbove).toBe(350);
    expect(foundItemA.alertBelow).toBe(280);

    // Verify cache metadata is returned
    expect(refreshJsonA).toHaveProperty('dataStatus');
    expect(['live', 'stale']).toContain(refreshJsonA.dataStatus);
    expect(refreshJsonA).toHaveProperty('catalogFetchedAt');
    expect(refreshJsonA).toHaveProperty('refreshFailed');

    // 3. Account A edits notes and targets
    const updatedNote = `${probeTag} Updated thesis: cargo segment record revenue`;
    const patchResA = await request.patch(`${BASE_URL}/api/watchlist`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      data: {
        id: itemAId,
        notes: updatedNote,
        alertAbove: 375,
        alertBelow: 290
      }
    });
    expect(patchResA.status()).toBe(200);

    // Verify edit persisted on refresh
    const verifyPatchA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifyJsonA = await verifyPatchA.json();
    const updatedItemA = verifyJsonA.items.find((i: any) => i.id === itemAId);
    expect(updatedItemA.notes).toBe(updatedNote);
    expect(updatedItemA.alertAbove).toBe(375);
    expect(updatedItemA.alertBelow).toBe(290);

    // 4. Multi-Tenant Isolation: Account B queries watchlist -> cannot see Account A's item
    const getResB = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(getResB.status()).toBe(200);
    const jsonB = await getResB.json();
    expect(jsonB.userId).toBe(userIdB);
    const leakedItemInB = (jsonB.items || []).find((i: any) => i.id === itemAId);
    expect(leakedItemInB).toBeUndefined();

    // 5. Cross-Tenant Protection: Account B attempts to PATCH Account A's item -> 404
    const maliciousPatchB = await request.patch(`${BASE_URL}/api/watchlist`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json'
      },
      data: {
        id: itemAId,
        notes: 'MALICIOUS_OVERWRITE_BY_ACCOUNT_B'
      }
    });
    expect(maliciousPatchB.status()).toBe(404);

    // Verify Account A's item was NOT mutated
    const verifyUnmutatedA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifyUnmutatedJsonA = await verifyUnmutatedA.json();
    const checkItemA = verifyUnmutatedJsonA.items.find((i: any) => i.id === itemAId);
    expect(checkItemA.notes).toBe(updatedNote);
    expect(checkItemA.notes).not.toContain('MALICIOUS');

    // 6. Cross-Tenant Protection: Account B attempts to DELETE Account A's item -> 404
    const maliciousDeleteB = await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(itemAId)}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(maliciousDeleteB.status()).toBe(404);

    // Verify Account A's item is STILL intact
    const verifyStillExistsA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifyStillExistsJsonA = await verifyStillExistsA.json();
    const stillThereA = verifyStillExistsJsonA.items.find((i: any) => i.id === itemAId);
    expect(stillThereA).toBeDefined();

    // 7. Account A deletes its own item
    const deleteResA = await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(itemAId)}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(deleteResA.status()).toBe(200);

    // Confirm deletion persisted after refresh
    const finalGetA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const finalJsonA = await finalGetA.json();
    const deletedCheckA = (finalJsonA.items || []).find((i: any) => i.id === itemAId);
    expect(deletedCheckA).toBeUndefined();
  });

  test('2. Direct Database PostgreSQL RLS Enforcement (Bypassing API ownership filters)', async () => {
    // Instantiate direct authenticated PostgREST clients for User A and User B
    const clientA = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenA}` } }
    });
    const clientB = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenB}` } }
    });

    // Dynamically retrieve any valid asset ID from assets table rather than hardcoding
    const { data: anyAsset, error: assetErr } = await clientA
      .from('assets')
      .select('id')
      .limit(1)
      .single();
    expect(assetErr).toBeNull();
    expect(anyAsset?.id).toBeDefined();
    const testAssetId = anyAsset!.id;

    let probeId: string | null = null;
    try {
      // 1. Create a fixture directly as User A
      const { data: fixtureRow, error: insertError } = await clientA
        .from('watchlist_items')
        .insert({
          user_id: userIdA,
          asset_id: testAssetId,
          notes: '[DIRECT_RLS_PROBE] Created by User A directly in Postgres',
        })
        .select()
        .single();

      expect(insertError).toBeNull();
      expect(fixtureRow).toBeDefined();
      const validProbeId = fixtureRow.id;
      probeId = validProbeId;
      createdFixtureIdsForA.push(validProbeId);

      // 2. User B directly attempts to SELECT User A's row without specifying user_id filter
      // RLS policy: (auth.uid() = user_id) MUST evaluate to FALSE, returning 0 rows!
      const { data: bSelectData, error: bSelectError } = await clientB
        .from('watchlist_items')
        .select('*')
        .eq('id', validProbeId);

      expect(bSelectError).toBeNull();
      expect(bSelectData).toEqual([]); // Zero rows returned directly by PostgreSQL engine!

      // 3. User B directly attempts to UPDATE User A's row
      const { data: bUpdateData, error: bUpdateError } = await clientB
        .from('watchlist_items')
        .update({ notes: 'CRITICAL_RLS_BREACH' })
        .eq('id', validProbeId)
        .select();

      expect(bUpdateError).toBeNull();
      expect(bUpdateData).toEqual([]); // 0 rows mutated by PostgreSQL engine!

      // 4. User B directly attempts to DELETE User A's row
      const { data: bDeleteData, error: bDeleteError } = await clientB
        .from('watchlist_items')
        .delete()
        .eq('id', validProbeId)
        .select();

      expect(bDeleteError).toBeNull();
      expect(bDeleteData).toEqual([]); // 0 rows deleted by PostgreSQL engine!

      // 5. User B directly attempts to INSERT a row with user_id = userIdA (masquerading as User A)
      // PostgreSQL WITH CHECK policy: (auth.uid() = user_id) MUST reject or block this insertion!
      const { data: bMaliciousInsert, error: bInsertError } = await clientB
        .from('watchlist_items')
        .insert({
          user_id: userIdA,
          asset_id: testAssetId,
          notes: 'CRITICAL_RLS_INSERT_BREACH',
        })
        .select();

      // Either Postgres throws an RLS error or returns 0 rows (depending on Supabase PostgREST version)
      if (bInsertError) {
        expect(bInsertError.message).toMatch(/policy|violat|denied|permission/i);
      } else {
        expect(bMaliciousInsert).toEqual([]);
      }

      // 6. Verify via User A client that original row is intact and unmutated
      const { data: aVerifyData } = await clientA
        .from('watchlist_items')
        .select('notes')
        .eq('id', validProbeId)
        .single();

      expect(aVerifyData?.notes).toBe('[DIRECT_RLS_PROBE] Created by User A directly in Postgres');
    } finally {
      // 7. Guaranteed cleanup in finally block even if assertions fail
      if (probeId) {
        try {
          await clientA.from('watchlist_items').delete().eq('id', probeId);
        } catch {
          // ignore cleanup error
        }
      }
    }
  });

  test('3. Controlled Stale-Cache Fallback Verification', async ({ request }) => {
    // 1. Perform a normal GET to ensure cache is populated
    const liveRes = await request.get(`${BASE_URL}/api/watchlist`);
    expect(liveRes.status()).toBe(200);
    const liveJson = await liveRes.json();
    expect(liveJson.dataStatus).toBe('live');
    expect(liveJson.refreshFailed).toBe(false);

    // 2. Trigger controlled failure via simulated refresh failure header
    const staleRes = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: {
        'x-test-force-refresh-fail': 'true'
      }
    });
    expect(staleRes.status()).toBe(200);
    const staleJson = await staleRes.json();
    // Confirms graceful stale-cache degradation with honest status flags
    expect(staleJson.dataStatus).toBe('stale');
    expect(staleJson.refreshFailed).toBe(true);
    expect(staleJson.catalogFetchedAt).toBeDefined();
    expect(Array.isArray(staleJson.catalog)).toBe(true);
    expect(staleJson.catalog.length).toBeGreaterThan(0);
  });

  test('4. Browser UI Session Integration: Sign-in -> Add Symbol -> Reload -> Verify Persistence', async ({ page }) => {
    // 1. Direct navigation to Watchlist tab
    await page.addInitScript(() => {
      localStorage.setItem('market_pulse_active_tab', 'watchlist');
    });
    await page.goto(`${BASE_URL}/#watchlist`);
    await page.waitForLoadState('networkidle');

    // 2. Open auth modal and authenticate explicitly as User A
    const signInTrigger = page.locator('button:has-text("Giriş Yap"), button:has-text("Sign In"), button:has-text("Sign in"), button:has-text("Bulut Senkronizasyonu")').first();
    await expect(signInTrigger).toBeVisible({ timeout: 10000 });
    await signInTrigger.click();

    const authForm = page.locator('form:has(input[type="email"])').first();
    await expect(authForm).toBeVisible({ timeout: 5000 });
    await page.fill('input[type="email"]', userAEmail!);
    await page.fill('input[type="password"]', userAPassword!);
    await authForm.locator('button[type="submit"]').click();

    // 3. Strictly verify authenticated state is active (wait for user's email to appear in UI)
    await expect(page.locator(`text=${userAEmail}`).first()).toBeVisible({ timeout: 15000 });

    // 4. Quick add an asset and intercept the authenticated POST /api/watchlist network request
    const quickInput = page.locator('input[placeholder*="Hızlı Varlık Ekle"], input[placeholder*="Quick add"]').first();
    await expect(quickInput).toBeVisible({ timeout: 10000 });

    const postPromise = page.waitForResponse(
      res => res.url().includes('/api/watchlist') && res.request().method() === 'POST' && res.status() === 200,
      { timeout: 15000 }
    );

    await quickInput.fill('KCHOL');
    await quickInput.press('Enter');

    const postResponse = await postPromise;
    const postData = await postResponse.json();
    expect(postData.success).toBe(true);
    expect(postData.item).toBeDefined();
    expect(postData.item.userId).toBe(userIdA);
    if (postData.item.id) {
      createdFixtureIdsForA.push(postData.item.id);
    }

    // 5. Verify KCHOL card is rendered in DOM
    await expect(page.locator('text=KCHOL').first()).toBeVisible({ timeout: 10000 });

    // 6. Reload page and confirm authenticated persistence across full browser reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Confirm session is still authenticated
    await expect(page.locator(`text=${userAEmail}`).first()).toBeVisible({ timeout: 15000 });
    // Confirm KCHOL card persisted and rendered from user's remote cloud watchlist
    await expect(page.locator('text=KCHOL').first()).toBeVisible({ timeout: 10000 });
  });
});
