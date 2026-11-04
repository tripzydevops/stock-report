import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Mobile Experience Comprehensive Check', () => {
  test('Audit Mobile Layout for Dividend, Signals, Catalysts, Portfolio & ORB', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Visit Signals Tab
    await page.goto('/#signals');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const signalsDocWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('Mobile Signals docWidth:', signalsDocWidth);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_view_signals_verified.png') });
    expect(signalsDocWidth).toBeLessThanOrEqual(420);

    // 2. Visit Dividend Tab
    await page.goto('/#dividend');
    await page.waitForTimeout(1000);
    const dividendDocWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('Mobile Dividend docWidth:', dividendDocWidth);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_view_dividend_verified.png') });
    expect(dividendDocWidth).toBeLessThanOrEqual(420);

    // 3. Check Arbitrage Modal on Mobile
    const arbitrajBtn = page.locator('button:has-text("Arbitraj"), button:has-text("Arbitrage")').first();
    if (await arbitrajBtn.isVisible()) {
      await arbitrajBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_view_dividend_arbitrage_modal.png') });
      const closeBtn = page.locator('button:has-text("✕")').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // 4. Visit Catalysts Tab
    await page.goto('/#catalysts');
    await page.waitForTimeout(1000);
    const catalystsDocWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('Mobile Catalysts docWidth:', catalystsDocWidth);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_view_catalysts_verified.png') });
    expect(catalystsDocWidth).toBeLessThanOrEqual(420);

    // 5. Visit Portfolio Tab
    await page.goto('/#portfolio');
    await page.waitForTimeout(1000);
    const portfolioDocWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('Mobile Portfolio docWidth:', portfolioDocWidth);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_view_portfolio_verified.png') });
    expect(portfolioDocWidth).toBeLessThanOrEqual(420);

    // 6. Visit ORB Tab
    await page.goto('/#orb');
    await page.waitForTimeout(1000);
    const orbDocWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('Mobile ORB docWidth:', orbDocWidth);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_view_orb_verified.png') });
    expect(orbDocWidth).toBeLessThanOrEqual(420);
  });
});
