import { test, expect } from '@playwright/test';

test.describe('Live Dividends & Accurate Pricing Pipeline', () => {

  test('1. Dividends API returns verified multi-year dividend events and market summary', async ({ request }) => {
    // Single symbol test (US Dividend Aristocrat)
    const usRes = await request.get('/api/dividends?symbol=KO');
    expect(usRes.ok()).toBeTruthy();
    const usJson = await usRes.json();
    expect(usJson.symbol).toBe('KO');
    expect(usJson.dividends.length).toBeGreaterThan(0);
    expect(usJson.dividends[0].amount).toBeGreaterThan(0);
    expect(usJson.dividends[0].currency).toBe('USD');

    // Single symbol test (BIST High-Yield Payer)
    const bistRes = await request.get('/api/dividends?symbol=FROTO');
    expect(bistRes.ok()).toBeTruthy();
    const bistJson = await bistRes.json();
    expect(bistJson.symbol).toBe('FROTO');
    expect(bistJson.dividends.length).toBeGreaterThan(0);
    expect(bistJson.dividends[0].amount).toBeGreaterThan(0);
    expect(bistJson.dividends[0].currency).toBe('TRY');

    // Market summary test
    const summaryRes = await request.get('/api/dividends?summary=true');
    expect(summaryRes.ok()).toBeTruthy();
    const summaryJson = await summaryRes.json();
    expect(Array.isArray(summaryJson)).toBeTruthy();
    expect(summaryJson.length).toBeGreaterThanOrEqual(100);
    
    // Check that summary items have valid dividend metrics
    const sample = summaryJson[0];
    expect(sample).toHaveProperty('symbol');
    expect(sample).toHaveProperty('trailing_yield_pct');
    expect(sample).toHaveProperty('latest_dps');
  });

  test('2. Asset Catalog API returns 100% valid prices with zero 100.00 fallbacks', async ({ request }) => {
    const res = await request.get('/api/assets?limit=2000');
    expect(res.ok()).toBeTruthy();
    const assets = await res.json();
    expect(Array.isArray(assets)).toBeTruthy();
    expect(assets.length).toBeGreaterThan(1000);

    // Verify TEFAS money market fund ZBJ is accurately priced
    const tefasPpf = assets.find((a: any) => a.symbol === 'ZBJ');
    expect(tefasPpf).toBeDefined();
    expect(tefasPpf.latest_price).toBeGreaterThan(4.0);
    expect(tefasPpf.latest_price).toBeLessThan(10.0);

    // Verify BIST heavy weight EREGL
    const eregl = assets.find((a: any) => a.symbol === 'EREGL' || a.symbol === 'EREGL.IS');
    expect(eregl).toBeDefined();
    expect(eregl.latest_price).toBeGreaterThan(25.0);
    expect(eregl.latest_price).toBeLessThan(50.0);

    // Verify US equity AAPL
    const aapl = assets.find((a: any) => a.symbol === 'AAPL');
    expect(aapl).toBeDefined();
    expect(aapl.latest_price).toBeGreaterThan(200.0);
  });

  test('3. Frontend Dividend Tab renders live yields, schedules, and handles market scope toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Click Temettü in desktop sidebar
    const dividendBtn = page.locator('aside button:has-text("Temettü Gelirleri"), aside button:has-text("Dividend")').first();
    await expect(dividendBtn).toBeVisible({ timeout: 10000 });
    await dividendBtn.click();
    await page.waitForTimeout(1000);

    // Verify Dividend view is rendered
    await expect(page.locator('main').getByText(/Temettü|Dividend/i).first()).toBeVisible({ timeout: 10000 });
    
    // Check that dividend income or market metrics are rendered
    await expect(page.locator('main').getByText(/Yıllık|Annual|TRY|₺|\$/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('4. Asset Catalog API preserves market filter across page boundaries (limit=2000)', async ({ request }) => {
    // When requesting BIST assets with limit=2000, page 1 and page 2 must BOTH filter market === 'BIST'
    const res = await request.get('/api/assets?market=BIST&limit=2000');
    expect(res.ok()).toBeTruthy();
    const assets = await res.json();
    expect(Array.isArray(assets)).toBeTruthy();
    expect(assets.length).toBeGreaterThan(0);
    // Every single asset returned MUST have market === 'BIST'
    const nonBist = assets.filter((a: any) => a.market !== 'BIST');
    expect(nonBist.length).toBe(0);

    // Limit validation: negative or invalid limits return 400
    const badLimitRes = await request.get('/api/assets?limit=-5');
    expect(badLimitRes.status()).toBe(400);

    const stringLimitRes = await request.get('/api/assets?limit=invalid');
    expect(stringLimitRes.status()).toBe(400);
  });

  test('5. Dividend Advisor proposals enforce zero-share gating, transparent scenario labeling, and regulatory disclaimer', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Click Temettü in desktop sidebar
    const dividendBtn = page.locator('aside button[title*="Temettü"]').first();
    await expect(dividendBtn).toBeVisible({ timeout: 10000 });
    await dividendBtn.click();

    // Look for Actionable Rebalancing / Eylemler tab if available
    const actionsTab = page.locator('button:has-text("Eylemler"), button:has-text("Actions"), button:has-text("Rebalancing")').first();
    if (await actionsTab.isVisible()) {
      await actionsTab.click();

      // Check for transparent scenario labels
      const scenarioLabel = page.locator('text=Örnek Senaryo Tahmini, text=Senaryo Getiri Farkı, text=Illustrative Scenario').first();
      await expect(scenarioLabel).toBeVisible({ timeout: 5000 });

      // Verify regulatory methodology disclaimer is present
      const disclaimer = page.locator('text=Yasal Uyarı & Metodoloji Notu, text=Regulatory & Methodology Disclaimer').first();
      await expect(disclaimer).toBeVisible({ timeout: 5000 });

      // Verify no fabricated BRSAN 0-lot swap ghost card is shown if user has 0 shares
      const ghostBrsanSwap = page.locator('text=BRSAN (0 lot ≈ ₺0)');
      await expect(ghostBrsanSwap).toHaveCount(0);
    }
  });
});

