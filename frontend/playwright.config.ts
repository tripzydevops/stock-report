import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
      testMatch: /desktop-view\.spec\.ts/,
    },
    {
      name: 'Mobile Chrome (Pixel 7)',
      use: {
        ...devices['Pixel 7'],
      },
      testMatch: /mobile.*\.spec\.ts/,
    },
    {
      name: 'Mobile iPhone Emulation (iPhone 14 / Chromium)',
      use: {
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
      testMatch: /mobile.*\.spec\.ts/,
    },
  ],
});
