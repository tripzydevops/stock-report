import { test, expect } from '@playwright/test';

test.describe('KAP Dividend Catalysts & Automation Flow', () => {
  test('1. Verify FROTO KAP Dividend Announcement in Catalyst Feed', async ({ page }) => {
    await page.goto('http://localhost:3001/#catalysts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Look for FROTO or Temettüleri Filtrele button
    const filterBtn = page.locator('button:has-text("Temettüleri Filtrele")').or(page.locator('button:has-text("Filter Dividends")')).first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(1500);
    }

    // Verify FROTO catalyst card is visible
    const frotoText = page.locator('text=FROTO').first();
    await expect(frotoText).toBeVisible({ timeout: 10000 });

    // Capture screenshot
    await page.screenshot({
      path: 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9/kap_dividend_catalyst_feed.png',
      fullPage: false
    });
  });
});
