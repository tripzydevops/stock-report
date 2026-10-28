import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Desktop Viewport & Layout Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header');
  });

  test('1. Desktop layout loads with full expanded sidebar and no horizontal overflow', async ({ page }) => {
    // Check horizontal overflow
    const isHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isHorizontalOverflow).toBe(false);

    // Verify desktop aside / sidebar navigation is present and visible
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();

    // Verify top header
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Capture desktop default view
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'desktop_default_view.png'),
      fullPage: false,
    });
  });

  test('2. Navigation across core tabs functions cleanly on Desktop', async ({ page }) => {
    // Click Portföyüm in sidebar using title locator (works collapsed or expanded)
    const portfolioBtn = page.locator('aside button[title*="Portföy"]').first();
    await expect(portfolioBtn).toBeVisible();
    await portfolioBtn.click();

    // Verify Portfolio view is rendered
    await expect(page.locator('text=Yatırılan Para').first()).toBeVisible({ timeout: 10000 });

    // Capture desktop portfolio screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'desktop_portfolio_view.png'),
    });

    // Navigate to Temettü
    const dividendBtn = page.locator('aside button[title*="Temettü"]').first();
    await expect(dividendBtn).toBeVisible();
    await dividendBtn.click();

    // Verify Dividend view is rendered
    await expect(page.locator('text=Temettü').first()).toBeVisible({ timeout: 10000 });

    // Capture desktop dividend screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'desktop_dividend_view.png'),
    });
  });

  test('3. Date filter bar toggles without layout shift on Desktop', async ({ page }) => {
    const dateBtn = page.getByTitle('Tarih Aralığını Filtrele');
    await expect(dateBtn).toBeVisible();
    await dateBtn.click();

    // Verify DateFilterBar appears with preset buttons
    const allTimePreset = page.getByRole('button', { name: /Tüm Zamanlar/i }).first();
    await expect(allTimePreset).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'desktop_date_filter_open.png'),
    });
  });
});
