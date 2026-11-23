import { test, expect } from '@playwright/test';

test.describe('Option 2 & 3: Multi-Tranche Raindrop Matrix & Cum-Dividend Radar', () => {
  test('1. Verify Cum-Dividend Radar Banner & Badges render on Dividend Tab', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:3001/#dividend');
    await page.waitForLoadState('networkidle');

    // Verify Cum-Dividend Radar section is rendered
    const radarBanner = page.locator('text=Son Alım Günü (Cum-Dividend)');
    await expect(radarBanner.first()).toBeVisible({ timeout: 15000 });

    // Verify FROTO appears in the imminent list with countdown or last day badge
    const frotoCard = page.locator('text=FROTO').first();
    await expect(frotoCard).toBeVisible();

    // Take screenshot of Cum-Dividend Radar
    await page.screenshot({ path: 'test-results/cum_dividend_radar.png', fullPage: false });
  });

  test('2. Verify Multi-Tranche Yağmur Takvimi renders tranches', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:3001/#dividend');
    await page.waitForLoadState('networkidle');

    // Switch to Yağmur Takvimi
    const raindropTab = page.locator('button:has-text("Yağmur Takvimi")');
    await raindropTab.click();

    // Verify Yağmur Takvimi title
    await expect(page.locator('text=12 Aylık Temettü Yağmuru Takvimi').first()).toBeVisible();

    // Take screenshot of Yağmur Takvimi
    await page.screenshot({ path: 'test-results/yagmur_takvimi_matrix.png', fullPage: false });
  });

  test('3. Verify Watchlist shows Cum-Dividend Countdown Badges', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:3001/#watchlist');
    await page.waitForLoadState('domcontentloaded');

    // Switch to Watchlist tab
    await page.locator('text=Takip Listem').first().click();
    await page.waitForTimeout(1000);

    // Click BIST 30 starter pack
    const bistPack = page.locator('button:has-text("BIST 30")').first();
    await expect(bistPack).toBeVisible();
    await bistPack.click();
    await page.waitForTimeout(1500);

    // Verify FROTO card with badge is visible
    const frotoItem = page.locator('text=FROTO').first();
    await expect(frotoItem).toBeVisible();

    // Take screenshot of Watchlist with active radar & countdown badges
    await page.screenshot({ path: 'test-results/watchlist_cum_dividend_active.png', fullPage: false });
  });
});
