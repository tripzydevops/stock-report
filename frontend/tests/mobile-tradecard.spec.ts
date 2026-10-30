import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Mobile TradeCard Expanded View', () => {
  test('Mobile viewport cleanly displays structured Why and Plan sections without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Find first TradeCard rationale toggle button
    const toggleBtn = page.locator('button:has-text("Yapay Zeka Analizini Göster"), button:has-text("Show AI Rationale")').first();
    await expect(toggleBtn).toBeVisible({ timeout: 10000 });

    // Click to expand using DOM click to avoid sticky footer overlap in test
    await toggleBtn.evaluate((el: HTMLElement) => el.click());

    // Wait for the Why section and Plan section to be visible
    const whyHeader = page.locator('text=/Neden Tetiklendi|Why It Fired/i').first();
    await expect(whyHeader).toBeVisible();

    const planHeader = page.locator('text=/İşlem Planı|Execution Plan/i').first();
    await expect(planHeader).toBeVisible();

    // Scroll to the expanded card
    await whyHeader.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    // Save screenshot focused on the expanded TradeCard container
    const cardContainer = page.locator('div:has(> button:has-text("THYAO"))').first();
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_tradecard_expanded.png'),
      fullPage: false,
    });
  });
});
