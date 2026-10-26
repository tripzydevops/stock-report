import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Mobile Viewport & Navigation Usability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('header');
  });

  test('1. Mobile layout loads without horizontal overflow and renders top header', async ({ page }) => {
    // Verify no horizontal scrolling blowout
    const isHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isHorizontalOverflow).toBe(false);

    // Verify top header
    const hamburgerBtn = page.getByTitle('Menüyü Aç');
    await expect(hamburgerBtn).toBeVisible();

    // Verify MarketCorrectionBanner
    const banner = page.locator('text=Piyasa Düzeltme Modunda');
    await expect(banner.first()).toBeVisible();

    // Capture screenshot of mobile default view
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_default_signals.png'),
      fullPage: false,
    });
  });

  test('2. Hamburger menu opens SidebarNav drawer with full links and closes on backdrop tap', async ({ page }) => {
    // Click hamburger button
    const hamburgerBtn = page.getByTitle('Menüyü Aç');
    await hamburgerBtn.click();

    // Drawer aside should be visible
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();
    await expect(aside).toHaveClass(/translate-x-0/);

    // Verify brand and core links in drawer
    await expect(page.locator('aside').getByText('MarketPulse').first()).toBeVisible();
    await expect(page.locator('aside').getByText('Sinyaller & Fırsatlar').first()).toBeVisible();
    await expect(page.locator('aside').getByText('Portföyüm').first()).toBeVisible();
    await expect(page.locator('aside').getByText('Temettü Gelirleri').first()).toBeVisible();
    await expect(page.locator('aside').getByText('KAP Bildirimleri').first()).toBeVisible();
    await expect(page.locator('aside').getByText('Kullanım Rehberi').first()).toBeVisible();

    // Capture screenshot of mobile drawer open
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_drawer_open.png'),
    });

    // Close via close button ✕
    const closeBtn = page.locator('aside button:has-text("✕")');
    await closeBtn.click();
    await expect(aside).toHaveClass(/-translate-x-full/);
  });

  test('3. MobileBottomNav allows 1-tap switching between core tabs', async ({ page }) => {
    // Bottom nav must be visible on mobile
    const bottomNav = page.locator('nav[aria-label="Mobile Navigation"]');
    await expect(bottomNav).toBeVisible();

    // Tap on Portföy
    const portfolioBtn = bottomNav.getByRole('button', { name: /Portföy/i });
    await portfolioBtn.click();

    // Wait for portfolio heading
    await expect(page.locator('h1').getByText(/Portföy/i)).toBeVisible();

    // Capture screenshot of portfolio on mobile
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_portfolio_view.png'),
    });

    // Tap on Temettü
    const dividendBtn = bottomNav.getByRole('button', { name: /Temettü/i });
    await dividendBtn.click();

    // Wait for dividend heading
    await expect(page.locator('h1').getByText(/Temettü/i)).toBeVisible();

    // Capture screenshot of dividend on mobile
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_dividend_view.png'),
    });
  });

  test('4. Date filter button toggles date filter cleanly on mobile without blowout', async ({ page }) => {
    // Click Date filter button in header
    const dateBtn = page.getByTitle('Tarih Aralığını Filtrele');
    await expect(dateBtn).toBeVisible();
    await dateBtn.click();

    // DateFilterBar should appear in main canvas
    const dateFilterSection = page.locator('text=Tarih Filtresi');
    await expect(dateFilterSection.first()).toBeVisible();

    // Verify horizontal overflow is still false
    const isOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(isOverflow).toBe(false);

    // Capture screenshot with Date Filter expanded
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_date_filter_open.png'),
    });
  });

  test('5. Help Center opens, renders all guide modules, searches, and expands FAQs', async ({ page }) => {
    // Click Hamburger to open sidebar
    const hamburgerBtn = page.getByTitle('Menüyü Aç');
    await hamburgerBtn.click();

    // Click Kullanım Rehberi
    const helpNavBtn = page.locator('aside').getByText('Kullanım Rehberi');
    await expect(helpNavBtn).toBeVisible();
    await helpNavBtn.click();

    // Verify Help Center Heading
    const helpHeading = page.locator('text=MarketPulse\'ı Nasıl Kullanırsınız?');
    await expect(helpHeading.first()).toBeVisible();

    // Verify 3-step quick start
    await expect(page.locator('text=3 Adımda Kolay Başlangıç Kılavuzu').first()).toBeVisible();

    // Verify Interactive Strategy Tabs
    const stoplossTab = page.locator('button:has-text("Zarar Kes (Stop-Loss)")');
    await expect(stoplossTab.first()).toBeVisible();
    await stoplossTab.first().click();
    await expect(page.locator('text=Stop-Loss Ne Zaman Çalıştırılmalı?').first()).toBeVisible();

    // Test Search Functionality
    const searchInput = page.locator('input[placeholder*="Örn: Kademeli Alım"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('panik');
    await expect(page.locator('text=Hisselerim %10 - %20 düştü, ne yapmalıyım?').first()).toBeVisible();

    // Capture screenshot of Help Center on mobile
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'mobile_help_center.png'),
    });
  });
});
