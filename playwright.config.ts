import { defineConfig, devices } from '@playwright/test';

const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === 'true';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: externalServer
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1',
        port: 4173,
        reuseExistingServer: !process.env.CI,
      },
});
