import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const PORT = 4173;

// Use an explicit Chromium if one is provided (or preinstalled, as in the cloud sandbox);
// otherwise fall back to the browser installed by `npx playwright install chromium`.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    serviceWorkers: 'allow',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'npm run build:mock && npm run preview',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
