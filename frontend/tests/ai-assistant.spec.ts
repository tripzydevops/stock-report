import { test, expect } from '@playwright/test';

test.describe('AI Assistant & Autonomous Market Copilot Verification', () => {
  test('AI Assistant answers January dividends, morning ORB session, and TURSG 6-month research', async ({ page }) => {
    test.setTimeout(90000);
    // 1. Navigate directly to #assistant tab
    await page.goto('http://localhost:3001/#assistant');
    await page.waitForLoadState('networkidle');

    // Verify AI Copilot header and connection status
    const copilotHeader = page.locator('text=/Otonom Piyasa & Portföy Asistanı|Autonomous Market & Portfolio Copilot/i');
    await expect(copilotHeader).toBeVisible({ timeout: 10000 });

    const statusBadge = page.locator('text=/Bağlı: Supabase DB|Connected: Supabase DB/i');
    await expect(statusBadge).toBeVisible();

    const inputArea = page.locator('textarea[placeholder*="sorun"], textarea[placeholder*="Ask freely"]');
    await expect(inputArea).toBeVisible();

    // ------------------------------------------------------------------
    // TEST 1: January Dividends Query
    // ------------------------------------------------------------------
    await inputArea.fill('which stocks pay dividends on january');
    const sendButton = page.locator('button:has-text("Gönder"), button:has-text("Send")');
    await sendButton.click();

    // Verify response renders with dividend table
    const dividendHeader = page.locator('text=/January Dividend Payout Calendar|Ocak Ayı Temettü Dağıtım Takvimi/i');
    await expect(dividendHeader).toBeVisible({ timeout: 30000 });

    const dividendTable = page.locator('table');
    await expect(dividendTable.first()).toBeVisible({ timeout: 10000 });

    // Verify presence of January payers like Altria (MO) or Realty Income (O) or MAIN
    const payerAsset = page.locator('table >> text=/Altria|Main Street|Realty Income|Verizon|Pfizer|MO|MAIN|O|VZ/i');
    await expect(payerAsset.first()).toBeVisible({ timeout: 10000 });

    // ------------------------------------------------------------------
    // TEST 2: Morning Session / ORB Bias Query
    // ------------------------------------------------------------------
    await inputArea.fill('is there any reason for the morning session to be this positive or negative');
    await sendButton.click();

    // Verify response renders with ORB session breakdown
    const orbHeader = page.locator('text=/Sabah Açılış Seansı|Morning Session Opening Range/i');
    await expect(orbHeader).toBeVisible({ timeout: 30000 });

    const biasPill = page.locator('text=/Strong Bullish|Güçlü Alıcılı/i');
    await expect(biasPill.first()).toBeVisible({ timeout: 10000 });

    // ------------------------------------------------------------------
    // TEST 3: TURSG Research & 6-Month Forward-Looking Outlook
    // ------------------------------------------------------------------
    await inputArea.fill('research news on turgs and give me your analytical opinion on the next 6 months');
    await sendButton.click();

    // Verify response renders with company deep-dive & 6-month scenario model
    const turgsHeader = page.locator('text=/TURSG.*Kapsamlı Araştırma|TURSG.*Comprehensive Research/i');
    await expect(turgsHeader).toBeVisible({ timeout: 30000 });

    const bullCaseText = page.locator('text=/Boğa.*Bull Case|Bull Case/i');
    await expect(bullCaseText.first()).toBeVisible();

    const baseCaseText = page.locator('text=/Baz.*Base Case|Base Case/i');
    await expect(baseCaseText.first()).toBeVisible();

    const bearCaseText = page.locator('text=/Ayı.*Bear Case|Bear Case/i');
    await expect(bearCaseText.first()).toBeVisible();

    // Capture screenshot of desktop conversation
    await page.screenshot({ path: 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9/ai_assistant_desktop_conversation.png', fullPage: true });

    // ------------------------------------------------------------------
    // TEST 4: Mobile Viewport Verification (390px iPhone 14)
    // ------------------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);

    const mobileOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(mobileOverflow).toBe(false);

    await page.screenshot({ path: 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9/ai_assistant_mobile_verified.png' });
  });
});
