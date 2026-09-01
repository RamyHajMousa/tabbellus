import { db, type Tab, type Space, type SpaceWithTabs, type SavedTabResult } from './db';
import { tabService } from './tabService';

export type SpaceRestoreListener = (spaceId: number, windowId: number) => void;

export interface AppendTabsResult {
    total: number;
    appended: number;
    skipped: number;
}

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
     * Fetches all sorted tabs for a specific space ID.
     */
    async getTabsForSpace(spaceId: number): Promise<Tab[]> {
        try {
            return await db.tabs.where({ spaceId }).sortBy('order');
        } catch (error) {
            console.error('SpaceService: Failed to get tabs for space', error);
            return [];
        }
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
     * @param color Optional Chrome color tag.
     * @returns The newly created space ID.
     */
    async createEmptySpace(spaceName: string, color?: string): Promise<number> {
        if (!spaceName.trim()) {
            throw new Error('Space name cannot be empty.');
        }

        try {
            const sanitizedColor = color && color !== 'none' ? color : undefined;
            const spaceId = await db.spaces.add({
                name: spaceName.trim(),
                createdAt: Date.now(),
                color: sanitizedColor,
            });

            console.log(`Empty space "${spaceName}" created successfully with ID: ${spaceId}${sanitizedColor ? ` and color: ${sanitizedColor}` : ''}`);
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
     * Updates both the name and color of a space in a single atomic database operation.
     */
    async updateSpaceDetails(spaceId: number, name: string, color?: string): Promise<void> {
        const trimmedName = name.trim();
        if (!trimmedName) {
            throw new Error('Space name cannot be empty.');
        }
        try {
            await db.spaces.update(spaceId, { name: trimmedName, color });
        } catch (e) {
            console.error('SpaceService: Failed to update space details', e);
            throw e instanceof Error ? e : new Error('Failed to update space details.');
        }
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

    /**
     * Updates the color tag of a space.
     */
    async updateSpaceColor(spaceId: number, color: string | undefined): Promise<void> {
        try {
            await db.spaces.update(spaceId, { color });
        } catch (e) {
            console.error('SpaceService: Failed to update space color', e);
            throw e instanceof Error ? e : new Error('Failed to update space color.');
        }
    }

    /**
     * Duplicates a space and all its associated tabs preserving relative order.
     * @param spaceId The ID of the space to duplicate.
     * @returns The newly created space ID.
     */
    async duplicateSpace(spaceId: number): Promise<number> {
        try {
            return await db.transaction('rw', db.spaces, db.tabs, async () => {
                const sourceSpace = await db.spaces.get(spaceId);
                if (!sourceSpace) {
                    throw new Error('Space not found');
                }

                const sourceTabs = await db.tabs
                    .where({ spaceId })
                    .sortBy('order');

                const newSpaceId = (await db.spaces.add({
                    name: `Copy of ${sourceSpace.name}`,
                    createdAt: Date.now(),
                    isPinned: sourceSpace.isPinned,
                    color: sourceSpace.color,
                })) as number;

                if (sourceTabs.length > 0) {
                    const newTabs: Tab[] = sourceTabs.map((tab) => ({
                        spaceId: newSpaceId,
                        url: tab.url,
                        title: tab.title,
                        favicon: tab.favicon,
                        order: tab.order,
                    }));

                    await db.tabs.bulkAdd(newTabs);
                }

                return newSpaceId;
            });
        } catch (error) {
            console.error('SpaceService: Transaction failed during duplicateSpace', error);
            throw error instanceof Error ? error : new Error('Failed to duplicate space.');
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

    /**
     * Appends tabs from a space into an existing Chrome window without altering active space session bindings.
     * Deduplicates against already open tabs in the target window using normalized URLs.
     * Applies staggered tab creation (200ms interval) to prevent tab storm performance degradation.
     * @param spaceId The space ID whose tabs to append.
     * @param windowId The target Chrome window ID.
     * @returns Telemetry containing total, appended, and skipped counts.
     */
    async appendSpaceTabsToWindow(spaceId: number, windowId: number): Promise<AppendTabsResult> {
        try {
            const tabs = await this.getTabsForSpace(spaceId);
            if (tabs.length === 0) {
                return { total: 0, appended: 0, skipped: 0 };
            }

            // Query existing tabs in the target window to deduplicate
            const windowTabs = await chrome.tabs.query({ windowId });
            const openUrls = new Set(
                windowTabs
                    .map((t) => (t.url ? tabService.normalizeUrl(t.url) : ''))
                    .filter(Boolean)
            );

            // Filter out tabs that are already open in the window
            const tabsToCreate = tabs.filter((tab) => {
                if (!tab.url) return false;
                const normalized = tabService.normalizeUrl(tab.url);
                return !openUrls.has(normalized);
            });

            const skipped = tabs.length - tabsToCreate.length;

            if (tabsToCreate.length === 0) {
                return { total: tabs.length, appended: 0, skipped };
            }

            for (let i = 0; i < tabsToCreate.length; i++) {
                const tab = tabsToCreate[i];
                if (i > 0) {
                    await new Promise((r) => setTimeout(r, 200));
                }
                try {
                    await chrome.tabs.create({
                        windowId,
                        url: tab.url,
                        active: false,
                    });
                } catch (tabErr) {
                    console.error('SpaceService: Failed to append tab to window', tabErr);
                }
            }

            return {
                total: tabs.length,
                appended: tabsToCreate.length,
                skipped,
            };
        } catch (error) {
            console.error('SpaceService: Failed to append space tabs to window', error);
            throw error instanceof Error ? error : new Error('Failed to append space tabs to window.');
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
            if (e instanceof Error && e.message === 'DUPLICATE_TAB') {
                throw e;
            }
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

    /**
     * Moves a tab from its current space to a target space.
     * Checks for duplicate URLs in the target space and appends to the highest order index.
     * Runs atomically inside a Dexie transaction and returns original space ID and order metadata for undo recovery.
     */
    async moveTabBetweenSpaces(tabId: number, targetSpaceId: number): Promise<{ sourceSpaceId: number; originalOrder: number }> {
        try {
            return await db.transaction('rw', db.tabs, async () => {
                const sourceTab = await db.tabs.get(tabId);
                if (!sourceTab) {
                    throw new Error('Tab not found.');
                }

                const sourceSpaceId = sourceTab.spaceId;
                const originalOrder = sourceTab.order;

                if (sourceSpaceId === targetSpaceId) {
                    return { sourceSpaceId, originalOrder }; // Already in target space
                }

                // 1. Check for duplicate URL in target space
                const existing = await db.tabs
                    .where('spaceId')
                    .equals(targetSpaceId)
                    .filter(t => t.url === sourceTab.url)
                    .first();

                if (existing) {
                    throw new Error('DUPLICATE_TAB');
                }

                // 2. Get current max order in target space
                const lastTab = await db.tabs
                    .where('spaceId')
                    .equals(targetSpaceId)
                    .reverse()
                    .sortBy('order')
                    .then(tabs => tabs[0]);

                const nextOrder = lastTab ? lastTab.order + 1 : 0;

                // 3. Move tab to target space
                await db.tabs.update(tabId, {
                    spaceId: targetSpaceId,
                    order: nextOrder,
                });

                return { sourceSpaceId, originalOrder };
            });
        } catch (e) {
            if (e instanceof Error && e.message === 'DUPLICATE_TAB') {
                throw e;
            }
            console.error('SpaceService: Failed to move tab between spaces', e);
            throw e;
        }
    }

    /**
     * Restores a tab back to its original space and order index (e.g. for Undo action).
     */
    async restoreTabPosition(tabId: number, spaceId: number, order: number): Promise<void> {
        try {
            await db.tabs.update(tabId, { spaceId, order });
        } catch (e) {
            console.error('SpaceService: Failed to restore tab position', e);
            throw e;
        }
    }

    /**
     * Copies a tab record to a target space.
     * Checks for duplicate URLs in the target space and appends to the highest order index.
     * Runs atomically inside a Dexie transaction.
     */
    async copyTabToSpace(tabId: number, targetSpaceId: number): Promise<void> {
        try {
            await db.transaction('rw', db.tabs, async () => {
                const sourceTab = await db.tabs.get(tabId);
                if (!sourceTab) {
                    throw new Error('Tab not found.');
                }

                // 1. Check for duplicate URL in target space
                const existing = await db.tabs
                    .where('spaceId')
                    .equals(targetSpaceId)
                    .filter(t => t.url === sourceTab.url)
                    .first();

                if (existing) {
                    throw new Error('DUPLICATE_TAB');
                }

                // 2. Get current max order in target space
                const lastTab = await db.tabs
                    .where('spaceId')
                    .equals(targetSpaceId)
                    .reverse()
                    .sortBy('order')
                    .then(tabs => tabs[0]);

                const nextOrder = lastTab ? lastTab.order + 1 : 0;

                // 3. Add cloned tab to target space
                await db.tabs.add({
                    spaceId: targetSpaceId,
                    url: sourceTab.url,
                    title: sourceTab.title,
                    favicon: sourceTab.favicon,
                    order: nextOrder,
                });
            });
        } catch (e) {
            if (e instanceof Error && e.message === 'DUPLICATE_TAB') {
                throw e;
            }
            console.error('SpaceService: Failed to copy tab to space', e);
            throw e;
        }
    }
}

// Singleton Export
export const spaceService = new SpaceService();
