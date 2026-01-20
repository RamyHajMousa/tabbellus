import { db, type Tab } from './db';

class SpaceService {
    /**
     * Captures the current window's tabs into a new Space.
     * @param spaceName The user-provided name for the space.
     * @throws Error if no valid tabs are found or database transaction fails.
     */
    async captureCurrentWindow(spaceName: string): Promise<void> {
        // 1. Get all tabs in the current window
        const tabs = await chrome.tabs.query({ currentWindow: true });

        // 2. Filter out internal/empty tabs
        const validTabs = tabs.filter(tab => {
            const url = tab.url || '';
            return (
                url &&
                !url.startsWith('chrome://') &&
                !url.startsWith('chrome-extension://') &&
                !url.startsWith('about:')
            );
        });

        // 3. Validation: Ensure we strictly have something to save
        if (validTabs.length === 0) {
            console.warn('SpaceService: No valid tabs to capture.');
            throw new Error('No valid tabs found in this window. Open some websites first!');
        }

        // 4. Atomic Transaction
        try {
            await db.transaction('rw', db.spaces, db.tabs, async () => {
                // A. Create the Space
                const spaceId = await db.spaces.add({
                    name: spaceName.trim(),
                    createdAt: Date.now()
                });

                // B. Map and Create Tabs
                const tabRecords: Tab[] = validTabs.map((tab, index) => ({
                    spaceId: spaceId as number, // Dexie returns the key (number)
                    url: tab.url!,
                    title: tab.title || 'Untitled',
                    favicon: tab.favIconUrl || '', // Explicit mapping as requested
                    order: index
                }));

                await db.tabs.bulkAdd(tabRecords);
            });

            console.log(`Space "${spaceName}" captured successfully with ${validTabs.length} tabs.`);

        } catch (error) {
            console.error('SpaceService: Transaction failed', error);
            // Re-throw to allow UI to handle the feedback
            throw new Error('Failed to save space. Storage might be full.');
        }
    }
}

// Singleton Export
export const spaceService = new SpaceService();
