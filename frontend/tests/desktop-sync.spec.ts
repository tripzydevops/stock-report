import { test, expect } from '@playwright/test';

test.describe('Desktop Sync Diagnostic & Verification', () => {
  test.setTimeout(120000);

  test('1. Desktop Header Sync: triggers live market price sync, returns HTTP 200, and displays success toast', async ({ page }) => {
    await page.goto('/?tab=portfolio');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header, main', { timeout: 20000 });

    // Wait a brief moment for initial render state to stabilize
    await page.waitForTimeout(2000);

    // Find desktop header sync button
    const headerSyncBtn = page.locator('header button[data-testid="mobile-sync-btn"]').first();
    await expect(headerSyncBtn).toBeVisible({ timeout: 15000 });
    console.log('--- Header Sync Button Found & Visible ---');

    // Trigger Header Sync and wait for /api/sync response
    console.log('--- Triggering Header Sync ---');
    const [syncResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/sync'), { timeout: 45000 }),
      headerSyncBtn.click(),
    ]);

    console.log(`Sync Response Status: ${syncResponse.status()}`);
    const syncJson = await syncResponse.json();
    console.log('Sync Response JSON:', JSON.stringify(syncJson, null, 2));

    expect(syncResponse.status()).toBe(200);
    expect(syncJson.success).toBe(true);

    // Verify feedback toast appears
    const toast = page.locator('text=/senkronize|güncellendi|başarıyla|sync/i').first();
    await expect(toast).toBeVisible({ timeout: 15000 });
    console.log('Toast Text:', await toast.textContent());
  });

  test('2. Desktop Portfolio View: displays direct sync button in cloud synchronized account', async ({ page }) => {
    await page.goto('/?tab=portfolio');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header, main', { timeout: 20000 });

    // Wait for guest or cloud banner
    const banner = page.locator('text=/Model Portföy|Bulut Hesabınızla|Cloud Synchronized/i').first();
    await expect(banner).toBeVisible({ timeout: 15000 });

    // Connect admin account to view cloud banner
    const quickAdminBtn = page.locator('button:has-text("1-Tık Yönetici Girişi"), button:has-text("1-Tap Admin")').first();
    if (await quickAdminBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('--- Connecting Cloud Account via 1-Tap Admin Login ---');
      await quickAdminBtn.click();
      await page.waitForSelector('text=/Bulut Hesabınızla Senkronize|Cloud Synchronized/i', { timeout: 20000 });
      console.log('--- Connected to Cloud Synchronized Account ---');
    }

    // Verify the direct sync button exists in PortfolioView
    const bannerSyncBtn = page.locator('button:has-text("Şimdi Eşitle"):visible, button:has-text("Sync Now"):visible').first();
    await expect(bannerSyncBtn).toBeVisible({ timeout: 10000 });
    console.log('--- Portfolio Direct Sync Button Verified ---');
  });
});


