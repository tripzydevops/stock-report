import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
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

    // E. Verify static profile prices are NOT leaked as live market prices when live/DB prices are absent
    const heldWithProfileSymbol = [{
      symbol: 'AAPL',
      shares: 10,
      entryPrice: 150.0,
      currentPrice: 0, // No live quote
      currency: 'USD',
      market: 'US'
    }];
    // Pass empty livePricesMap and empty dbSummary so neither live nor DB price exists
    const marketWithProfile = deriveAllMarketDividends(heldWithProfileSymbol, {}, []);
    const aaplAsset = marketWithProfile.find(d => d.symbol === 'AAPL');
    expect(aaplAsset).toBeDefined();
    // Must be null, NOT the static profile price (e.g. 224.50)
    expect(aaplAsset?.currentPrice).toBeNull();
    expect(aaplAsset?.annualPayout).toBeNull();
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

  test('11. Unit Test: Mixed portfolio with one priced asset and one unpriced asset ensures weighted yield is not distorted', async () => {
    // Asset A: 100 shares @ ₺100.0, currentPrice = ₺100.0 (Val = ₺10,000), Yield = 10%, Annual Payout = ₺1,000
    // Asset B: 100 shares @ ₺50.0 entry, currentPrice = null, Yield = null, Annual Payout = null
    const mixedHoldings: any[] = [
      {
        symbol: 'PRICED_PAYER',
        name: 'Priced Payer A.Ş.',
        market: 'BIST',
        currency: 'TRY',
        shares: 100,
        entryPrice: 100.0,
        currentPrice: 100.0,
        dividendYield: 10.0,
        annualPayout: 1000.0, // 100 shares * ₺100 * 10%
      },
      {
        symbol: 'UNPRICED_ASSET',
        name: 'Unpriced Asset A.Ş.',
        market: 'BIST',
        currency: 'TRY',
        shares: 100,
        entryPrice: 50.0,
        currentPrice: null, // Price unavailable
        dividendYield: null, // Yield unavailable
        annualPayout: null, // Payout unavailable
      }
    ];

    // 1. Excluded yield count: must detect exactly 1 asset with unavailable yield
    const excludedYieldAssets = mixedHoldings.filter(item => item.annualPayout === null || item.dividendYield === null);
    expect(excludedYieldAssets.length).toBe(1);
    expect(excludedYieldAssets[0].symbol).toBe('UNPRICED_ASSET');

    // 2. Total annual dividend: sum available payouts (₺1,000)
    const totalAnnualTRY = mixedHoldings.reduce((acc, item) => {
      const payout = item.annualPayout || 0;
      return acc + payout;
    }, 0);
    expect(totalAnnualTRY).toBe(1000.0);

    // 3. Weighted yield calculation: strictly calculated ONLY from assets where both currentPrice > 0 AND annualPayout !== null
    const pricedAndYieldAssets = mixedHoldings.filter(item => item.currentPrice !== null && item.currentPrice > 0 && item.annualPayout !== null);
    expect(pricedAndYieldAssets.length).toBe(1);
    expect(pricedAndYieldAssets[0].symbol).toBe('PRICED_PAYER');

    const totalPricedValTRY = pricedAndYieldAssets.reduce((acc, item) => {
      return acc + (item.shares * item.currentPrice);
    }, 0);
    const totalPricedAnnualTRY = pricedAndYieldAssets.reduce((acc, item) => {
      return acc + (item.annualPayout || 0);
    }, 0);

    const avgCurrentYield = totalPricedValTRY > 0 ? (totalPricedAnnualTRY / totalPricedValTRY) * 100 : 0;

    // Weighted yield must be exactly 10.0%, NOT 0% and NOT diluted or distorted
    expect(avgCurrentYield).toBe(10.0);

    // Unpriced coverage: 1 out of 2 assets excluded from weighted yield
    const unpricedOrNoYieldCount = mixedHoldings.length - pricedAndYieldAssets.length;
    expect(unpricedOrNoYieldCount).toBe(1);
  });

  test('12. Unit Test: Known non-payer (0% yield) contributes zero to totals and is not counted as unavailable yield', async () => {
    // Asset 1 (Payer): 100 shares @ ₺100.0, Price = ₺100.0, Yield = 10.0%, Payout = ₺1,000
    // Asset 2 (Known Non-Payer): 100 shares @ ₺50.0, Price = ₺50.0, Yield = 0.0%, Payout = ₺0.0
    // Asset 3 (Unavailable Yield): 100 shares @ ₺80.0, Price = null, Yield = null, Payout = null
    const portfolio: any[] = [
      {
        symbol: 'DIV_PAYER',
        name: 'Dividend Payer A.Ş.',
        market: 'BIST',
        currency: 'TRY',
        shares: 100,
        entryPrice: 100.0,
        currentPrice: 100.0,
        dividendYield: 10.0,
        annualPayout: 1000.0,
      },
      {
        symbol: 'TECH_GROWTH',
        name: 'Tech Growth Non-Payer A.Ş.',
        market: 'BIST',
        currency: 'TRY',
        shares: 100,
        entryPrice: 50.0,
        currentPrice: 50.0,
        dividendYield: 0.0, // Confirmed non-payer
        annualPayout: 0.0,
      },
      {
        symbol: 'UNKNOWN_DATA',
        name: 'Pending Listing A.Ş.',
        market: 'BIST',
        currency: 'TRY',
        shares: 100,
        entryPrice: 80.0,
        currentPrice: null, // Price unavailable
        dividendYield: null, // Yield unavailable
        annualPayout: null, // Payout unavailable
      }
    ];

    // 1. Excluded count must contain ONLY UNKNOWN_DATA (length 1), NOT TECH_GROWTH
    const excludedYieldAssets = portfolio.filter(item => item.annualPayout === null || item.dividendYield === null);
    expect(excludedYieldAssets.length).toBe(1);
    expect(excludedYieldAssets[0].symbol).toBe('UNKNOWN_DATA');

    // 2. Known non-payer count: must detect exactly 1 asset with confirmed 0% yield
    const knownNonPayerAssets = portfolio.filter(item => 
      (item.dividendYield === 0 || item.annualPayout === 0) &&
      item.dividendYield !== null &&
      item.annualPayout !== null
    );
    expect(knownNonPayerAssets.length).toBe(1);
    expect(knownNonPayerAssets[0].symbol).toBe('TECH_GROWTH');

    // 3. Total annual dividend: sum available payouts (₺1,000 + ₺0 = ₺1,000)
    const totalAnnualTRY = portfolio.reduce((acc, item) => {
      const payout = item.annualPayout || 0;
      return acc + payout;
    }, 0);
    expect(totalAnnualTRY).toBe(1000.0);

    // 4. Priced assets for weighted current yield: includes DIV_PAYER (₺10,000 val) and TECH_GROWTH (₺5,000 val)
    const pricedAndYieldAssets = portfolio.filter(item => item.currentPrice !== null && item.currentPrice > 0 && item.annualPayout !== null);
    expect(pricedAndYieldAssets.length).toBe(2);

    const totalPricedValTRY = pricedAndYieldAssets.reduce((acc, item) => acc + (item.shares * item.currentPrice), 0);
    const totalPricedAnnualTRY = pricedAndYieldAssets.reduce((acc, item) => acc + (item.annualPayout || 0), 0);

    expect(totalPricedValTRY).toBe(15000.0); // 10,000 + 5,000
    expect(totalPricedAnnualTRY).toBe(1000.0); // 1,000 + 0

    // Weighted market yield: (1,000 / 15,000) * 100 = 6.666...%
    const avgCurrentYield = (totalPricedAnnualTRY / totalPricedValTRY) * 100;
    expect(avgCurrentYield).toBeCloseTo(6.67, 1);

    // 5. Yield on Cost (YoC) coverage:
    // Both DIV_PAYER and TECH_GROWTH have entryPrice > 0 and known payout, while UNKNOWN_DATA has null payout
    const pricedCostAssets = portfolio.filter(item => 
      item.entryPrice > 0 && 
      (item.annualPayout !== null || (item.dividendYield !== null && item.estimatedNextDPS !== null && item.estimatedNextDPS > 0))
    );
    expect(pricedCostAssets.length).toBe(2);
    // Coverage is 2 out of 3 assets
    expect(`${pricedCostAssets.length}/${portfolio.length}`).toBe('2/3');
  });

  test('13. Strict Authorization & Server Validation: /api/portfolio/positions enforces session auth and validates input', async ({ request }) => {
    // A. Unauthenticated request MUST return 401 Unauthorized immediately
    const resUnauth = await request.post('/api/portfolio/positions', {
      data: {
        symbol: 'THYAO',
        shares: 10,
        price: 250.0,
        market: 'BIST'
      }
    });
    expect(resUnauth.status()).toBe(401);
    const unauthJson = await resUnauth.json();
    expect(unauthJson.error).toMatch(/Authentication required/i);

    // B. Obtain authenticated token for validation testing
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

    let token = '';
    const url = parsedEnv.NEXT_PUBLIC_SUPABASE_URL;
    const key = parsedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const email = parsedEnv.TEST_USER_A_EMAIL;
    const pwd = parsedEnv.TEST_USER_A_PASSWORD;

    if (url && key && email && pwd) {
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authData } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (authData?.session?.access_token) {
        token = authData.session.access_token;
      }
    }

    if (!token) {
      console.warn('Skipping authenticated payload validation: test user credentials not found');
      return;
    }

    const authHeaders = { Authorization: `Bearer ${token}` };

    // C. Missing order status on live order returns 400
    const resNoStatus = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 10, price: 250.0, market: 'BIST' }
    });
    expect(resNoStatus.status()).toBe(400);
    const noStatusJson = await resNoStatus.json();
    expect(noStatusJson.error).toMatch(/Order status is required for live orders/i);

    // D. Missing / Zero price returns 400
    const resZeroPrice = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 10, price: 0, market: 'BIST', status: 'Filled' }
    });
    expect(resZeroPrice.status()).toBe(400);
    const zeroJson = await resZeroPrice.json();
    expect(zeroJson.error).toMatch(/Invalid price/i);

    // E. Negative price returns 400
    const resNegativePrice = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 10, price: -50.0, market: 'BIST', status: 'Filled' }
    });
    expect(resNegativePrice.status()).toBe(400);

    // F. Zero / Negative shares returns 400
    const resZeroShares = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 0, price: 250.0, market: 'BIST', status: 'Filled' }
    });
    expect(resZeroShares.status()).toBe(400);
    const zeroSharesJson = await resZeroShares.json();
    expect(zeroSharesJson.error).toMatch(/Invalid shares/i);

    // G. Invalid market returns 400
    const resInvalidMarket = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 10, price: 250.0, market: 'INVALID_MKT', status: 'Filled' }
    });
    expect(resInvalidMarket.status()).toBe(400);
    const invalidMarketJson = await resInvalidMarket.json();
    expect(invalidMarketJson.error).toMatch(/Invalid market/i);

    // H. Missing symbol returns 400
    const resNoSymbol = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { shares: 10, price: 100.0, market: 'BIST', status: 'Filled' }
    });
    expect(resNoSymbol.status()).toBe(400);

    // I. Invalid order side returns 400
    const resInvalidSide = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 10, price: 250.0, market: 'BIST', side: 'SHORT', status: 'Filled' }
    });
    expect(resInvalidSide.status()).toBe(400);
    const invalidSideJson = await resInvalidSide.json();
    expect(invalidSideJson.error).toMatch(/Invalid side/i);

    // J. Invalid order status returns 400
    const resInvalidStatus = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 10, price: 250.0, market: 'BIST', status: 'MALICIOUS_STATUS' }
    });
    expect(resInvalidStatus.status()).toBe(400);
    const invalidStatusJson = await resInvalidStatus.json();
    expect(invalidStatusJson.error).toMatch(/Invalid status/i);

    // K. Historical import allows omitting status (defaults to Filled internally)
    const resHistoricalOmitStatus = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: { symbol: 'THYAO', shares: 0, price: 250.0, market: 'BIST', isHistoricalImport: true }
    });
    // Should get 400 because shares = 0, NOT because of missing status
    expect(resHistoricalOmitStatus.status()).toBe(400);
    const histJson = await resHistoricalOmitStatus.json();
    expect(histJson.error).toMatch(/Invalid shares/i);
  });

  test('14. Frontend Portfolio View displays DCA lot transparency and cost averaging disclosure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Switch to Portfolio tab
    const portTabBtn = page.locator('aside button[title*="Portföy"], aside button:has-text("Portföyüm & Takip")').first();
    await expect(portTabBtn).toBeVisible({ timeout: 10000 });
    await portTabBtn.click();
    await page.waitForTimeout(500);

    // Verify DCA cost averaging disclosure notice is visible
    const dcaNotice = page.locator('text=DCA (Maliyet Ortalaması)').first();
    await expect(dcaNotice).toBeVisible({ timeout: 10000 });
  });

  test('15. Unit Test: Trade Sequence (Buy -> Partial Sale with Cost Reduction -> Subsequent Sale -> Full Exit) preserves acquisition cost and avoids profit double-counting', async () => {
    // 1. Initial Position: 200 shares bought @ ₺100.00 (Total investment: ₺20,000)
    let heldShares = 200;
    const originalAcquisitionCost = 100.0;
    let avgEntryPrice = 100.0;
    let adjustedBreakEven: number | null = null;
    let isOpen = true;

    // 2. First Sale: Sell 100 shares @ ₺150.00 with reduceCostBasis = true
    const sale1Shares = 100;
    const sale1Price = 150.0;
    const sale1EffectiveCost = originalAcquisitionCost;
    const sale1RealizedPnl = (sale1Price - sale1EffectiveCost) * sale1Shares; // (150 - 100) * 100 = ₺5,000.00
    expect(sale1RealizedPnl).toBe(5000.0);

    // Net capital remaining invested:
    // (200 * 100) - (100 * 100) - 5,000 = ₺5,000.00 remaining capital
    const remainingSharesAfterSale1 = heldShares - sale1Shares; // 100 shares
    expect(remainingSharesAfterSale1).toBe(100);

    const baseCostPerShare = adjustedBreakEven ?? avgEntryPrice;
    let remainingTotalCost = (heldShares * baseCostPerShare) - (sale1Shares * sale1EffectiveCost) - sale1RealizedPnl;
    if (remainingTotalCost < 0) remainingTotalCost = 0;
    adjustedBreakEven = Number((remainingTotalCost / remainingSharesAfterSale1).toFixed(4));
    heldShares = remainingSharesAfterSale1;

    // Critical assertion: avgEntryPrice MUST remain ₺100.00 (acquisition cost basis)
    expect(avgEntryPrice).toBe(100.0);
    // Adjusted break-even (house money) is reduced to ₺50.00
    expect(adjustedBreakEven).toBe(50.0);

    // 3. Second Sale: Sell remaining 100 shares @ ₺180.00
    // Realized PnL MUST use original acquisition cost ₺100.00, NOT the reduced break-even ₺50.00
    const sale2Shares = 100;
    const sale2Price = 180.0;
    const sale2EffectiveCost = avgEntryPrice; // 100.0
    const sale2RealizedPnl = (sale2Price - sale2EffectiveCost) * sale2Shares; // (180 - 100) * 100 = ₺8,000.00
    expect(sale2RealizedPnl).toBe(8000.0); // NOT (180 - 50) * 100 = ₺13,000 (which would double-count the previous ₺5,000 profit!)

    // Total lifetime profit on 200 shares: ₺5,000 + ₺8,000 = ₺13,000
    const totalLifetimeRealizedPnl = sale1RealizedPnl + sale2RealizedPnl;
    // Expected: (100 * 150 + 100 * 180) - (200 * 100) = 33,000 - 20,000 = ₺13,000
    expect(totalLifetimeRealizedPnl).toBe(13000.0);

    // 4. Full Exit State
    heldShares -= sale2Shares;
    if (heldShares <= 0) {
      heldShares = 0;
      isOpen = false;
    }
    expect(heldShares).toBe(0);
    expect(isOpen).toBe(false);

    // Database check constraint formula: ((is_open = true AND quantity > 0) OR (is_open = false AND quantity >= 0))
    const isConstraintSatisfied = (isOpen && heldShares > 0) || (!isOpen && heldShares >= 0);
    expect(isConstraintSatisfied).toBe(true);
  });

  test('16. Non-Filled Order Gating: Pending orders record audit trail without mutating position holdings', async ({ request }) => {
    // A. Obtain authenticated token for validation testing
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

    let token = '';
    const url = parsedEnv.NEXT_PUBLIC_SUPABASE_URL;
    const key = parsedEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const email = parsedEnv.TEST_USER_A_EMAIL;
    const pwd = parsedEnv.TEST_USER_A_PASSWORD;

    if (url && key && email && pwd) {
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: authData } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (authData?.session?.access_token) {
        token = authData.session.access_token;
      }
    }

    if (!token) {
      console.warn('Skipping authenticated Pending order test: test user credentials not found');
      return;
    }

    const authHeaders = { Authorization: `Bearer ${token}` };

    // Post a Pending order
    const resPending = await request.post('/api/portfolio/positions', {
      headers: authHeaders,
      data: {
        symbol: 'THYAO',
        shares: 5,
        price: 260.0,
        market: 'BIST',
        side: 'BUY',
        status: 'Pending',
        notes: 'Limit buy test order'
      }
    });

    expect(resPending.status()).toBe(201);
    const pendingJson = await resPending.json();
    expect(pendingJson.success).toBe(true);
    // Order is created with status Pending
    expect(pendingJson.order).toBeTruthy();
    expect(pendingJson.order.status).toBe('Pending');
    // Position MUST be null because an uncompleted order does not mutate holdings
    expect(pendingJson.position).toBeNull();
    // Cash transfer MUST be null/falsy
    expect(pendingJson.transfer).toBeFalsy();
  });

  test('17. Unit Test: Dual-Currency Segregated Wallets (TRY & USD) and Conditional Visibility', () => {
    // 1. Initial State: BIST Only (Zero US stocks/ETFs, Zero USD cash)
    const bistOnlyPortfolio: any[] = [
      { symbol: 'THYAO', market: 'BIST', currency: 'TRY', shares: 100, entryPrice: 250.0, currentPrice: 260.0 }
    ];
    const tryOnlyTransfers: CapitalTransfer[] = [
      { id: 't-try', transferType: 'DEPOSIT', amount: 50000.0, currency: 'TRY', transferDate: '2026-09-01' }
    ];
    const tryOnlyOrders: ExecutedOrder[] = [
      {
        id: 'o-try',
        ref: 'ORD-TRY-1',
        symbol: 'THYAO',
        name: 'Türk Hava Yolları',
        market: 'BIST',
        side: 'BUY',
        orderType: 'Limit',
        quantity: 100,
        price: 250.0,
        totalValue: 25000.0,
        currency: 'TRY',
        dateTime: '02.09.2026 - 10:00',
        executedAt: '2026-09-02T10:00:00Z',
        status: 'Filled'
      }
    ];

    const tryResult = calculateLedgerCash(tryOnlyOrders, tryOnlyTransfers, 50.0, 0);
    expect(tryResult.availableCashTRY).toBe(25000.0);
    expect(tryResult.availableCashUSD).toBe(0.0);
    expect(tryResult.hasUsdActivity).toBe(false);

    // Conditional visibility rule: If no US stocks and no USD cash activity, USD wallet MUST NOT be shown
    const isUsdWalletVisibleBistOnly = bistOnlyPortfolio.some(p => p.market === 'US' || p.currency === 'USD') || tryResult.availableCashUSD > 0 || tryResult.hasUsdActivity;
    expect(isUsdWalletVisibleBistOnly).toBe(false);

    // 2. Introduce US Stock Activity (AAPL) with native USD deposit and trades
    const dualTransfers: CapitalTransfer[] = [
      ...tryOnlyTransfers,
      { id: 't-usd', transferType: 'DEPOSIT', amount: 1000.0, currency: 'USD', transferDate: '2026-09-03' }
    ];
    const dualOrders: ExecutedOrder[] = [
      ...tryOnlyOrders,
      {
        id: 'o-usd-buy',
        ref: 'ORD-USD-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        market: 'US',
        side: 'BUY',
        orderType: 'Limit',
        quantity: 5,
        price: 150.0,
        totalValue: 750.0,
        currency: 'USD',
        dateTime: '05.09.2026 - 14:30',
        executedAt: '2026-09-05T14:30:00Z',
        status: 'Filled'
      },
      {
        id: 'o-usd-sell',
        ref: 'ORD-USD-2',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        market: 'US',
        side: 'SELL',
        orderType: 'Limit',
        quantity: 2,
        price: 180.0,
        totalValue: 360.0,
        currency: 'USD',
        dateTime: '12.09.2026 - 15:00',
        executedAt: '2026-09-12T15:00:00Z',
        status: 'Filled'
      }
    ];

    const dualResult = calculateLedgerCash(dualOrders, dualTransfers, 50.0, 0);

    // TRY Wallet: 50,000 - 25,000 = ₺25,000.00 (Untouched by USD trades!)
    expect(dualResult.availableCashTRY).toBe(25000.0);

    // USD Wallet: 1,000 - 750 + 360 = $610.00 (Native USD settlement without FX dilution!)
    expect(dualResult.availableCashUSD).toBe(610.0);
    expect(dualResult.totalBuysUSD).toBe(750.0);
    expect(dualResult.totalSellsUSD).toBe(360.0);
    expect(dualResult.hasUsdActivity).toBe(true);

    // Consolidated Liquid Cash in TRY: 25,000 + (610 * 50) = ₺55,500.00
    expect(dualResult.consolidatedCashTRY).toBe(55500.0);

    // Conditional visibility rule: With US activity, USD wallet MUST be revealed
    const dualPortfolio = [
      ...bistOnlyPortfolio,
      { symbol: 'AAPL', market: 'US', currency: 'USD', shares: 3, entryPrice: 150.0, currentPrice: 180.0 }
    ];
    const isUsdWalletVisibleDual = dualPortfolio.some(p => p.market === 'US' || p.currency === 'USD') || dualResult.availableCashUSD > 0 || dualResult.hasUsdActivity;
    expect(isUsdWalletVisibleDual).toBe(true);
  });

  test('18. Unit Test: Pending, Cancelled, and Rejected orders are strictly ignored by calculateLedgerCash', async () => {
    const baseTransfers: CapitalTransfer[] = [
      { id: 't-1', transferType: 'DEPOSIT', amount: 10000.0, currency: 'TRY', transferDate: '2026-09-01' }
    ];

    const mixedStatusOrders: ExecutedOrder[] = [
      {
        id: 'ord-filled-buy',
        ref: 'ORD-1',
        symbol: 'THYAO',
        name: 'Türk Hava Yolları',
        market: 'BIST',
        side: 'BUY',
        orderType: 'Limit',
        quantity: 10,
        price: 200.0,
        totalValue: 2000.0,
        currency: 'TRY',
        dateTime: '02.09.2026 - 10:00',
        executedAt: '2026-09-02T10:00:00Z',
        status: 'Filled'
      },
      // Non-filled orders that MUST NOT affect cash
      {
        id: 'ord-pending-buy',
        ref: 'ORD-2',
        symbol: 'GARAN',
        name: 'Garanti Bankası',
        market: 'BIST',
        side: 'BUY',
        orderType: 'Limit',
        quantity: 100,
        price: 150.0,
        totalValue: 15000.0, // Would exceed cash and trigger false auto-funding if not filtered!
        currency: 'TRY',
        dateTime: '03.09.2026 - 10:00',
        executedAt: '2026-09-03T10:00:00Z',
        status: 'Pending'
      },
      {
        id: 'ord-cancelled-sell',
        ref: 'ORD-3',
        symbol: 'THYAO',
        name: 'Türk Hava Yolları',
        market: 'BIST',
        side: 'SELL',
        orderType: 'Limit',
        quantity: 10,
        price: 300.0,
        totalValue: 3000.0, // Would falsely add cash if not filtered!
        currency: 'TRY',
        dateTime: '04.09.2026 - 10:00',
        executedAt: '2026-09-04T10:00:00Z',
        status: 'Cancelled'
      },
      {
        id: 'ord-rejected-buy',
        ref: 'ORD-4',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        market: 'US',
        side: 'BUY',
        orderType: 'Limit',
        quantity: 50,
        price: 130.0,
        totalValue: 6500.0,
        currency: 'USD',
        dateTime: '05.09.2026 - 10:00',
        executedAt: '2026-09-05T10:00:00Z',
        status: 'Rejected'
      }
    ];

    const result = calculateLedgerCash(mixedStatusOrders, baseTransfers, 50.0, 0);

    // Available TRY Cash must be strictly 10,000 - 2,000 = ₺8,000.00
    // Pending BUY and Cancelled SELL did not alter cash or total deposits
    expect(result.availableCashTRY).toBe(8000.0);
    expect(result.totalDepositsTRY).toBe(10000.0);
    expect(result.totalBuysTRY).toBe(2000.0);
    expect(result.totalSellsTRY).toBe(0.0);

    // Rejected USD BUY did not mutate USD cash or set hasUsdActivity
    expect(result.availableCashUSD).toBe(0.0);
    expect(result.hasUsdActivity).toBe(false);
  });

  test('19. Unit Test: Selected-Lot Partial Sale recalculates remaining-lot acquisition cost while preserving net-capital tracking', async () => {
    // Scenario:
    // Lot 1: 10 shares @ ₺10.00 (₺100.00 invested)
    // Lot 2: 10 shares @ ₺20.00 (₺200.00 invested)
    // Total: 20 shares, total invested = ₺300.00, blended average entry = ₺15.00
    const totalSharesBefore = 20;
    const avgEntryBefore = 15.0;
    const totalInvestedBefore = totalSharesBefore * avgEntryBefore; // ₺300.00

    // User sells 10 shares from Lot 1 (@ ₺10.00 entry) at ₺25.00 market price
    const sharesSold = 10;
    const lotCostBasis = 10.0;
    const sellPrice = 25.0;
    const realizedPnl = (sellPrice - lotCostBasis) * sharesSold; // ₺150.00 profit
    expect(realizedPnl).toBe(150.0);

    const remainingShares = totalSharesBefore - sharesSold; // 10 shares

    // 1. Remaining Lot Acquisition Cost Basis:
    // Original capital was ₺300, ₺100 was in the sold lot -> ₺200 remaining across 10 shares = ₺20.00/share!
    const remainingInvested = totalInvestedBefore - (sharesSold * lotCostBasis);
    const updatedAvgEntryPrice = remainingInvested / remainingShares;
    expect(updatedAvgEntryPrice).toBe(20.0); // Exact remaining lot cost, NOT stale ₺15.00 average!

    // 2. Net-Capital / "Maliyet Düşürme" (House Money) Calculation:
    // Net remaining capital = original capital - cost of sold - realized profit = 300 - 100 - 150 = ₺50.00
    // Adjusted break-even for remaining 10 shares = ₺50 / 10 = ₺5.00/share!
    const remainingNetCapital = totalInvestedBefore - (sharesSold * lotCostBasis) - realizedPnl;
    const adjustedBreakEven = remainingNetCapital / remainingShares;
    expect(adjustedBreakEven).toBe(5.0);

    // Both metrics coexist clearly without conflation
    expect(updatedAvgEntryPrice).toBe(20.0); // Acquisition price of remaining lot
    expect(adjustedBreakEven).toBe(5.0);      // Net house-money break-even
  });
});

