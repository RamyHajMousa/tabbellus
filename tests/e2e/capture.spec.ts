import { test, expect } from '../fixtures/extension';

test.describe('Workspace Capture & View Management Lifecycle', () => {
  test('should capture the active session as a space, switch to Spaces view, and verify it exists', async ({
    page,
    context,
    extensionId,
  }) => {
    // 1. Open a new tab in the same context with a valid web URL so there is a valid tab to capture
    const contentPage = await context.newPage();
    await contentPage.goto('https://example.com');

    // 2. Navigate to the compiled sidepanel entry point
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await expect(page.getByText('Loading...')).toBeHidden({ timeout: 10_000 });

    // 3. Ensure we are on the Active Tab tree view (click the 'Active' switcher segment)
    const activeViewButton = page.getByRole('button', { name: 'Active' });
    await activeViewButton.click();

    // 4. Fill in the "Name this space..." input field
    const spaceNameInput = page.getByPlaceholder('Name this space...');
    await expect(spaceNameInput).toBeVisible();
    await spaceNameInput.fill('E2E Test Workspace');

    // 5. Click the "Save Space" button
    const saveButton = page.getByTitle('Save Space');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // 6. Assert that the input is cleared after saving
    await expect(spaceNameInput).toHaveValue('');

    // 7. Click the "Spaces" view segment on the ViewSwitcher
    const spacesViewButton = page.getByRole('button', { name: 'Spaces' });
    await spacesViewButton.click();

    // 8. Assert that the newly generated space item row ('E2E Test Workspace') exists dynamically in the DOM
    await expect(page.getByText('E2E Test Workspace')).toBeVisible({ timeout: 5000 });

    // 9. Verify that the empty state placeholder layout is no longer visible
    await expect(page.getByText('No spaces captured yet')).toBeHidden();
  });
});
