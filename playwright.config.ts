import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1366, height: 800 },
    acceptDownloads: true,
    // Tracing records screenshots every frame and halves canvas frame rates, which would skew the FPS check.
    // Debug a failure with: npx playwright test --trace on
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 800 },
        // New headless mode with the real GPU, so frame-rate checks reflect a normal browser.
        // Without a usable GPU Chromium falls back to software rendering and the FPS test lowers its bar.
        channel: 'chromium',
        launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
