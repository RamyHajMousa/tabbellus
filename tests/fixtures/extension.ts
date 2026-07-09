import { test as base, type BrowserContext, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Custom Playwright fixture that launches Chromium with TabBellus loaded
 * as an unpacked extension from the compiled dist/ directory.
 *
 * Extension ID is extracted from the background service worker URL — this
 * is more reliable than parsing the chrome://extensions page DOM, which
 * can race against reflows during boot.
 */

// ESM-compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the compiled extension directory (relative to project root)
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

// Type for the custom fixtures exposed to test files
export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  // Override the default context to launch with extension flags
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
        '--disable-popup-blocking',
      ],
    });

    await use(context);
    await context.close();
  },

  // Extract extension ID from the background service worker target URL
  extensionId: async ({ context }, use) => {
    // The service worker URL follows the pattern:
    // chrome-extension://<extension-id>/service-worker.js
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    const workerUrl = serviceWorker.url();
    const extensionId = new URL(workerUrl).hostname;

    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
