import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

const ALL_TABS = [
  { id: 'signals', name: 'Sinyaller & Fırsatlar' },
  { id: 'portfolio', name: 'Portföyüm' },
  { id: 'dividend', name: 'Temettü Gelirleri' },
  { id: 'forecast', name: 'Kartopu & Projeksiyon' },
  { id: 'catalysts', name: 'KAP Bildirimleri' },
  { id: 'quant', name: 'Kurumsal Quant Hub' },
  { id: 'scorecard', name: 'Strateji Karnesi' },
  { id: 'orb', name: 'Açılış Seansı' },
  { id: 'help', name: 'Kullanım Rehberi' },
];

test.describe('Mobile Viewport Audit Across All 9 Tabs', () => {
  test('Check horizontal overflow and mobile layout across all 9 tabs', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header');

    for (const tab of ALL_TABS) {
      // Open sidebar drawer via hamburger
      const hamburgerBtn = page.getByTitle('Menüyü Aç');
      await hamburgerBtn.click();
      await page.waitForTimeout(300);

      // Click tab in drawer
      const tabBtn = page.locator(`aside button:has-text("${tab.name}")`).first();
      await expect(tabBtn).toBeVisible({ timeout: 5000 });
      await tabBtn.click();
      await page.waitForTimeout(600);

      // Verify no horizontal overflow on mobile
      const overflowData = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body.scrollWidth;

        // Find which specific elements (if any) exceed window.innerWidth
        const offendingElements: string[] = [];
        document.querySelectorAll('*').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.right > winWidth + 2) {
            const tag = el.tagName.toLowerCase();
            const cls = (el.className || '').toString().slice(0, 50);
            const id = el.id ? `#${el.id}` : '';
            offendingElements.push(`${tag}${id}.${cls} (right: ${Math.round(rect.right)}px > ${winWidth}px)`);
          }
        });

        return {
          hasOverflow: docWidth > winWidth || bodyWidth > winWidth,
          docWidth,
          winWidth,
          bodyWidth,
          offendingCount: offendingElements.length,
          sampleOffenders: offendingElements.slice(0, 5)
        };
      });

      console.log(`Tab: ${tab.id} -> docWidth: ${overflowData.docWidth}, winWidth: ${overflowData.winWidth}, offenders: ${overflowData.offendingCount}`);
      if (overflowData.offendingCount > 0) {
        console.log(`Sample offenders for ${tab.id}:`, overflowData.sampleOffenders);
      }

      // Take screenshot for this tab
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, `mobile_tab_${tab.id}.png`),
        fullPage: false,
      });

      expect(overflowData.hasOverflow, `Tab ${tab.id} had horizontal overflow! Offenders: ${JSON.stringify(overflowData.sampleOffenders)}`).toBe(false);
    }
  });
});
