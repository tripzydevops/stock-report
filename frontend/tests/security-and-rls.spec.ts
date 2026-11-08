import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://erzxltcalghadzfevfjx.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI';

test.describe('P1 Security: Multi-Tenant Supabase Row Level Security (RLS) Enforcement', () => {
  // Use unauthenticated public anon client (representing external web visitors / potential attackers)
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

  test('5. RLS protects Model Portfolio from deletion by anon clients', async () => {
    // Attempt to delete model portfolio positions
    const { data, error } = await anonClient
      .from('portfolio_positions')
      .delete()
      .is('user_id', null)
      .select();

    // RLS policy prevents deletion: zero rows returned
    expect(data === null || data.length === 0).toBeTruthy();

    // Verify model portfolio remains completely intact
    const { data: checkData } = await anonClient
      .from('portfolio_positions')
      .select('id')
      .is('user_id', null)
      .eq('is_open', true);

    expect(checkData?.length).toBeGreaterThan(0);
  });
});
