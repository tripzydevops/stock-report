import { test, expect } from '@playwright/test';

test.describe('Watchlist API Authentication & Early Guard Enforcement', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

  test('1. POST /api/watchlist returns 401 when Authorization header is missing', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/watchlist`, {
      data: {
        symbol: 'NEW_UNAUTH_PROBE',
        name: 'Probe Asset',
        assetClass: 'stock',
        market: 'BIST'
      }
    });

    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Authentication required|Unauthorized/i);
  });

  test('2. PATCH /api/watchlist returns 401 when Authorization header is missing', async ({ request }) => {
    const res = await request.patch(`${BASE_URL}/api/watchlist`, {
      data: {
        id: 'some-item-id',
        notes: 'Unauthorized edit probe'
      }
    });

    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Authentication required|Unauthorized/i);
  });

  test('3. DELETE /api/watchlist returns 401 when Authorization header is missing', async ({ request }) => {
    const res = await request.delete(`${BASE_URL}/api/watchlist?id=some-item-id`);

    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Authentication required|Unauthorized/i);
  });

  test('4. POST /api/watchlist returns 401 with invalid / expired token', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/watchlist`, {
      headers: {
        Authorization: 'Bearer invalid.expired.token'
      },
      data: {
        symbol: 'PROBE_INVALID_TOKEN',
        name: 'Probe Asset',
        assetClass: 'stock',
        market: 'BIST'
      }
    });

    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Authentication required|Unauthorized/i);
  });

  test('5. GET /api/watchlist returns public catalog when unauthenticated (safe fallback without private leaks)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/watchlist`);
    expect(res.status()).toBe(200);
    const json = await res.json();

    expect(json).toHaveProperty('items');
    expect(json).toHaveProperty('catalog');
    // Without an auth token, user items must be empty
    expect(json.items).toEqual([]);
    expect(Array.isArray(json.catalog)).toBe(true);
    expect(json.catalog.length).toBeGreaterThan(0);

    // Verify all catalog items have valid structure and honest nulls where unmeasured
    for (const cat of json.catalog.slice(0, 10)) {
      expect(cat).toHaveProperty('symbol');
      expect(cat).toHaveProperty('name');
      // If dailyChangePercent exists, it must be either a number or null (never undefined)
      if (cat.dailyChangePercent !== null) {
        expect(typeof cat.dailyChangePercent).toBe('number');
      }
    }
  });
});
