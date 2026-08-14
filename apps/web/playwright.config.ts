import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BROWSER_E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'pnpm --filter suqnaa-api start',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_HOST: '127.0.0.1',
        API_PORT: '4000'
      }
    },
    {
      command: 'pnpm --filter suqnaa-web start -- -H 127.0.0.1 -p 3000',
      url: 'http://127.0.0.1:3000/en',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000',
        API_BASE_URL: 'http://127.0.0.1:4000',
        WEB_ORIGIN: 'http://127.0.0.1:3000'
      }
    }
  ]
});
