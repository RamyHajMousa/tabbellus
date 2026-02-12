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
    async restoreSpace(spaceId: number): Promise<void> {
        // Avoid import cycle by dynamically accessing store
        const { useAppStore } = await import('@/store/appStore');

        const tabs = await db.tabs.where({ spaceId }).sortBy('order');
        if (tabs.length === 0) return;

        const urls = tabs.map(t => t.url);
        const win = await chrome.windows.create({ url: urls, focused: true, type: 'normal' });

        if (win.id) {
            useAppStore.getState().registerActiveSpace(spaceId, win.id);
        }
    }

    /**
     * Adds a single tab to an existing Space.
     */
    async addTabToSpace(spaceId: number, tab: chrome.tabs.Tab): Promise<void> {
        if (!tab.url || !tab.title) return;

        await db.transaction('rw', db.tabs, async () => {
            // 1. Get current max order
            const lastTab = await db.tabs
                .where('spaceId')
                .equals(spaceId)
                .reverse()
                .sortBy('order')
                .then(tabs => tabs[0]);

            const nextOrder = lastTab ? lastTab.order + 1 : 0;

            // 2. Add
            await db.tabs.add({
                spaceId,
                url: tab.url!,
                title: tab.title || 'Untitled',
                favicon: tab.favIconUrl || '',
                order: nextOrder
            });
        });
    }

    /**
     * Creates a new Space from a specific list of tabs (e.g. from a Group).
     */
    async createSpaceFromTabs(name: string, tabs: chrome.tabs.Tab[]): Promise<void> {
        // 1. Filter
        const validTabs = tabs.filter(tab => {
            const url = tab.url || '';
            return (
                url &&
                !url.startsWith('chrome://') &&
                !url.startsWith('about:')
            );
        });

        if (validTabs.length === 0) {
            throw new Error('No valid tabs to save in this group.');
        }

        // 2. Transaction
        await db.transaction('rw', db.spaces, db.tabs, async () => {
            // Default name fallback if empty
            const safeName = name.trim() || `Untitled Group ${new Date().toLocaleTimeString()}`;

            const spaceId = await db.spaces.add({
                name: safeName,
                createdAt: Date.now()
            });

            const tabRecords: Tab[] = validTabs.map((tab, index) => ({
                spaceId: spaceId as number,
                url: tab.url!,
                title: tab.title || 'Untitled',
                favicon: tab.favIconUrl || '',
                order: index
            }));

            await db.tabs.bulkAdd(tabRecords);
        });
    }
}

// Singleton Export
export const spaceService = new SpaceService();
