import { defineConfig } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for TabBellus extension E2E tests.
 *
 * Extensions require headed Chromium — headless mode does not support
 * chrome.runtime or extension APIs. The actual browser launch with
 * extension flags is handled by the custom fixture in tests/fixtures/extension.ts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1, // Extensions can conflict when loaded in parallel Chromium instances
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    headless: false, // Required — extensions do not load in headless mode
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        // Browser launch args are injected by the fixture, not here.
        // This project exists to label E2E runs in reporters.
      },
    },
  ],
});
