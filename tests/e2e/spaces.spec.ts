import { test, expect } from '../fixtures/extension';

/**
 * TabBellus Sidepanel Core E2E — Smoke & Interaction Tests
 *
 * Verifies that the compiled extension loads in Chromium, the sidepanel
 * renders its structural shell (GlobalHeader + ViewSwitcher), and
 * view state mutations propagate correctly through the UI.
 */

test.describe('TabBellus Sidepanel Core E2E', () => {
  test('smoke: sidepanel shell renders with header and view switcher', async ({
    page,
    extensionId,
  }) => {
    // Navigate to the compiled sidepanel entry point
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

    // Wait for hydration to complete (HydrationGuard clears "Loading..." text)
    await expect(page.getByText('Loading...')).toBeHidden({ timeout: 10_000 });

    // ── GlobalHeader assertions ──────────────────────────────────
    // Logo image should be present
    const logo = page.getByAltText('TabBellus Logo');
    await expect(logo).toBeVisible();

    // Search trigger button with placeholder text
    await expect(page.getByText('Search...')).toBeVisible();

    // ── ViewSwitcher assertions ──────────────────────────────────
    // All three view segment buttons should be rendered
    const activeButton = page.getByRole('button', { name: 'Active' });
    const spacesButton = page.getByRole('button', { name: 'Spaces' });
    const readLaterButton = page.getByRole('button', { name: 'Read Later' });

    await expect(activeButton).toBeVisible();
    await expect(spacesButton).toBeVisible();
    await expect(readLaterButton).toBeVisible();
  });

  test('interaction: clicking Spaces view shows empty state', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await expect(page.getByText('Loading...')).toBeHidden({ timeout: 10_000 });

    // Click the "Spaces" segment button to switch views
    const spacesButton = page.getByRole('button', { name: 'Spaces' });
    await spacesButton.click();

    // The SpaceList empty state should render since no spaces exist
    await expect(page.getByText('No spaces captured yet')).toBeVisible({
      timeout: 5_000,
    });
  });
});
