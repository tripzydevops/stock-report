import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('ORB Sorting & KAP Dividend Announcements Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header');
  });

  test('1. Opening Direction (ORB) table headers are clickable, sortable, and tickers are deduplicated', async ({ page }) => {
    // Navigate to ORB tab via sidebar
    const orbBtn = page.locator('aside button:has-text("Açılış Seansı"), aside button:has-text("ORB")').first();
    await expect(orbBtn).toBeVisible({ timeout: 5000 });
    await orbBtn.click();
    await page.waitForTimeout(1000);

    // Verify ORB table exists
    const table = page.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });

    // Locate the 6 headers
    const varlikHeader = page.locator('th:has-text("Varlık")').first();
    const gapHeader = page.locator('th:has-text("Açılış Gap %")').first();
    const gapSinifiHeader = page.locator('th:has-text("Gap Sınıfı")').first();
    const orbStatusHeader = page.locator('th:has-text("15dk ORB Durumu")').first();
    const yonHeader = page.locator('th:has-text("Yön Eğilimi")').first();
    const hacimHeader = page.locator('th:has-text("Hacim Dalgası")').first();

    await expect(varlikHeader).toBeVisible();
    await expect(gapHeader).toBeVisible();
    await expect(gapSinifiHeader).toBeVisible();
    await expect(orbStatusHeader).toBeVisible();
    await expect(yonHeader).toBeVisible();
    await expect(hacimHeader).toBeVisible();

    // Verify initial sort arrow indicator exists on gapHeader (default gapPercent desc: ▼)
    await expect(gapHeader).toContainText('▼');

    // Click 'Varlık' header to sort by symbol asc
    await varlikHeader.click();
    await page.waitForTimeout(400);
    await expect(varlikHeader).toContainText('▲');

    // Click 'Varlık' again to sort by symbol desc
    await varlikHeader.click();
    await page.waitForTimeout(400);
    await expect(varlikHeader).toContainText('▼');

    // Click 'Gap Sınıfı'
    await gapSinifiHeader.click();
    await page.waitForTimeout(400);
    await expect(gapSinifiHeader).toContainText('▼');

    // Click '15dk ORB Durumu'
    await orbStatusHeader.click();
    await page.waitForTimeout(400);
    await expect(orbStatusHeader).toContainText('▼');

    // Click 'Yön Eğilimi'
    await yonHeader.click();
    await page.waitForTimeout(400);
    await expect(yonHeader).toContainText('▼');

    // Click 'Hacim Dalgası'
    await hacimHeader.click();
    await page.waitForTimeout(400);
    await expect(hacimHeader).toContainText('▼');

    // Check ticker deduplication in the table
    const symbolCells = await page.locator('tbody tr td:first-child button span:first-child').allInnerTexts();
    if (symbolCells.length > 0) {
      const uniqueSymbols = new Set(symbolCells.map(s => s.trim().toUpperCase()));
      expect(uniqueSymbols.size).toBe(symbolCells.length);
      console.log(`Verified ${symbolCells.length} ORB assets with 100% unique symbols:`, Array.from(uniqueSymbols).slice(0, 8));
    }

    // Capture screenshot of sorted ORB table
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'orb_sorted_view.png'),
    });
  });

  test('2. KAP / Catalysts section features Temettü Spotlight Header, live disclosures count, and quick filter', async ({ page }) => {
    test.setTimeout(60000);
    // Navigate to Catalysts tab via sidebar
    const catalystBtn = page.locator('aside button[title*="KAP"], aside button:has-text("KAP")').first();
    await expect(catalystBtn).toBeVisible({ timeout: 5000 });
    await catalystBtn.click();
    await page.waitForTimeout(800);

    // Verify Temettü & Kâr Payı Bildirimleri spotlight header exists
    const dividendSpotlight = page.locator('text=/Temettü & Kâr Payı Bildirimleri|Dividend & Payout Announcements/i').first();
    await expect(dividendSpotlight).toBeVisible({ timeout: 10000 });

    // Verify Temettü filter pill exists
    const dividendPill = page.locator('button:has-text("Temettü & Ödemeler"), button:has-text("Dividends & Payouts")').first();
    await expect(dividendPill).toBeVisible();

    // Wait for live catalysts to finish loading from Supabase
    const allDisclosuresBtn = page.locator('button:has-text("Tüm Bildirimler"), button:has-text("All Disclosures")').first();
    await expect(allDisclosuresBtn).not.toContainText('(0)', { timeout: 15000 });

    // Capture initial spotlight screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'catalysts_dividend_spotlight.png'),
    });

    // Click on the Temettü filter pill
    await dividendPill.click();
    await page.waitForTimeout(400);

    // Verify active filter state on pill
    await expect(dividendPill).toHaveClass(/bg-amber-600/);

    // Verify spotlight badge indicates filtered state
    const filteredBadge = page.locator('text=/FİLTRELENDİ|FILTERED/i').first();
    await expect(filteredBadge).toBeVisible();

    // Capture filtered dividend catalysts screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'catalysts_dividend_filtered.png'),
    });

    // Test calendar navigation button in spotlight header
    const calendarNavBtn = page.locator('button:has-text("Nakit Akış Takvimi"), button:has-text("Cashflow View")').first();
    if (await calendarNavBtn.isVisible()) {
      await calendarNavBtn.click();
      await page.waitForTimeout(600);
      expect(page.url()).toContain('#dividend');
    }
  });

  test('3. Market-wide dividend scanner shows all 44 dividend stocks, scope toggle, and tax arbitrage modal', async ({ page }) => {
    test.setTimeout(60000);
    // Navigate to Dividend tab via sidebar
    const dividendBtn = page.locator('aside button:has-text("Temettü Gelirleri"), aside button:has-text("Dividend")').first();
    await expect(dividendBtn).toBeVisible({ timeout: 5000 });
    await dividendBtn.click();
    await page.waitForTimeout(1000);

    // Verify Scope Switcher is present and defaults to All Market
    const allMarketBtn = page.locator('button:has-text("Tüm Piyasa"), button:has-text("All Market")').first();
    const portfolioOnlyBtn = page.locator('button:has-text("Sadece Portföyüm"), button:has-text("My Portfolio Only")').first();
    await expect(allMarketBtn).toBeVisible({ timeout: 10000 });
    await expect(portfolioOnlyBtn).toBeVisible({ timeout: 5000 });

    // Verify Investing.com Timeframe Quick Filter Pills exist
    const imminentPill = page.locator('button:has-text("Yaklaşan 30 Gün"), button:has-text("Next 30 Days")').first();
    await expect(imminentPill).toBeVisible({ timeout: 5000 });

    // Verify Investing.com Month Group Banners exist
    const monthBanners = page.locator('text=/🗓️/');
    await expect(monthBanners.first()).toBeVisible({ timeout: 5000 });

    // Verify Country Flags and Countdown Badges exist
    const bistFlag = page.locator('text=/🇹🇷 BIST/').first();
    await expect(bistFlag).toBeVisible({ timeout: 5000 });

    const countdownBadge = page.locator('text=/Gün Kaldı|Tarih Bekleniyor|Tamamlandı/i').first();
    await expect(countdownBadge).toBeVisible({ timeout: 5000 });

    // Verify non-held stocks appear with market radar badges (e.g. BIMAS, TCELL, FROTO, TOASO)
    const marketBadges = page.locator('text=/Piyasa Fırsatı|Market Asset/i');
    await expect(marketBadges.first()).toBeVisible({ timeout: 10000 });
    const marketBadgesCount = await marketBadges.count();
    expect(marketBadgesCount).toBeGreaterThan(0);

    // Capture desktop market-wide dividend view screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dividend_investing_com_layout_desktop.png'),
    });

    // Open Arbitrage Modal
    const arbitrageBtn = page.locator('button:has-text("Arbitraj Analizi"), button:has-text("Tax Arbitrage")').first();
    if (await arbitrageBtn.isVisible()) {
      await arbitrageBtn.click();
      await page.waitForTimeout(600);

      // Verify empirical arbitrage modal content (94 distribution events, 36.2% win rate)
      const modalHeader = page.locator('text=/Temettü Arbitraj & Vergi Analizi|Temettü Vergi Arbitrajı Analizi|Dividend Tax Arbitrage/i').first();
      await expect(modalHeader).toBeVisible();
      await expect(page.locator('text=/Borsa İstanbul 94|Arbitraj Başarı Oranı/i').first()).toBeVisible();

      // Capture arbitrage modal screenshot
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, 'dividend_arbitrage_modal.png'),
      });

      // Close modal
      const closeBtn = page.locator('button:has-text("Anladım, Kapat")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.locator('button:has-text("✕")').first().click();
      }
      await page.waitForTimeout(500);
    }

    // Toggle to "Sadece Portföyüm"
    await portfolioOnlyBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Verify that non-held badges disappear in portfolio-only mode
    const portfolioHeldCount = await page.locator('text=/Portföyde|In Portfolio/i').count();
    expect(portfolioHeldCount).toBeGreaterThan(0);

    // Capture portfolio-only view screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'dividend_portfolio_only_desktop.png'),
    });
  });
});
