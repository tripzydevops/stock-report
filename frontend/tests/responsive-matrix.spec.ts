import { test, expect } from '@playwright/test';

const BREAKPOINTS = [
  { name: 'Small Mobile (360px)', width: 360, height: 740 },
  { name: 'Standard iPhone (390px)', width: 390, height: 844 },
  { name: 'Tablet Portrait (768px)', width: 768, height: 1024 },
  { name: 'Small Laptop / Tablet Landscape (1024px)', width: 1024, height: 768 },
];

test.describe('P2 Responsive Matrix: Multi-Viewport Layout & Overflow Verification', () => {
  for (const bp of BREAKPOINTS) {
    test(`Viewport ${bp.name} [${bp.width}x${bp.height}] renders cleanly without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');

      // Wait for main content
      await page.waitForSelector('main, #root, body', { timeout: 10000 });

      // Invariant 1: Document scrollWidth must never exceed window innerWidth (zero horizontal viewport scroll)
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowing).toBeFalsy();

      // Invariant 2: Navigation is accessible appropriate to screen size
      if (bp.width >= 1024) {
        // Desktop / Large screens: Sidebar should be visible
        const sidebar = page.locator('aside');
        await expect(sidebar).toBeVisible();
      } else if (bp.width < 768) {
        // Small & Standard Mobile: Bottom navigation bar must be visible
        const mobileNav = page.locator('nav');
        await expect(mobileNav.first()).toBeVisible();
      } else {
        // Tablet: Header / navigation tabs must be visible
        const navElements = page.locator('header, nav');
        await expect(navElements.first()).toBeVisible();
      }

      // Invariant 3: Switch to Dividend Tab and check table containment
      const dividendTabButton = page.locator('button:visible:has-text("Temettü"), button:visible:has-text("Dividend")').first();
      await expect(dividendTabButton).toBeVisible();
      await dividendTabButton.click();
      await page.waitForTimeout(500);

      // Verify page still does not overflow horizontally
      const isDividendOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isDividendOverflowing).toBeFalsy();

      // Invariant 4: Switch to Portfolio Tab and verify table containment
      const portfolioTabButton = page.locator('button:visible:has-text("Portföy"), button:visible:has-text("Portfolio")').first();
      await expect(portfolioTabButton).toBeVisible();
      await portfolioTabButton.click();
      await page.waitForTimeout(500);

      const isPortfolioOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isPortfolioOverflowing).toBeFalsy();
    });
  }
});
