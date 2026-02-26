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
    /**
     * Toggles the pinned state of a space.
     */
    async toggleSpacePin(spaceId: number): Promise<void> {
        const space = await db.spaces.get(spaceId);
        if (!space) return;

        await db.spaces.update(spaceId, { isPinned: !space.isPinned });
    }

    /**
     * Updates the name of a space.
     */
    async updateSpaceName(spaceId: number, newName: string): Promise<void> {
        if (!newName.trim()) return;
        await db.spaces.update(spaceId, { name: newName.trim() });
    }

    async restoreSpace(spaceId: number): Promise<void> {
        // Avoid import cycle by dynamically accessing store
        const { useAppStore } = await import('@/store/appStore');

        const tabs = await db.tabs.where({ spaceId }).sortBy('order');
        if (tabs.length === 0) return;

        const win = await chrome.windows.create({
            url: tabs[0].url,
            focused: true,
            type: 'normal'
        });

        if (win.id) {
            useAppStore.getState().registerActiveSpace(spaceId, win.id);

            const remainingTabs = tabs.slice(1);
            if (remainingTabs.length > 0) {
                const windowId = win.id;
                // Fire and forget async loop for staggered loading
                (async () => {
                    for (const tab of remainingTabs) {
                        await new Promise(r => setTimeout(r, 400));
                        try {
                            await chrome.tabs.create({
                                windowId,
                                url: tab.url,
                                active: false
                            });
                        } catch (error) {
                            console.error('SpaceService: Failed to create staggered tab', error);
                        }
                    }
                })();
            }
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
