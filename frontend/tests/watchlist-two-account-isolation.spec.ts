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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
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
    test.skip(!userAEmail || !userAPassword || !userBEmail || !userBPassword,
      'Test user credentials not configured in TEST_USER_A_* / TEST_USER_B_* env vars.');

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenA}` } }
    });
    const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${tokenB}` } }
    });

    // 1. First, create a fixture directly as User A
    const { data: fixtureRow, error: insertError } = await clientA
      .from('watchlist_items')
      .insert({
        user_id: userIdA,
        asset_id: '25dfa345-3d22-4e53-b6aa-ef17b4d1cf03', // THYAO asset ID
        notes: '[DIRECT_RLS_PROBE] Created by User A directly in Postgres',
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(fixtureRow).toBeDefined();
    const probeId = fixtureRow.id;
    createdFixtureIdsForA.push(probeId);

    // 2. User B directly attempts to SELECT User A's row without specifying user_id filter
    // RLS policy: (auth.uid() = user_id) MUST evaluate to FALSE, returning 0 rows!
    const { data: bSelectData, error: bSelectError } = await clientB
      .from('watchlist_items')
      .select('*')
      .eq('id', probeId);

    expect(bSelectError).toBeNull();
    expect(bSelectData).toEqual([]); // Zero rows returned directly by PostgreSQL engine!

    // 3. User B directly attempts to UPDATE User A's row
    const { data: bUpdateData, error: bUpdateError } = await clientB
      .from('watchlist_items')
      .update({ notes: 'CRITICAL_RLS_BREACH' })
      .eq('id', probeId)
      .select();

    expect(bUpdateError).toBeNull();
    expect(bUpdateData).toEqual([]); // 0 rows mutated by PostgreSQL engine!

    // 4. User B directly attempts to DELETE User A's row
    const { data: bDeleteData, error: bDeleteError } = await clientB
      .from('watchlist_items')
      .delete()
      .eq('id', probeId)
      .select();

    expect(bDeleteError).toBeNull();
    expect(bDeleteData).toEqual([]); // 0 rows deleted by PostgreSQL engine!

    // 5. Verify via User A client that row is intact and unmutated
    const { data: aVerifyData } = await clientA
      .from('watchlist_items')
      .select('notes')
      .eq('id', probeId)
      .single();

    expect(aVerifyData?.notes).toBe('[DIRECT_RLS_PROBE] Created by User A directly in Postgres');

    // 6. User A cleans up its own probe row
    await clientA.from('watchlist_items').delete().eq('id', probeId);
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

    // 2. Click sign-in button if not already authenticated in this context
    const signInTrigger = page.locator('button:has-text("Bulut Senkronizasyonu"), button:has-text("Giriş Yap"), button:has-text("Sign in")').first();
    if (await signInTrigger.isVisible({ timeout: 4000 }).catch(() => false)) {
      await signInTrigger.click();
      await page.waitForSelector('input[type="email"]');
      await page.fill('input[type="email"]', userAEmail!);
      await page.fill('input[type="password"]', userAPassword!);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
    }

    // 3. Quick add an asset (e.g. KCHOL)
    const quickInput = page.locator('input[placeholder*="Hızlı Varlık Ekle"], input[placeholder*="Quick add"]').first();
    await expect(quickInput).toBeVisible({ timeout: 10000 });
    await quickInput.fill('KCHOL');
    await quickInput.press('Enter');
    await page.waitForTimeout(2000);

    // 4. Verify KCHOL card is present in DOM
    await expect(page.locator('text=KCHOL').first()).toBeVisible({ timeout: 10000 });

    // 5. Reload page and confirm persistence across session restore
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=KCHOL').first()).toBeVisible({ timeout: 10000 });
  });
});
