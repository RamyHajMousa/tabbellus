import { db, type Tab } from '@/lib/db';
import { normalizeTabUrl } from '@/lib/tabService';

/**
 * Synchronizes tabs from an active Chrome window to its corresponding Space record in Dexie.
 * Performs an in-place delta upsert to preserve auto-increment primary keys, revive tombstoned
 * records, and soft-delete closed tabs without destructive table wiping.
 *
 * @param windowId The Chrome window ID containing the tabs.
 * @param explicitSpaceId Optional space ID override if already resolved by caller.
 */
export async function performSync(windowId: number, explicitSpaceId?: number): Promise<void> {
    try {
        let spaceId = explicitSpaceId;
        if (spaceId === undefined) {
            // 1. Check if window is tracked as an active space
            const activeSpaces = await chrome.storage.session.get('activeSpaces').then(res => res.activeSpaces || {});
            const spaceIdStr = Object.keys(activeSpaces).find(k => activeSpaces[parseInt(k, 10)] === windowId);

            if (!spaceIdStr) return; // Not a tracked space window

            spaceId = parseInt(spaceIdStr, 10);
        }

        if (isNaN(spaceId)) return;

        // 2. Fetch current tabs in that window
        const windowTabs = await chrome.tabs.query({ windowId });

        // Filter valid tabs (consistent with SpaceService capture logic)
        const validTabs = windowTabs.filter(tab => {
            const url = tab.url || '';
            return (
                url &&
                !url.startsWith('chrome://') &&
                !url.startsWith('chrome-extension://') &&
                !url.startsWith('about:') &&
                !url.startsWith('edge://')
            );
        });

        if (validTabs.length === 0) return; // Don't wipe space if empty/invalid state temporarily

        // 3. Query all existing tabs for this space from Dexie (including soft-deleted)
        const existingTabs = await db.tabs.where({ spaceId }).toArray();

        // Group existing tabs by normalized URL
        const existingByNormUrl = new Map<string, Tab[]>();
        for (const tab of existingTabs) {
            const normUrl = normalizeTabUrl(tab.url);
            const list = existingByNormUrl.get(normUrl) || [];
            list.push(tab);
            existingByNormUrl.set(normUrl, list);
        }

        const tabsToUpsert: Tab[] = [];
        const claimedTabIds = new Set<number>();

        // 4. Compute Active Window Tabs
        for (let order = 0; order < validTabs.length; order++) {
            const openTab = validTabs[order];
            const rawUrl = openTab.url!;
            const normUrl = normalizeTabUrl(rawUrl);
            const matchingCandidates = existingByNormUrl.get(normUrl) || [];

            // Find an unclaimed match: prioritize active tab (!t.deletedAt), then tombstoned
            let match = matchingCandidates.find(t => !claimedTabIds.has(t.id!) && !t.deletedAt);
            if (!match) {
                match = matchingCandidates.find(t => !claimedTabIds.has(t.id!));
            }

            const now = Date.now();
            if (match && match.id !== undefined) {
                claimedTabIds.add(match.id);
                // In-place update: preserve existing primary key, update order/title/favicon, clear tombstone, bump updatedAt
                tabsToUpsert.push({
                    id: match.id,
                    spaceId,
                    url: rawUrl,
                    title: openTab.title || match.title || 'Untitled',
                    favicon: openTab.favIconUrl || match.favicon || '',
                    order,
                    createdAt: match.createdAt ?? now,
                    updatedAt: now,
                    deletedAt: undefined,
                });
            } else {
                // New tab (no matching existing record): omit id so Dexie auto-increments
                tabsToUpsert.push({
                    spaceId,
                    url: rawUrl,
                    title: openTab.title || 'Untitled',
                    favicon: openTab.favIconUrl || '',
                    order,
                    createdAt: now,
                    updatedAt: now,
                    deletedAt: undefined,
                });
            }
        }

        // 5. Compute Closed Tabs (Tombstoning)
        // Find all existing tabs in Dexie for this spaceId that were active (!t.deletedAt)
        // but are NO LONGER present in the active Chrome window.
        for (const existingTab of existingTabs) {
            if (!existingTab.deletedAt && existingTab.id !== undefined && !claimedTabIds.has(existingTab.id)) {
                tabsToUpsert.push({
                    ...existingTab,
                    deletedAt: Date.now(),
                    updatedAt: Date.now(),
                });
            }
        }

        // 6. Atomic Execution via bulkPut (NEVER destructive delete or bulkAdd)
        await db.transaction('rw', db.tabs, async () => {
            if (tabsToUpsert.length > 0) {
                await db.tabs.bulkPut(tabsToUpsert);
            }
        });
    } catch (error) {
        console.error('Background Sync: Failed to sync space for window', windowId, error);
    }
}
