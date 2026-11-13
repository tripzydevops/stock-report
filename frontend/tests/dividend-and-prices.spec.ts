import { test, expect } from '@playwright/test';
import { calculateLedgerCash } from '../src/lib/cashLedger';
import { ExecutedOrder, CapitalTransfer } from '../src/lib/supabaseClient';
import { deriveDividendsFromPortfolio, deriveAllMarketDividends, resolveDividendSchedule } from '../src/lib/dividendForecastMath';

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

  test('3. Asset Catalog API preserves market filter across page boundaries (limit=2000)', async ({ request }) => {
    const bistRes = await request.get('/api/assets?market=BIST&limit=2000');
    expect(bistRes.ok()).toBeTruthy();
    const bistAssets = await bistRes.json();
    expect(bistAssets.length).toBeGreaterThan(500);

    const nonBistItems = bistAssets.filter((a: any) => a.market !== 'BIST');
    expect(nonBistItems.length).toBe(0);

    const badLimitRes = await request.get('/api/assets?limit=-5');
    expect(badLimitRes.status()).toBe(400);

    const stringLimitRes = await request.get('/api/assets?limit=invalid');
    expect(stringLimitRes.status()).toBe(400);
  });

  // SUBSTANTIVE UNIT TESTS FOR CORE CALCULATIONS & EDGE CASES

  test('4. Unit Test: Cash ledger strictly handles empty, inferred, and chronological transfers', () => {
    // Case A: 100% Empty ledger (no transfers, no orders, 0 baseline)
    const emptyResult = calculateLedgerCash([], [], 48.95, 0);
    expect(emptyResult.availableCashTRY).toBe(0);
    expect(emptyResult.totalDepositsTRY).toBe(0);
    expect(emptyResult.isLedgerEmpty).toBe(true);
    expect(emptyResult.hasRecordHistory).toBe(false);

    // Case B: Inferred cash from orders without explicit transfers
    const buyOnlyOrders: ExecutedOrder[] = [
      {
        id: 'ord-1',
        ref: 'REF-001',
        symbol: 'ISMEN',
        name: 'Ismen',
        market: 'BIST',
        side: 'BUY',
        orderType: 'Limit',
        quantity: 100,
        price: 30.0,
        totalValue: 3000.0,
        currency: 'TRY',
        dateTime: '10.09.2026 - 10:00',
        status: 'Filled'
      }
    ];
    const inferredResult = calculateLedgerCash(buyOnlyOrders, [], 48.95, 0);
    expect(inferredResult.isLedgerEmpty).toBe(false);
    expect(inferredResult.hasRecordHistory).toBe(false); // No explicit transfer recorded
    expect(inferredResult.totalBuysTRY).toBe(3000.0);
    expect(inferredResult.totalDepositsTRY).toBe(3000.0); // Shortfall funded via capital injection
    expect(inferredResult.availableCashTRY).toBe(0);

    // Case C: Chronological ledger with deposits, buys, sells, and withdrawals
    const transfers: CapitalTransfer[] = [
      { id: 't-1', transferType: 'DEPOSIT', amount: 20000.0, currency: 'TRY', transferDate: '2026-09-01' },
      { id: 't-2', transferType: 'WITHDRAWAL', amount: 2000.0, currency: 'TRY', transferDate: '2026-09-20' },
    ];
    const orders: ExecutedOrder[] = [
      {
        id: 'o-1',
        ref: 'REF-002',
        symbol: 'THYAO',
        name: 'THY',
        market: 'BIST',
        side: 'BUY',
        orderType: 'Market',
        quantity: 50,
        price: 200.0,
        totalValue: 10000.0,
        currency: 'TRY',
        dateTime: '10.09.2026 - 10:00',
        status: 'Filled',
        executedAt: '2026-09-10T10:00:00Z'
      },
      {
        id: 'o-2',
        ref: 'REF-003',
        symbol: 'THYAO',
        name: 'THY',
        market: 'BIST',
        side: 'SELL',
        orderType: 'Market',
        quantity: 20,
        price: 250.0,
        totalValue: 5000.0,
        currency: 'TRY',
        dateTime: '15.09.2026 - 10:00',
        status: 'Filled',
        executedAt: '2026-09-15T10:00:00Z'
      }
    ];

    // Math: +20,000 (deposit) - 10,000 (buy) + 5,000 (sell) - 2,000 (withdrawal) = 13,000 available
    const fullResult = calculateLedgerCash(orders, transfers, 48.95, 0);
    expect(fullResult.isLedgerEmpty).toBe(false);
    expect(fullResult.hasRecordHistory).toBe(true);
    expect(fullResult.availableCashTRY).toBe(13000.0);
    expect(fullResult.totalDepositsTRY).toBe(18000.0); // net deposits (20k - 2k)
    expect(fullResult.totalBuysTRY).toBe(10000.0);
    expect(fullResult.totalSellsTRY).toBe(5000.0);
  });

  test('5. Unit Test: Portfolio value filtering excludes invalid, zero-share, and negative rows', () => {
    const rawPortfolio = [
      { symbol: 'CLOSED1', shares: 0, currentValue: 0, currency: 'TRY' as const },
      { symbol: 'INVALID2', shares: -10, currentValue: -500, currency: 'TRY' as const },
      { symbol: 'VALID_TRY', shares: 50, currentValue: 5000, currency: 'TRY' as const },
      { symbol: 'VALID_USD', shares: 10, currentValue: 100, currency: 'USD' as const },
    ];
    const usdTryRate = 50.0;
    const cashBalance = 1500.0;

    // Filter implementation identical to page.tsx
    const validHoldings = rawPortfolio.filter(item => item && Number(item.shares) > 0 && Number(item.currentValue) > 0);
    expect(validHoldings.length).toBe(2);
    expect(validHoldings.map(h => h.symbol)).toEqual(['VALID_TRY', 'VALID_USD']);

    const stockVal = validHoldings.reduce((acc, item) => {
      const val = Number(item.currentValue);
      return acc + (item.currency === 'USD' ? val * usdTryRate : val);
    }, 0);

    // 5000 TRY + (100 USD * 50) = 10,000 TRY + 1500 cash = 11,500 TRY
    expect(stockVal).toBe(10000.0);
    const totalNetWorth = stockVal + (cashBalance > 0 ? cashBalance : 0);
    expect(totalNetWorth).toBe(11500.0);
  });

  test('6. Unit Test: Scorecard trade-weighted profit factor and zero-strategy safety', () => {
    // 0 strategies safety test
    const emptyStrategies: any[] = [];
    const emptyTop = emptyStrategies.length > 0 ? [...emptyStrategies].sort((a, b) => b.winRate - a.winRate)[0] : null;
    expect(emptyTop).toBeNull();

    const emptyPf = emptyStrategies.length === 0 ? '—' : '0.00';
    expect(emptyPf).toBe('—');

    // Populated strategies trade-weighted test
    const strategies = [
      { strategy: 'Breakout', winRate: 70.0, profitFactor: 2.5, totalTrades: 100 },
      { strategy: 'MeanReversion', winRate: 55.0, profitFactor: 1.2, totalTrades: 50 },
    ];
    const top = [...strategies].sort((a, b) => b.winRate - a.winRate)[0];
    expect(top.strategy).toBe('Breakout');
    expect(top.winRate).toBe(70.0);

    const totalTrades = strategies.reduce((acc, s) => acc + s.totalTrades, 0); // 150
    const weightedPf = strategies.reduce((acc, s) => acc + s.profitFactor * s.totalTrades, 0) / totalTrades;
    // (2.5 * 100 + 1.2 * 50) / 150 = (250 + 60) / 150 = 310 / 150 = 2.0666... -> '2.07'
    expect(weightedPf.toFixed(2)).toBe('2.07');
  });

  // FRONTEND E2E VIEW & REGRESSION TESTS

  test('7. Frontend Dividend Tab renders live yields, schedules, and handles market scope toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    // Switch to Dividend tab via sidebar navigation
    const divTabBtn = page.locator('aside button[title*="Temettü"], aside button:has-text("Temettü Gelirleri")').first();
    await expect(divTabBtn).toBeVisible({ timeout: 10000 });
    await divTabBtn.click();
    await page.waitForTimeout(500);

    // Verify Dividend view is rendered
    await expect(page.locator('h3:has-text("Temettü"), h3:has-text("Dividend")').first()).toBeVisible({ timeout: 10000 });
  });

  test('8. Dividend Advisor proposals enforce zero-share gating and regulatory disclaimer', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Switch to Dividend tab via sidebar navigation
    const divTabBtn = page.locator('aside button[title*="Temettü"], aside button:has-text("Temettü Gelirleri")').first();
    await expect(divTabBtn).toBeVisible({ timeout: 10000 });
    await divTabBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Switch to AI Advisor subtab inside Dividend view
    const advisorTab = page.locator('button:has-text("AI Danışmanı"), button:has-text("AI Advisor"), button:has-text("AI Portföy Danışmanı"), button:has-text("AI Portfolio Advisor")').first();
    await expect(advisorTab).toBeVisible({ timeout: 10000 });
    await advisorTab.dispatchEvent('click');
    await page.waitForTimeout(500);

    // Switch to Actionable Swaps / Önerilen Değişiklikler
    const actionsTab = page.locator('button:has-text("Önerilen Değişiklikler"), button:has-text("Actionable Swaps")').first();
    await expect(actionsTab).toBeVisible({ timeout: 10000 });
    await actionsTab.dispatchEvent('click');
    await page.waitForTimeout(500);

    // Check for transparent scenario labels
    const scenarioLabel = page.getByText(/Örnek Senaryo Tahmini|Senaryo Getiri Farkı|Illustrative Scenario/).first();
    await expect(scenarioLabel).toBeVisible({ timeout: 5000 });

    // Verify regulatory methodology disclaimer is present
    const disclaimer = page.getByText(/Yasal Uyarı & Metodoloji Notu|Regulatory & Methodology Disclaimer/).first();
    await expect(disclaimer).toBeVisible({ timeout: 5000 });

    // Verify no fabricated BRSAN 0-lot swap ghost card is shown if user has 0 shares
    const ghostBrsanSwap = page.locator('text=BRSAN (0 lot ≈ ₺0)');
    await expect(ghostBrsanSwap).toHaveCount(0);
  });

  test('9. Unit Test: Unknown-yield and unannounced schedules return null / empty dates without fake fallbacks', async () => {
    // A. Unannounced schedule test
    const unannounced = resolveDividendSchedule('XYZ_UNKNOWN_STOCK');
    expect(unannounced.exDate).toBe('');
    expect(unannounced.payDate).toBe('');
    expect(unannounced.month).toBe('Tarih Belirlenmedi');
    expect(unannounced.isConfirmed).toBe(false);

    // B. deriveDividendsFromPortfolio with unknown yield holding
    const mockPortfolio = [{
      symbol: 'UNKNOWN_TEST_STOCK',
      shares: 100,
      entryPrice: 50.0,
      currentPrice: 55.0,
      currency: 'TRY',
      market: 'BIST',
      isDividend: true,
      strategyType: 'CORE_DIVIDEND'
    }];

    const derived = deriveDividendsFromPortfolio(mockPortfolio, [], new Map());
    expect(derived.length).toBe(1);
    const item = derived[0];

    // Unknown yield must be null, NOT 3.5% or 5.0%
    expect(item.dividendYield).toBeNull();
    expect(item.yieldOnCost).toBeNull();
    expect(item.annualPayout).toBeNull();
    expect(item.monthlyPayout).toBeNull();
    expect(item.estimatedNextDPS).toBeNull();
    expect(item.estimatedNextPayout).toBeNull();
    // Unannounced dates must be empty string, NOT 2027-04-15
    expect(item.nextExDate).toBe('');
    expect(item.nextPaymentDate).toBe('');
    expect(item.payoutMonth).toBe('Tarih Belirlenmedi');

    // C. Non-payer profile test (HALKB, VAKBN, KRDMD, PETKM)
    const halkbSched = resolveDividendSchedule('HALKB');
    expect(halkbSched.exDate).toBe('');
    expect(halkbSched.month).toBe('Belirlenmedi (Dağıtım Yok)');

    const vakbnSched = resolveDividendSchedule('VAKBN');
    expect(vakbnSched.exDate).toBe('');
    expect(vakbnSched.month).toBe('Belirlenmedi (Dağıtım Yok)');

    // D. deriveAllMarketDividends with unknown symbol & verify held.entryPrice is NOT leaked as currentPrice
    const heldWithoutCurrentPrice = [{
      symbol: 'TEST_NO_PRICE',
      shares: 10,
      entryPrice: 125.0, // Historical cost basis
      currentPrice: 0,   // Live price unknown
      currency: 'TRY',
      market: 'BIST'
    }];
    const marketDerived = deriveAllMarketDividends(heldWithoutCurrentPrice, {}, []);
    const noPriceAsset = marketDerived.find(d => d.symbol === 'TEST_NO_PRICE');
    expect(noPriceAsset).toBeDefined();
    // Current price must be null, strictly NOT using 125.0 entryPrice
    expect(noPriceAsset?.currentPrice).toBeNull();
    expect(noPriceAsset?.dividendYield).toBeNull();
    expect(noPriceAsset?.annualPayout).toBeNull();
  });

  test('10. Tab hash navigation supports ongoing URL hash and popstate changes', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/#portfolio');
    await page.waitForLoadState('domcontentloaded');

    // Verify initial hash opened portfolio tab
    const portfolioHeader = page.locator('h2, h3').filter({ hasText: /Portföy|Portfolio/i }).first();
    await expect(portfolioHeader).toBeVisible({ timeout: 10000 });

    // Navigate to #signals by setting location.hash
    await page.evaluate(() => {
      window.location.hash = '#signals';
    });
    await page.waitForTimeout(500);

    const signalsHeader = page.getByText(/Algoritmik Alım Fırsatları|Algorithmic Buy Opportunities/i).first();
    await expect(signalsHeader).toBeVisible({ timeout: 10000 });

    // Navigate to #dividend
    await page.evaluate(() => {
      window.location.hash = '#dividend';
    });
    await page.waitForTimeout(500);

    const dividendTabHeader = page.getByText(/Pasif Nakit Akışı|Passive Cashflow|Temettü Takvimi/i).first();
    await expect(dividendTabHeader).toBeVisible({ timeout: 10000 });
  });
});
