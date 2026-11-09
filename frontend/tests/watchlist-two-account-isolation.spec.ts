import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

test.describe('Watchlist Multi-Tenant Authenticated Persistence & Account Isolation', () => {
  let tokenA: string;
  let userIdA: string;
  let tokenB: string;
  let userIdB: string;

  test.beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const pass = 'SuperSecretPass123!';

    // Sign in Account A
    const resA = await supabase.auth.signInWithPassword({
      email: 'test_pulse_user_a@gmail.com',
      password: pass
    });
    expect(resA.error).toBeNull();
    expect(resA.data.session?.access_token).toBeDefined();
    tokenA = resA.data.session!.access_token;
    userIdA = resA.data.user!.id;

    // Sign in Account B
    const resB = await supabase.auth.signInWithPassword({
      email: 'test_pulse_user_b@gmail.com',
      password: pass
    });
    expect(resB.error).toBeNull();
    expect(resB.data.session?.access_token).toBeDefined();
    tokenB = resB.data.session!.access_token;
    userIdB = resB.data.user!.id;

    expect(userIdA).not.toEqual(userIdB);
  });

  test('Two-Account Lifecycle: Add -> Persist -> Edit -> Isolate -> Prevent Cross-Tenant Mutation -> Delete', async ({ request }) => {
    // 0. Initial Clean-up: purge any prior test items for both users
    const initialGetA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const jsonInitialA = await initialGetA.json();
    for (const item of jsonInitialA.items || []) {
      await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(item.id)}`, {
        headers: { Authorization: `Bearer ${tokenA}` }
      });
    }

    const initialGetB = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const jsonInitialB = await initialGetB.json();
    for (const item of jsonInitialB.items || []) {
      await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(item.id)}`, {
        headers: { Authorization: `Bearer ${tokenB}` }
      });
    }

    // 1. Account A adds an item (THYAO.IS) with notes and price alerts
    const addResA = await request.post(`${BASE_URL}/api/watchlist`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      data: {
        symbol: 'THYAO.IS',
        notes: 'Account A aviation thesis: strong passenger load',
        alertAbove: 350,
        alertBelow: 280
      }
    });

    expect([200, 201]).toContain(addResA.status());
    const postJson = await addResA.json();
    expect(postJson.success).toBe(true);
    expect(postJson.item).toHaveProperty('id');
    const itemAId = postJson.item.id;

    // 2. Account A refreshes GET /api/watchlist and confirms persistence
    const refreshGetA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(refreshGetA.status()).toBe(200);
    const refreshJsonA = await refreshGetA.json();
    expect(refreshJsonA.items.length).toBe(1);
    expect(refreshJsonA.items[0].id).toBe(itemAId);
    expect(refreshJsonA.items[0].notes).toBe('Account A aviation thesis: strong passenger load');
    expect(refreshJsonA.items[0].alertAbove).toBe(350);
    expect(refreshJsonA.items[0].alertBelow).toBe(280);

    // Verify cache metadata is returned
    expect(refreshJsonA).toHaveProperty('dataStatus');
    expect(['live', 'stale']).toContain(refreshJsonA.dataStatus);
    expect(refreshJsonA).toHaveProperty('catalogFetchedAt');
    expect(refreshJsonA).toHaveProperty('refreshFailed');

    // 3. Account A edits notes and targets
    const patchResA = await request.patch(`${BASE_URL}/api/watchlist`, {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      },
      data: {
        id: itemAId,
        notes: 'Updated thesis: cargo segment record revenue',
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
    expect(verifyJsonA.items[0].notes).toBe('Updated thesis: cargo segment record revenue');
    expect(verifyJsonA.items[0].alertAbove).toBe(375);
    expect(verifyJsonA.items[0].alertBelow).toBe(290);

    // 4. Multi-Tenant Isolation: Account B queries watchlist -> MUST BE EMPTY
    const getResB = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(getResB.status()).toBe(200);
    const jsonB = await getResB.json();
    expect(jsonB.userId).toBe(userIdB);
    expect(jsonB.items).toEqual([]); // Account B cannot see Account A's items!

    // 5. Cross-Tenant Protection: Account B attempts to PATCH Account A's item
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
    // PostgREST with RLS updates 0 rows for unowned id, returning 404
    expect(maliciousPatchB.status()).toBe(404);

    // Verify Account A's item was NOT mutated
    const verifyUnmutatedA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifyUnmutatedJsonA = await verifyUnmutatedA.json();
    expect(verifyUnmutatedJsonA.items[0].notes).toBe('Updated thesis: cargo segment record revenue');
    expect(verifyUnmutatedJsonA.items[0].notes).not.toContain('MALICIOUS');

    // 6. Cross-Tenant Protection: Account B attempts to DELETE Account A's item
    const maliciousDeleteB = await request.delete(`${BASE_URL}/api/watchlist?id=${encodeURIComponent(itemAId)}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(maliciousDeleteB.status()).toBe(404);

    // Verify Account A's item is STILL intact
    const verifyStillExistsA = await request.get(`${BASE_URL}/api/watchlist`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const verifyStillExistsJsonA = await verifyStillExistsA.json();
    expect(verifyStillExistsJsonA.items.length).toBe(1);
    expect(verifyStillExistsJsonA.items[0].id).toBe(itemAId);

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
    expect(finalJsonA.items).toEqual([]);
  });
});
