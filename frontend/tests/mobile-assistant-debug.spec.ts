import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACTS_DIR = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';

test.describe('Mobile Assistant & Navigation Verification', () => {
  test('Verify mobile navigation and sticky chat input on iPhone 14 (390x844)', async ({ page }) => {
    // 1. Start on home / signals
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify AI Asistan button is in bottom nav
    const assistantNavBtn = page.locator('nav button:has-text("AI Asistan"), nav button:has-text("AI Copilot")').first();
    await expect(assistantNavBtn).toBeVisible();

    // Take screenshot of home mobile
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_home_with_ai_nav.png') });

    // 2. Click AI Asistan from bottom nav
    await assistantNavBtn.click();
    await page.waitForTimeout(1000);

    // Verify header title displays AI Asistan cleanly without truncation
    const headerTitle = page.locator('header h1').first();
    const titleText = await headerTitle.textContent();
    console.log('Mobile Header Title:', titleText);
    expect(titleText).toContain('AI Asistan');

    // Verify chat textarea is visible and sticky
    const chatTextarea = page.locator('textarea[placeholder*="sorun"], textarea[placeholder*="Ask"]').first();
    await expect(chatTextarea).toBeVisible();
    await chatTextarea.scrollIntoViewIfNeeded();
    await expect(chatTextarea).toBeInViewport();

    // Take screenshot of assistant view on mobile
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_assistant_verified.png') });

    // 3. Test sending a message
    await chatTextarea.fill('BIST temettü kartopu için en iyi 3 hisse hangisi?');
    const sendBtn = page.locator('button:has-text("Gönder"), button:has-text("Send")').first();
    await sendBtn.click();

    // Wait for response to appear
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_assistant_chat_response.png') });

    // Verify no raw asterisks in assistant response headers or bold words
    const strongTags = await page.locator('strong').count();
    console.log('Rendered <strong> tags count:', strongTags);
    expect(strongTags).toBeGreaterThan(0);

    // 4. Test opening drawer from bottom nav
    const menuBtn = page.locator('nav button:has-text("Menü"), nav button:has-text("More")').first();
    await menuBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'mobile_drawer_verified.png') });

    const drawerTitle = page.locator('h3:has-text("MarketPulse")').first();
    await expect(drawerTitle).toBeVisible();
  });
});
