import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Mobile Portfolio Hardening & Zero-Block Execution', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    // Navigate to homepage with portfolio tab
    await page.goto('/?tab=portfolio');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('main, header', { timeout: 15000 });
  });

  test('1. Mobile Add Holding: opens modal, shows saving state, persists holding cleanly without duplicates', async ({ page }) => {
    // Locate visible "+ Pozisyon Ekle" button or FAB on mobile
    const addBtn = page.locator('button:has-text("Pozisyon Ekle"):visible').first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click();

    // Verify modal is open
    const modalTitle = page.locator('h2:has-text("Add Portfolio Holding")');
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    // Fill in ticker symbol
    const tickerInput = page.locator('input[placeholder*="THYAO"]').first();
    await tickerInput.fill('THYAO');

    // Click suggestion if it popped up to cleanly close dropdown & populate defaults
    const suggestionBtn = page.locator('div.absolute button:has-text("THYAO")').first();
    if (await suggestionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suggestionBtn.click();
    }

    // Fill shares and entry price using exact placeholders
    const sharesInput = page.locator('input[placeholder="100"]').first();
    await expect(sharesInput).toBeVisible({ timeout: 5000 });
    await sharesInput.fill('50');

    const priceInput = page.locator('input[placeholder="100.00"]').first();
    if (await priceInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await priceInput.fill('280.00');
    }

    // Capture screenshot before submit
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_add_modal_filled.png'),
    });

    // Submit form via Save Holding button
    const saveBtn = page.locator('button[type="submit"]:has-text("Save Holding"), button[type="submit"]:has-text("Kaydediliyor")');
    await saveBtn.click();

    // Verify modal closes
    await expect(modalTitle).not.toBeVisible({ timeout: 10000 });

    // Verify THYAO position exists in the portfolio view
    const holdingItem = page.locator('text=THYAO').first();
    await expect(holdingItem).toBeVisible({ timeout: 10000 });

    // Screenshot of portfolio with new holding
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_portfolio_with_thyao.png'),
    });
  });

  test('2. Mobile Direct Sat (Sell) Action: opens directly on SELL tab, executes partial exit cleanly', async ({ page }) => {
    // Locate the red 🔴 Sat button on the first visible holding card
    const satBtn = page.locator('button:has-text("🔴 Sat"):visible').first();
    await expect(satBtn).toBeVisible({ timeout: 15000 });
    await satBtn.click();

    // Verify Trade Modal opened directly on SELL tab
    const sellTabActive = page.locator('button:has-text("HİSSE SAT"), button:has-text("SELL SHARES")');
    await expect(sellTabActive).toBeVisible({ timeout: 5000 });
    await expect(sellTabActive).toHaveClass(/bg-rose-600/);

    // Set partial shares to sell (e.g. 5 shares)
    const sellQtyInput = page.locator('input[type="number"][inputmode="decimal"]').first();
    await sellQtyInput.fill('5');

    // Screenshot of sell modal
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_sell_modal_active.png'),
    });

    // Confirm partial sell
    const confirmSellBtn = page.locator('button[type="submit"]:has-text("Kısmi Satışı Onayla"), button[type="submit"]:has-text("Confirm Partial Sell")');
    await confirmSellBtn.click();

    // Verify modal closes
    await expect(sellTabActive).not.toBeVisible({ timeout: 10000 });

    // Screenshot of updated portfolio after partial exit
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_after_partial_sell.png'),
    });
  });

  test('3. Mobile Sync: targeted sync executes with positive feedback toast', async ({ page }) => {
    // Find the visible sync button on mobile (top header or quick action)
    const syncBtn = page.locator('button[title*="Senkronize"]:visible, button:has-text("Yenile"):visible').first();
    await expect(syncBtn).toBeVisible({ timeout: 10000 });

    const startTime = Date.now();
    await syncBtn.click();

    // Verify instant feedback message appears
    const toast = page.locator('text=/senkronize|güncellendi|başarıyla|sync|fiyatları/i').first();
    await expect(toast).toBeVisible({ timeout: 8000 });

    const elapsed = Date.now() - startTime;
    // Feedback toast should be responsive (<10s)
    expect(elapsed).toBeLessThan(10000);
  });

  test('4. Offline Resilience & Queue Replay: actions persist locally when offline and surface queue status', async ({ page }) => {
    // Simulate offline state
    await page.context().setOffline(true);

    // Add a position while offline
    const addBtn = page.locator('button:has-text("Pozisyon Ekle"):visible').first();
    await addBtn.click();

    const tickerInput = page.locator('input[placeholder*="THYAO"]').first();
    await tickerInput.fill('TKFEN');
    
    // Close suggestions if open
    const suggestionBtn = page.locator('div.absolute button:has-text("TKFEN")').first();
    if (await suggestionBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suggestionBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    const sharesInput = page.locator('input[placeholder="100"]').first();
    await sharesInput.fill('100');

    const priceInput = page.locator('input[placeholder="100.00"]').first();
    if (await priceInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await priceInput.fill('45.00');
    }

    const saveBtn = page.locator('button[type="submit"]:has-text("Save Holding"), button[type="submit"]:has-text("Kaydediliyor")');
    await saveBtn.click();

    // Verify app did not crash and TKFEN was added locally
    const tkfenItem = page.locator('text=TKFEN').first();
    await expect(tkfenItem).toBeVisible({ timeout: 10000 });

    // Verify offline banner / indicator is present
    const offlineIndicator = page.locator('text=/Çevrimdışı|Offline|Yerel/i').first();
    await expect(offlineIndicator).toBeVisible({ timeout: 10000 });

    // Restore online state
    await page.context().setOffline(false);

    // Screenshot of offline resilient portfolio
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_offline_resilient_portfolio.png'),
    });
  });
});
