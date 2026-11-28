import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePortfolioTransfer, handleDeletePosition } from '../portfolioRouteHandlers.mjs';

function createMockSupabase(initialData = {}) {
  const userId = initialData.userId || 'user-test-uuid';
  const user = { id: userId, email: 'test@example.com' };

  const tables = {
    portfolio_transfers: [...(initialData.transfers || [])],
    portfolio_orders: [...(initialData.orders || [])],
    portfolio_positions: [...(initialData.positions || [])],
  };

  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    rpc: async (fnName, params) => {
      if (fnName === 'execute_portfolio_cash_transfer') {
        const { p_transfer_type, p_amount, p_currency, p_transfer_date, p_notes, p_client_order_id } = params;

        // Check idempotency
        if (p_client_order_id) {
          const existing = tables.portfolio_transfers.find(
            (t) => t.user_id === userId && t.client_order_id === p_client_order_id
          );
          if (existing) {
            return {
              data: { deduplicated: true, transfer: existing },
              error: null,
            };
          }
        }

        // Check solvency for WITHDRAWAL
        if (p_transfer_type === 'WITHDRAWAL') {
          let runningCash = 0;
          for (const t of tables.portfolio_transfers) {
            if (t.user_id === userId && t.currency?.toUpperCase() === p_currency?.toUpperCase()) {
              if (['DEPOSIT', 'DIVIDEND'].includes(t.transfer_type)) runningCash += Number(t.amount);
              else if (['WITHDRAWAL', 'TAX', 'FEE'].includes(t.transfer_type)) runningCash -= Number(t.amount);
            }
          }
          for (const o of tables.portfolio_orders) {
            if (o.user_id === userId && o.currency?.toUpperCase() === p_currency?.toUpperCase() && o.status === 'Filled') {
              if (o.side === 'SELL') runningCash += Number(o.total_amount);
              else if (o.side === 'BUY') runningCash -= Number(o.total_amount);
            }
          }

          if (Number(p_amount) > runningCash) {
            return {
              data: null,
              error: {
                message: `INSUFFICIENT_CASH: Available balance (${runningCash.toFixed(2)} ${p_currency}) is insufficient for withdrawal of ${Number(p_amount).toFixed(2)} ${p_currency}.`,
              },
            };
          }
        }

        const newRecord = {
          id: `tx-${tables.portfolio_transfers.length + 1}`,
          user_id: userId,
          transfer_type: p_transfer_type,
          amount: p_amount,
          currency: p_currency,
          transfer_date: p_transfer_date,
          notes: p_notes,
          client_order_id: p_client_order_id,
        };
        tables.portfolio_transfers.push(newRecord);

        return {
          data: { transfer_id: newRecord.id, deduplicated: false },
          error: null,
        };
      }
      return { data: null, error: { message: `RPC ${fnName} does not exist` } };
    },
    from: (tableName) => {
      const records = tables[tableName] || [];
      let filters = {};

      const builder = {
        select: () => builder,
        eq: (col, val) => {
          filters[col] = val;
          return builder;
        },
        maybeSingle: async () => {
          const match = records.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          return { data: match || null, error: null };
        },
        single: async () => {
          const match = records.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          return { data: match || null, error: match ? null : { message: 'Row not found' } };
        },
        insert: (rows) => {
          const inserted = [];
          for (const row of Array.isArray(rows) ? rows : [rows]) {
            // Check unique constraint violation
            if (tableName === 'portfolio_transfers' && row.client_order_id) {
              const dup = records.find(
                (r) => r.user_id === row.user_id && r.client_order_id === row.client_order_id
              );
              if (dup) {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                    }),
                  }),
                };
              }
            }
            const record = { id: `id-${records.length + 1}`, ...row };
            records.push(record);
            inserted.push(record);
          }
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },
        delete: () => ({
          eq: (col1, val1) => ({
            eq: async (col2, val2) => {
              const idx = records.findIndex((r) => r[col1] === val1 && r[col2] === val2);
              if (idx >= 0) {
                records.splice(idx, 1);
              }
              return { error: null };
            },
          }),
        }),
      };
      return builder;
    },
    _getTables: () => tables,
  };
}

// ==========================================
// Tests for POST /api/portfolio/transfers
// ==========================================

test('POST /api/portfolio/transfers: Valid deposit inserts 1 row and returns HTTP 201', async () => {
  const mockDb = createMockSupabase();

  const req = new Request('http://localhost/api/portfolio/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transferType: 'DEPOSIT',
      amount: 15000,
      currency: 'TRY',
      transferDate: '2026-11-28',
      client_order_id: 'cl-dep-001',
    }),
  });

  const res = await handlePortfolioTransfer(req, { authSupabase: mockDb });
  const json = await res.json();

  assert.equal(res.status, 201);
  assert.equal(json.success, true);
  assert.equal(json.transferType, 'DEPOSIT');
  assert.equal(json.amount, 15000);
  assert.equal(json.currency, 'TRY');
  assert.equal(mockDb._getTables().portfolio_transfers.length, 1);
});

test('POST /api/portfolio/transfers: Duplicate deposit with same client_order_id returns existing row with HTTP 200 deduplicated: true', async () => {
  const mockDb = createMockSupabase({
    transfers: [
      {
        id: 'tx-existing-1',
        user_id: 'user-test-uuid',
        transfer_type: 'DEPOSIT',
        amount: 25000,
        currency: 'TRY',
        transfer_date: '2026-11-28',
        client_order_id: 'cl-dup-123',
      },
    ],
  });

  const req = new Request('http://localhost/api/portfolio/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transferType: 'DEPOSIT',
      amount: 25000,
      currency: 'TRY',
      transferDate: '2026-11-28',
      client_order_id: 'cl-dup-123',
    }),
  });

  const res = await handlePortfolioTransfer(req, { authSupabase: mockDb });
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.deduplicated, true);
  assert.equal(json.transfer?.client_order_id, 'cl-dup-123');
  // Must NOT insert duplicate record
  assert.equal(mockDb._getTables().portfolio_transfers.length, 1);
});

test('POST /api/portfolio/transfers: Invalid transfer type returns HTTP 400', async () => {
  const mockDb = createMockSupabase();

  for (const badType of ['DIVIDEND', 'FOO', 'BAR', '']) {
    const req = new Request('http://localhost/api/portfolio/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transferType: badType,
        amount: 500,
      }),
    });

    const res = await handlePortfolioTransfer(req, { authSupabase: mockDb });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.match(json.error, /Invalid transfer type/i);
  }
});

test('POST /api/portfolio/transfers: Invalid date (future or malformed) returns HTTP 400', async () => {
  const mockDb = createMockSupabase();

  const badDates = ['2099-01-01', 'bad-date', '2026-13-45'];
  for (const badDate of badDates) {
    const req = new Request('http://localhost/api/portfolio/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transferType: 'DEPOSIT',
        amount: 1000,
        transferDate: badDate,
      }),
    });

    const res = await handlePortfolioTransfer(req, { authSupabase: mockDb });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.ok(json.error.includes('date') || json.error.includes('Future'));
  }
});

test('POST /api/portfolio/transfers: Withdrawal exceeding available balance returns HTTP 400 INSUFFICIENT_CASH', async () => {
  const mockDb = createMockSupabase({
    transfers: [
      {
        id: 'tx-seed-1',
        user_id: 'user-test-uuid',
        transfer_type: 'DEPOSIT',
        amount: 5000,
        currency: 'TRY',
      },
    ],
  });

  const req = new Request('http://localhost/api/portfolio/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transferType: 'WITHDRAWAL',
      amount: 15000, // Exceeds 5,000 balance
      currency: 'TRY',
      transferDate: '2026-11-28',
    }),
  });

  const res = await handlePortfolioTransfer(req, { authSupabase: mockDb });
  const json = await res.json();

  assert.equal(res.status, 400);
  assert.equal(json.code, 'INSUFFICIENT_CASH');
  assert.match(json.error, /INSUFFICIENT_CASH/i);
  // Transfer table must still only have the initial seed deposit
  assert.equal(mockDb._getTables().portfolio_transfers.length, 1);
});

// ==========================================
// Tests for DELETE /api/portfolio/positions
// ==========================================

test('DELETE /api/portfolio/positions: Missing or malformed positionId returns HTTP 400', async () => {
  const mockDb = createMockSupabase();

  // Missing
  const reqMissing = new Request('http://localhost/api/portfolio/positions', { method: 'DELETE' });
  const resMissing = await handleDeletePosition(reqMissing, { authSupabase: mockDb });
  assert.equal(resMissing.status, 400);

  // Malformed UUID
  const reqMalformed = new Request('http://localhost/api/portfolio/positions?positionId=not-a-uuid', { method: 'DELETE' });
  const resMalformed = await handleDeletePosition(reqMalformed, { authSupabase: mockDb });
  assert.equal(resMalformed.status, 400);
  const jsonMalformed = await resMalformed.json();
  assert.match(jsonMalformed.error, /Invalid positionId format/i);
});

test('DELETE /api/portfolio/positions: Position not found or owned by another user returns HTTP 404', async () => {
  const mockDb = createMockSupabase({
    positions: [
      {
        id: '11111111-2222-3333-4444-555555555555',
        user_id: 'another-user-uuid',
        asset_id: 'asset-1',
      },
    ],
  });

  const targetId = '11111111-2222-3333-4444-555555555555';
  const req = new Request(`http://localhost/api/portfolio/positions?positionId=${targetId}`, { method: 'DELETE' });
  const res = await handleDeletePosition(req, { authSupabase: mockDb });

  assert.equal(res.status, 404);
  const json = await res.json();
  assert.match(json.error, /not found or belongs to another user/i);
});

test('DELETE /api/portfolio/positions: Valid deletion removes position record and preserves orders', async () => {
  const validPosId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const mockDb = createMockSupabase({
    positions: [
      {
        id: validPosId,
        user_id: 'user-test-uuid',
        asset_id: 'asset-froto',
      },
    ],
    orders: [
      {
        id: 'ord-historical-1',
        user_id: 'user-test-uuid',
        symbol: 'FROTO',
        quantity: 10,
        price: 1100,
        status: 'Filled',
      },
    ],
  });

  const req = new Request(`http://localhost/api/portfolio/positions?positionId=${validPosId}`, { method: 'DELETE' });
  const res = await handleDeletePosition(req, { authSupabase: mockDb });
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.deletedPositionId, validPosId);

  // Position removed
  assert.equal(mockDb._getTables().portfolio_positions.length, 0);
  // Order history strictly preserved
  assert.equal(mockDb._getTables().portfolio_orders.length, 1);
});
