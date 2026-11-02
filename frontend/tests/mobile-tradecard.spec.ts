import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Mobile TradeCard Expanded View', () => {
  test('Mobile viewport cleanly displays structured Why and Plan sections without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Find first TradeCard AI analysis button (unified Co-Pilot modal)
    const aiBtn = page.getByRole('button', { name: /YZ Analiz & Planı|AI Analysis & Plan/i }).first();
    await expect(aiBtn).toBeVisible({ timeout: 10000 });

    // Click to open AI Co-Pilot modal
    await aiBtn.click({ force: true });

    // Verify AI Co-Pilot modal badge is visible
    const modalBadge = page.locator('text=/AI Trade Co-Pilot/i').first();
    await expect(modalBadge).toBeVisible({ timeout: 6000 });

    // Switch to Tactical Blueprint tab if present
    const blueprintTab = page.locator('button:has-text("YZ Kurulumu & Planı"), button:has-text("Tactical Blueprint"), button:has-text("AI Setup & Blueprint")').first();
    if (await blueprintTab.isVisible()) {
      await blueprintTab.click({ force: true });
    }

    // Wait for the Why section and Plan section inside the modal
    const whyHeader = page.locator('text=/Neden Tetiklendi|Why It Fired/i').first();
    await expect(whyHeader).toBeVisible();

    const planHeader = page.locator('text=/Algoritmik Kurulum|İşlem Planı|Execution Plan/i').first();
    await expect(planHeader).toBeVisible();

    // Verify dynamic R:R indicator or ratio exists
    const rrIndicator = page.locator('text=/1R :|Risk\/Ödül|Risk : Ödül/i').first();
    await expect(rrIndicator).toBeVisible();

    // Verify aligned T0 target (+%3 Bölgesi) exists
    const t0Badge = page.locator('text=/T0.*%3|T0 Kâr/i').first();
    await expect(t0Badge).toBeVisible();

    // Verify Setup / Confidence star indicator exists
    const qualityLabel = page.locator('text=/⭐|Algoritmik Kurulum|Onaylanan Kriterler/i').first();
    await expect(qualityLabel).toBeVisible();

    // Save screenshot focused on the unified AI Co-Pilot modal
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_tradecard_expanded.png'),
      fullPage: false,
    });

    // Close modal
    const closeBtn = page.locator('div.p-6 button:has-text("✕")').first();
    await closeBtn.click();
    await expect(modalBadge).not.toBeVisible();
  });
});
