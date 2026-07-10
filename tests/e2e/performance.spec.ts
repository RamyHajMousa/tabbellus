import { test, expect } from '../fixtures/extension';

test.describe('Sidebar Rendering Performance & Virtualization Stress Test', () => {
  test('should render and virtualize high-volume lists within performance budgets', async ({
    page,
    extensionId,
  }) => {
    // 1. Navigate to the sidepanel interface
    await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await expect(page.getByText('Loading...')).toBeHidden({ timeout: 10_000 });

    // 2. Inject 500 mock tab records directly into IndexedDB via page.evaluate
    await page.evaluate(async () => {
      return new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open('TabBellusDB');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['spaces', 'tabs'], 'readwrite');
          const spacesStore = transaction.objectStore('spaces');
          const tabsStore = transaction.objectStore('tabs');

          const spaceAdd = spacesStore.add({
            name: 'Performance Stress Space',
            createdAt: Date.now(),
          });

          spaceAdd.onerror = () => reject(spaceAdd.error);
          spaceAdd.onsuccess = () => {
            const spaceId = spaceAdd.result as number;
            // Generate 500 mock tab entries connected to this spaceId
            for (let i = 0; i < 500; i++) {
              tabsStore.add({
                spaceId,
                url: `https://example.com/tab-${i}`,
                title: `Stress Tab Title ${i}`,
                favicon: '',
                order: i,
              });
            }
          };

          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });

    // 3. Reload the page to hydrate the seeded data from IndexedDB
    await page.reload();
    await expect(page.getByText('Loading...')).toBeHidden({ timeout: 10_000 });

    // 4. Start high-precision performance marker
    await page.evaluate(() => performance.mark('render-start'));

    // Switch to the 'Spaces' view
    const spacesViewButton = page.getByRole('button', { name: 'Spaces' });
    await spacesViewButton.click();

    // Wait for the seeded space item to completely mount and display
    await page.waitForSelector('text=Performance Stress Space');

    // End performance marker
    await page.evaluate(() => performance.mark('render-end'));

    // 5. Measure and assert render latency budget (under 100ms)
    const renderDuration = await page.evaluate(() => {
      performance.measure('render-duration', 'render-start', 'render-end');
      const entries = performance.getEntriesByName('render-duration');
      return entries[0]?.duration || 0;
    });

    console.log(`[E2E PERF] Space list render completed in: ${renderDuration.toFixed(2)}ms`);
    expect(renderDuration).toBeLessThan(100);

    // 6. Virtualization Assertion: Count physical row elements in the DOM.
    // All tab rows and space rows use the InteractiveRow component which has class `.group.relative`
    const physicalRowsCount = await page.locator('.group.relative').count();

    console.log(`[E2E PERF] Total physical InteractiveRow elements in DOM: ${physicalRowsCount}`);
    
    // Capped under 30 nodes because of react-virtuoso list virtualization
    expect(physicalRowsCount).toBeLessThan(30);
  });
});
