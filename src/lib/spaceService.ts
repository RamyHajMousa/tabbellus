import { db, type Tab, type Space, type SpaceWithTabs, type SavedTabResult } from './db';

export type SpaceRestoreListener = (spaceId: number, windowId: number) => void;

class SpaceService {
    private restoreListeners = new Set<SpaceRestoreListener>();

    /**
     * Registers a listener to be notified when a space is restored.
     * @returns A function to unregister the listener.
     */
    onRestore(listener: SpaceRestoreListener): () => void {
        this.restoreListeners.add(listener);
        return () => {
            this.restoreListeners.delete(listener);
        };
    }

    private emitRestore(spaceId: number, windowId: number): void {
        this.restoreListeners.forEach(listener => {
            try {
                listener(spaceId, windowId);
            } catch (error) {
                console.error('SpaceService: Error in restore listener', error);
            }
        });
    }

    /**
     * Retrieves a tab by its ID.
     */
    async getTabById(tabId: number): Promise<Tab | undefined> {
        return db.tabs.get(tabId);
    }

    /**
     * Deletes a tab by its ID.
     */
    async deleteTab(tabId: number): Promise<void> {
        await db.tabs.delete(tabId);
    }

    /**
     * Restores (adds back) a tab record.
     */
    async restoreTab(tab: Tab): Promise<void> {
        await db.tabs.add(tab);
    }

    /**
     * Query provider for useSpaces hook (LIFO + pinned priority).
     */
    getSpacesOrderedQuery() {
        return async (): Promise<Space[]> => {
            const spaces = await db.spaces
                .filter((space) => !space.deletedAt)
                .toArray();

            return spaces.sort((a, b) => {
                const aPinned = a.isPinned ? 1 : 0;
                const bPinned = b.isPinned ? 1 : 0;

                if (aPinned !== bPinned) {
                    return bPinned - aPinned;
                }

                return b.createdAt - a.createdAt;
            });
        };
    }

    /**
     * Query provider for space list ordered by creation date LIFO.
     */
    getSpacesNewestFirstQuery() {
        return () => db.spaces
            .orderBy('createdAt')
            .reverse()
            .filter(s => !s.deletedAt)
            .toArray();
    }

    /**
     * Query provider for fetching a space by ID.
     */
    getSpaceByIdQuery(spaceId: number | undefined) {
        return () => (spaceId ? db.spaces.get(spaceId) : undefined);
    }

    /**
     * Query provider for fetching sorted tabs in a space.
     */
    getTabsForSpaceQuery(spaceId: number | undefined) {
        return () => (spaceId ? db.tabs.where({ spaceId }).sortBy('order') : []);
    }

    /**
     * Query provider for spaces with their tabs populated (for history matching).
     */
    getSpacesWithTabsQuery(isEnabled: boolean) {
        return async (): Promise<SpaceWithTabs[]> => {
            if (!isEnabled) return [];
            const spaces = await db.spaces.filter((s) => !s.deletedAt).toArray();

            return Promise.all(
                spaces.map(async (space) => {
                    const tabs = await db.tabs.where('spaceId').equals(space.id!).toArray();
                    return { space, tabs };
                })
            );
        };
    }

    /**
     * Fetches all active non-deleted spaces.
     */
    async getNonDeletedSpaces(): Promise<Space[]> {
        return db.spaces.filter((s) => !s.deletedAt).toArray();
    }

    /**
     * Fetches unique saved tabs across spaces grouped by URL.
     */
    async getSavedTabsGroupedByUrl(): Promise<SavedTabResult[]> {
        const fetchedSpaces = await this.getNonDeletedSpaces();
        const spaceIds = fetchedSpaces.map((s) => s.id).filter((id): id is number => id !== undefined);
        if (spaceIds.length === 0) return [];

        try {
            const allTabs = await db.tabs.where('spaceId').anyOf(spaceIds).toArray();
            const spaceNameMap = new Map<number, string>();
            fetchedSpaces.forEach((s) => {
                if (s.id !== undefined) {
                    spaceNameMap.set(s.id, s.name);
                }
            });

            const tabMap = new Map<string, SavedTabResult>();
            for (const tab of allTabs) {
                const spaceName = spaceNameMap.get(tab.spaceId);
                if (!spaceName) continue;

                const existing = tabMap.get(tab.url);
                if (existing) {
                    if (!existing.spaceNames.includes(spaceName)) {
                        existing.spaceNames.push(spaceName);
                    }
                } else {
                    tabMap.set(tab.url, {
                        url: tab.url,
                        title: tab.title,
                        favicon: tab.favicon,
                        spaceNames: [spaceName],
                    });
                }
            }

            return Array.from(tabMap.values());
        } catch (error) {
            console.error('SpaceService: Error fetching/grouping saved tabs:', error);
            return [];
        }
    }
    /**
     * Creates an empty space with no initial tabs.
     * @param spaceName The user-provided name for the space.
     * @returns The newly created space ID.
     */
    async createEmptySpace(spaceName: string): Promise<number> {
        if (!spaceName.trim()) {
            throw new Error('Space name cannot be empty.');
        }

        try {
            const spaceId = await db.spaces.add({
                name: spaceName.trim(),
                createdAt: Date.now()
            });

            console.log(`Empty space "${spaceName}" created successfully with ID: ${spaceId}`);
            return spaceId as number;
        } catch (error) {
            console.error('SpaceService: Failed to create empty space', error);
            throw error instanceof Error ? error : new Error('Failed to create space.');
        }
    }

    /**
     * Captures the current window's tabs into a new Space.
     * @param spaceName The user-provided name for the space.
     * @throws Error if no valid tabs are found or database transaction fails.
     */
    async captureCurrentWindow(spaceName: string): Promise<void> {
        try {
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
            throw error instanceof Error ? error : new Error('Failed to save space. Storage might be full.');
        }
    }
    /**
     * Toggles the pinned state of a space.
     */
    async toggleSpacePin(spaceId: number): Promise<void> {
        try {
            const space = await db.spaces.get(spaceId);
            if (!space) return;

            await db.spaces.update(spaceId, { isPinned: !space.isPinned });
        } catch (e) {
            console.error('SpaceService: Failed to toggle space pin', e);
        }
    }

    /**
     * Retrieves a space by its ID.
     */
    async getSpaceById(spaceId: number): Promise<Space | undefined> {
        return db.spaces.get(spaceId);
    }

    /**
     * Soft deletes a space.
     */
    async softDeleteSpace(spaceId: number) {
        return db.softDeleteSpace(spaceId);
    }

    /**
     * Restores a soft-deleted space.
     */
    async undoDeleteSpace(spaceId: number) {
        return db.undoDeleteSpace(spaceId);
    }

    /**
     * Hard deletes a space and its tabs.
     */
    async hardDeleteSpace(spaceId: number) {
        return db.hardDeleteSpace(spaceId);
    }

    /**
     * Updates the name of a space.
     */
    async updateSpaceName(spaceId: number, newName: string): Promise<void> {
        if (!newName.trim()) return;
        try {
            await db.spaces.update(spaceId, { name: newName.trim() });
        } catch (e) {
            console.error('SpaceService: Failed to update space name', e);
        }
    }

    async restoreSpace(spaceId: number): Promise<void> {
        try {
            const tabs = await db.tabs.where({ spaceId }).sortBy('order');
            if (tabs.length === 0) return;

            const win = await chrome.windows.create({
                url: tabs[0].url,
                focused: true,
                type: 'normal'
            });

            if (win.id) {
                this.emitRestore(spaceId, win.id);

                // Configure Side Panel Options Declaratively
                try {
                    await chrome.sidePanel.setOptions({
                        windowId: win.id,
                        path: 'src/sidepanel/index.html',
                        enabled: true
                    } as any);
                } catch (err) {
                    console.warn('[SpaceService] Failed to set sidePanel options:', err);
                }

                // Automatically open the side panel when a space is fully generated
                try {
                    await chrome.sidePanel.open({ windowId: win.id });
                } catch (err) {
                    console.warn('[SpaceService] sidePanel.open skipped (user gesture expired):', err);
                }

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
        } catch (e) {
            console.error('SpaceService: Failed to restore space', e);
        }
    }

    async addTabToSpace(spaceId: number, tab: { url?: string; title?: string; favIconUrl?: string | null }): Promise<void> {
        if (!tab.url) return;

        try {
            await db.transaction('rw', db.tabs, async () => {
                // 1. Check for duplicate URL in target space
                const existing = await db.tabs
                    .where('spaceId')
                    .equals(spaceId)
                    .filter(t => t.url === tab.url)
                    .first();

                if (existing) {
                    throw new Error('DUPLICATE_TAB');
                }

                // 2. Get current max order
                const lastTab = await db.tabs
                    .where('spaceId')
                    .equals(spaceId)
                    .reverse()
                    .sortBy('order')
                    .then(tabs => tabs[0]);

                const nextOrder = lastTab ? lastTab.order + 1 : 0;

                // 3. Add
                await db.tabs.add({
                    spaceId,
                    url: tab.url!,
                    title: tab.title || 'Untitled',
                    favicon: tab.favIconUrl || '',
                    order: nextOrder
                });
            });
        } catch (e) {
            console.error('SpaceService: Failed to add tab to space', e);
            throw e;
        }
    }

    /**
     * Creates a new Space from a specific list of tabs (e.g. from a Group).
     */
    async createSpaceFromTabs(name: string, tabs: chrome.tabs.Tab[]): Promise<void> {
        try {
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
        } catch (e) {
            console.error('SpaceService: Failed to create space from tabs', e);
            throw e;
        }
    }
}

// Singleton Export
export const spaceService = new SpaceService();
