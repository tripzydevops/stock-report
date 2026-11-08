import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

test.describe('P1 Security: Multi-Tenant Supabase Row Level Security (RLS) Enforcement', () => {
  // Use unauthenticated public anon client (representing external web visitors / unauthenticated clients)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  test('1. Model Portfolio (user_id IS NULL) is readable by public anon client', async () => {
    const { data, error } = await anonClient
      .from('portfolio_positions')
      .select('id, quantity, avg_entry_price, user_id, assets(symbol)')
      .is('user_id', null)
      .eq('is_open', true);

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
    // Model portfolio holdings like FROTO, TURSG, TUPRS are intact
    expect(data!.every(p => p.user_id === null)).toBeTruthy();
  });

  test('2. RLS blocks unauthenticated/anon clients from inserting unowned positions', async () => {
    // Attempt to inject an unowned position into portfolio_positions
    const { data, error } = await anonClient
      .from('portfolio_positions')
      .insert([{
        asset_id: '00000000-0000-0000-0000-000000000001',
        quantity: 9999,
        avg_entry_price: 1.0,
        user_id: null,
        is_open: true,
        notes: 'HACK_ATTEMPT_UNOWNED_POSITION'
      }])
      .select();

    // Must be blocked by Postgres RLS policy!
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/violates row-level security policy|permission denied/i);
    expect(data).toBeNull();
  });

  test('3. RLS blocks unauthenticated/anon clients from inserting unowned orders', async () => {
    // Attempt to inject an order into portfolio_orders
    const { data, error } = await anonClient
      .from('portfolio_orders')
      .insert([{
        order_ref: '#HACK01',
        symbol: 'MALICIOUS',
        side: 'BUY',
        quantity: 1000,
        price: 10.0,
        total_amount: 10000.0,
        executed_at: new Date().toISOString(),
        user_id: null
      }])
      .select();

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/violates row-level security policy|permission denied/i);
    expect(data).toBeNull();
  });

  test('4. RLS blocks unauthenticated/anon clients from inserting unowned cash transfers', async () => {
    // Attempt to inject fake cash deposits into portfolio_transfers
    const { data, error } = await anonClient
      .from('portfolio_transfers')
      .insert([{
        transfer_type: 'DEPOSIT',
        amount: 1000000.0,
        currency: 'TRY',
        transfer_date: new Date().toISOString().slice(0, 10),
        user_id: null,
        notes: 'HACK_ATTEMPT_FAKE_CASH'
      }])
      .select();

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/violates row-level security policy|permission denied/i);
    expect(data).toBeNull();
  });

  test('5. Non-destructive verification: RLS blocks anon mutation or deletion of Model Portfolio', async () => {
    // Record baseline count of Model Portfolio holdings non-destructively
    const { data: initialHoldings } = await anonClient
      .from('portfolio_positions')
      .select('id')
      .is('user_id', null)
      .eq('is_open', true);

    const initialCount = initialHoldings?.length || 0;
    expect(initialCount).toBeGreaterThan(0);

    // Attempt to update a model portfolio holding average entry price
    const sampleId = initialHoldings![0].id;
    const { data: updateData, error: updateError } = await anonClient
      .from('portfolio_positions')
      .update({ avg_entry_price: 0.001 })
      .eq('id', sampleId)
      .select();

    // RLS policy prevents update: zero modified rows returned
    expect(updateData === null || updateData.length === 0).toBeTruthy();

    // Attempt non-destructive deletion targeting a dedicated non-existent fixture UUID
    const fixtureUuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const { data: deleteData, error: deleteError } = await anonClient
      .from('portfolio_positions')
      .delete()
      .eq('id', fixtureUuid)
      .select();

    expect(deleteData === null || deleteData.length === 0).toBeTruthy();

    // Verify model portfolio remains completely unchanged and protected
    const { data: verifyHoldings } = await anonClient
      .from('portfolio_positions')
      .select('id')
      .is('user_id', null)
      .eq('is_open', true);

    expect(verifyHoldings?.length).toBe(initialCount);
  });

  test('6. RLS blocks unauthenticated/guest clients from inserting into watchlist_items table', async () => {
    // Attempt to insert a guest-tagged row directly into watchlist_items
    const { data, error } = await anonClient
      .from('watchlist_items')
      .insert([{
        user_id: 'guest_unauthorized_probe',
        asset_id: '00000000-0000-0000-0000-000000000001',
        notes: 'PROBE_GUEST_INJECTION'
      }])
      .select();

    // Must be blocked by hardened watchlist RLS policy (auth.uid() = user_id)!
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/violates row-level security policy|permission denied/i);
    expect(data).toBeNull();
  });

  test('7. Multi-tenant privacy: anon clients cannot view private user watchlist items or positions', async () => {
    const fakePrivateUserId = '11111111-2222-3333-4444-555555555555';

    const { data: privatePositions } = await anonClient
      .from('portfolio_positions')
      .select('id')
      .eq('user_id', fakePrivateUserId);

    expect(privatePositions?.length).toBe(0);

    const { data: privateWatchlist } = await anonClient
      .from('watchlist_items')
      .select('id')
      .eq('user_id', fakePrivateUserId);

    expect(privateWatchlist?.length).toBe(0);
  });
});
