import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('KAP Dividend Catalysts & Automation Flow', () => {
  test('1. Verify FROTO KAP Dividend Announcement in Catalyst Feed', async ({ page }, testInfo) => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    await page.goto(`${baseUrl}/#catalysts`, { waitUntil: 'domcontentloaded' });
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

    // Capture screenshot portably (respecting ARTIFACT_DIR or Playwright output path)
    const customArtifactDir = process.env.ARTIFACT_DIR;
    const screenshotPath = (customArtifactDir && fs.existsSync(customArtifactDir))
      ? path.join(customArtifactDir, 'kap_dividend_catalyst_feed.png')
      : testInfo.outputPath('kap_dividend_catalyst_feed.png');

    await page.screenshot({
      path: screenshotPath,
      fullPage: false
    });
  });
});
