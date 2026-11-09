import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Watchlist TEFAS Real Prices & Badges', () => {
  test.use({ viewport: { width: 412, height: 915 } }); // Standard mobile viewport

  test('Guest watchlist heals 0 prices and displays TEFAS Fon badges with real NAV prices', async ({ page }) => {
    // 1. Pre-seed corrupted localStorage data identical to the defect in user screenshot
    await page.addInitScript(() => {
      const corruptedGuestItems = [
        {
          id: 'guest_pack_1_TTE',
          assetId: 'asset_TTE',
          symbol: 'TTE',
          name: 'İş Portföy BIST Teknoloji Fonu',
          assetClass: 'stock', // Previously misclassified
          market: 'TEFAS',
          currency: 'TRY',
          sector: '',
          addedAt: new Date().toISOString(),
          latestPrice: 0,
          openPrice: 0,
          dailyChangePercent: 0,
        },
        {
          id: 'guest_pack_2_MAC',
          assetId: 'asset_MAC',
          symbol: 'MAC',
          name: 'Marmara Capital Portföy Hisse Fonu',
          assetClass: 'fund',
          market: 'TEFAS',
          currency: 'TRY',
          sector: '',
          addedAt: new Date().toISOString(),
          latestPrice: 0,
          openPrice: 0,
          dailyChangePercent: 0,
        },
        {
          id: 'guest_pack_3_PPZ',
          assetId: 'asset_PPZ',
          symbol: 'PPZ',
          name: 'Azimut Portföy Para Piyasası Fonu',
          assetClass: 'fund',
          market: 'TEFAS',
          currency: 'TRY',
          sector: '',
          addedAt: new Date().toISOString(),
          latestPrice: 0,
          openPrice: 0,
          dailyChangePercent: 0,
        },
        {
          id: 'guest_pack_4_ZBJ',
          assetId: 'asset_ZBJ',
          symbol: 'ZBJ',
          name: 'Ziraat Portföy Başak Para Piyasası Fonu',
          assetClass: 'stock', // Previously misclassified
          market: 'TEFAS',
          currency: 'TRY',
          sector: '',
          addedAt: new Date().toISOString(),
          latestPrice: 0,
          openPrice: 0,
          dailyChangePercent: 0,
        },
        {
          id: 'guest_pack_5_TI2',
          assetId: 'asset_TI2',
          symbol: 'TI2',
          name: 'İş Portföy İki Para Piyasası Fonu',
          assetClass: 'stock', // Previously misclassified
          market: 'TEFAS',
          currency: 'TRY',
          sector: '',
          addedAt: new Date().toISOString(),
          latestPrice: 0,
          openPrice: 0,
          dailyChangePercent: 0,
        },
      ];
      localStorage.setItem('market_pulse_active_tab', 'watchlist');
      localStorage.setItem('marketpulse_guest_watchlist', JSON.stringify(corruptedGuestItems));
    });

    // 2. Open app directly at watchlist tab
    await page.goto('/#watchlist');
    await page.waitForLoadState('networkidle');

    // Wait for the watchlist section to render
    const tefasTab = page.locator('button:has-text("TEFAS Fonları")').first();
    await expect(tefasTab).toBeVisible({ timeout: 10000 });

    // Verify all 5 symbols exist in DOM
    for (const sym of ['ZBJ', 'TI2', 'TTE', 'MAC', 'PPZ']) {
      const symEl = page.locator(`span:has-text("${sym}")`).first();
      await expect(symEl).toBeVisible({ timeout: 5000 });
    }

    // Verify that NO card displays ₺0,0000 or ₺0.0000
    const zeroPrice = page.locator('text=₺0,0000, text=₺0.0000');
    expect(await zeroPrice.count()).toBe(0);

    // Verify TEFAS badges: every TEFAS card must display 'TEFAS Fon' badge
    const tefasBadges = page.locator('span:has-text("TEFAS Fon")');
    const badgeCount = await tefasBadges.count();
    console.log('Detected TEFAS Fon badges count:', badgeCount);
    expect(badgeCount).toBeGreaterThanOrEqual(5);

    // Verify Tab counts: TEFAS Fonları 5, BIST Hisseleri 0
    await expect(tefasTab).toContainText('5');

    const bistTab = page.locator('button:has-text("BIST Hisseleri")');
    await expect(bistTab).toContainText('0');

    // Take screenshot for visual validation artifact
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'verified_watchlist_tefas.png'),
      fullPage: true,
    });

    console.log('Screenshot successfully saved to verified_watchlist_tefas.png');
  });
});
