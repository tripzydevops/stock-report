import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Layer 2 Autonomous Multi-Agent Reasoning & Cold-Start Profiler', () => {
  test('1. Verify Cold-Start Investor Archetype Wizard & Strategy Activation', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:3001/#signals', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Open Investor Archetype modal via header badge title
    const archetypeBtn = page.locator('button[title*="Yatırımcı Kimliği"], button[title*="Investor Archetype"]').first();
    await archetypeBtn.evaluate((b: HTMLElement) => b.click());
    await page.waitForTimeout(1000);

    // Verify modal header is visible
    const modalHeader = page.locator('text=Yatırımcı Kimliği & Strateji Sihirbazı').first();
    await expect(modalHeader).toBeVisible();

    // Capture Step 1 Screenshot portably
    const brainDir = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';
    const screenshot1Path = fs.existsSync(brainDir)
      ? path.join(brainDir, 'cold_start_onboarding_modal.png')
      : testInfo.outputPath('cold_start_onboarding_modal.png');

    await page.screenshot({
      path: screenshot1Path,
      fullPage: false
    });

    // Select "Pasif Nakit Akışı" archetype
    const passiveBtn = page.locator('button:has-text("Pasif Nakit Akışı")').first();
    await passiveBtn.evaluate((b: HTMLElement) => b.click());
    await page.waitForTimeout(600);

    // Step 1 -> Step 2
    await page.locator('button:has-text("Devam Et")').first().evaluate((b: HTMLElement) => b.click());
    await expect(page.locator('text=Risk Toleransı').first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Step 2 -> Step 3
    await page.locator('button:has-text("Devam Et")').first().evaluate((b: HTMLElement) => b.click());
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Otonom Ajan Kuralları').first()).toBeVisible({ timeout: 10000 });

    // Click "Stratejimi Aktifleştir"
    await page.locator('button:has-text("Stratejimi Aktifleştir")').first().evaluate((b: HTMLElement) => b.click());
    await page.waitForTimeout(1000);

    // Verify header badge reflects "Pasif Nakit Akışı"
    const updatedBadge = page.locator('button:has-text("Pasif Nakit Akışı")').first();
    await expect(updatedBadge).toBeVisible();
  });

  test('2. Verify Autonomous Multi-Agent Reasoning Endpoint & Cold-Start Explanations', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:3001/#assistant', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Query AI Copilot to run multi-agent analysis on FROTO
    const inputArea = page.locator('textarea[placeholder*="sorun"], textarea[placeholder*="Ask freely"]').first();
    await expect(inputArea).toBeVisible({ timeout: 10000 });

    await inputArea.fill('FROTO çoklu ajan analizi yap');
    const sendButton = page.locator('button:has-text("Gönder"), button:has-text("Send")').first();
    await sendButton.click();

    // Verify multi-agent verdict card renders with Screener, Dividend, and RiskGuard agents
    const reportHeader = page.locator('text=/Otonom Çoklu Ajan Karar Raporu|Autonomous Multi-Agent Recommendation/i').first();
    await expect(reportHeader).toBeVisible({ timeout: 35000 });

    const screenerAgent = page.locator('text=/ScreenerAgent/i').first();
    await expect(screenerAgent).toBeVisible();

    const dividendAgent = page.locator('text=/DividendSafetyAgent/i').first();
    await expect(dividendAgent).toBeVisible();

    const riskAgent = page.locator('text=/RiskGuardAgent/i').first();
    await expect(riskAgent).toBeVisible();

    const coldStartReasoning = page.locator('text=/Neden Bu Öneri Yapıldı|Why This Was Recommended/i').first();
    await expect(coldStartReasoning).toBeVisible();

    // Capture Multi-Agent Reasoning Screenshot portably
    const brainDir = 'C:/Users/elif/.gemini/antigravity/brain/63fa77f0-30f5-4ed8-95fd-10ef07babef9';
    const screenshot2Path = fs.existsSync(brainDir)
      ? path.join(brainDir, 'cold_start_agent_reasoning_report.png')
      : testInfo.outputPath('cold_start_agent_reasoning_report.png');

    await page.screenshot({
      path: screenshot2Path,
      fullPage: false
    });
  });
});
