import { db, type Tab } from '@/lib/db';
import { normalizeTabUrl } from '@/lib/tabService';

export const SYNC_DEBOUNCE_MS = 350;

/**
 * Sets a temporary restoration lock for a window to protect tabs being restored
 * from premature tombstoning during staggered tab spawning.
 */
export async function setWindowRestoring(windowId: number, durationMs = 3000): Promise<void> {
    try {
        if (typeof chrome === 'undefined' || !chrome.storage?.session) return;
        const res = await chrome.storage.session.get('restoringWindows');
        const restoringWindows: Record<number, number> = res?.restoringWindows || {};
        restoringWindows[windowId] = Date.now() + durationMs;
        await chrome.storage.session.set({ restoringWindows });
    } catch (err) {
        console.warn('Background TabSync: Failed to set restoring window state:', err);
    }
}

/**
 * Checks whether a window is currently in restoration mode.
 */
export async function isWindowRestoring(windowId: number): Promise<boolean> {
    try {
        if (typeof chrome === 'undefined' || !chrome.storage?.session) return false;
        const res = await chrome.storage.session.get('restoringWindows');
        const restoringWindows: Record<number, number> = res?.restoringWindows || {};
        const expiry = restoringWindows[windowId];
        if (!expiry) return false;
        if (expiry > Date.now()) {
            return true;
        }
        // Expired entry: clean it up
        delete restoringWindows[windowId];
        await chrome.storage.session.set({ restoringWindows });
        return false;
    } catch (err) {
        console.warn('Background TabSync: Failed to query restoring window state:', err);
        return false;
    }
}

interface PendingSync {
    timer: ReturnType<typeof setTimeout>;
    resolvers: Array<() => void>;
    rejecters: Array<(err: any) => void>;
    explicitSpaceId?: number;
}

const pendingSyncs = new Map<number, PendingSync>();

/**
 * Cancels any pending debounced sync timer for the given window ID.
 * Aborts trailing-edge timers when a window is closed or torn down.
 */
export function cancelPendingSync(windowId: number): void {
    const pending = pendingSyncs.get(windowId);
    if (pending) {
        clearTimeout(pending.timer);
        pendingSyncs.delete(windowId);
    }
}

/**
 * Clears any pending debounced sync timers (primarily for test teardown).
 */
export function clearPendingSyncsForTesting(): void {
    for (const pending of pendingSyncs.values()) {
        clearTimeout(pending.timer);
    }
    pendingSyncs.clear();
}

/**
 * Internal execution logic for synchronizing tabs from an active Chrome window to Dexie.
 */
async function executeSync(windowId: number, explicitSpaceId?: number): Promise<void> {
    try {
        let spaceId = explicitSpaceId;
        if (spaceId === undefined) {
            // 1. Check if window is tracked as an active space
            const activeSpaces = await chrome.storage.session.get('activeSpaces').then(res => res?.activeSpaces || {});
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

        // Check if window is in restoration mode (staggered tab spawning)
        const isRestoring = await isWindowRestoring(windowId);

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
        // CRITICAL INVARIANT: If the window is currently in restoration mode, skip the closed
        // tab detection loop entirely. Existing active Dexie tabs not yet returned by Chrome must remain untouched.
        if (!isRestoring) {
            for (const existingTab of existingTabs) {
                if (!existingTab.deletedAt && existingTab.id !== undefined && !claimedTabIds.has(existingTab.id)) {
                    tabsToUpsert.push({
                        ...existingTab,
                        deletedAt: Date.now(),
                        updatedAt: Date.now(),
                    });
                }
            }
        }

        // 6. Atomic Execution via bulkPut (NEVER destructive delete or bulkAdd)
        let didWrite = false;
        await db.transaction('rw', db.tabs, async () => {
            if (tabsToUpsert.length > 0) {
                await db.tabs.bulkPut(tabsToUpsert);
                didWrite = true;
            }
        });

        // 7. Cross-process mutation bridge: notify sidepanel to debounce auto-sync
        if (didWrite) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    chrome.runtime.sendMessage({ type: 'TABBELLUS_LOCAL_MUTATION', source: 'tabSyncService' }).catch(() => {});
                }
            } catch {
                // Silently ignore when runtime or receiver is unavailable
            }
        }
    } catch (error) {
        console.error('Background Sync: Failed to sync space for window', windowId, error);
        throw error;
    }
}

/**
 * Synchronizes tabs from an active Chrome window to its corresponding Space record in Dexie.
 * Applies a per-window trailing-edge debounce (350ms default) to ensure rapid successive
 * tab events settle into a single cohesive delta update.
 *
 * @param windowId The Chrome window ID containing the tabs.
 * @param explicitSpaceId Optional space ID override if already resolved by caller.
 * @param options Optional configuration (e.g. debounceMs override).
 */
export async function performSync(
    windowId: number,
    explicitSpaceId?: number,
    options?: { debounceMs?: number }
): Promise<void> {
    const delay = options?.debounceMs !== undefined ? options.debounceMs : SYNC_DEBOUNCE_MS;

    return new Promise<void>((resolve, reject) => {
        const existing = pendingSyncs.get(windowId);
        if (existing) {
            clearTimeout(existing.timer);
            existing.resolvers.push(resolve);
            existing.rejecters.push(reject);
            if (explicitSpaceId !== undefined) {
                existing.explicitSpaceId = explicitSpaceId;
            }
            existing.timer = setTimeout(async () => {
                pendingSyncs.delete(windowId);
                try {
                    await executeSync(windowId, existing.explicitSpaceId);
                    existing.resolvers.forEach(r => r());
                } catch (err) {
                    existing.rejecters.forEach(rj => rj(err));
                }
            }, delay);
        } else {
            const pending: PendingSync = {
                resolvers: [resolve],
                rejecters: [reject],
                explicitSpaceId,
                timer: setTimeout(async () => {
                    pendingSyncs.delete(windowId);
                    try {
                        await executeSync(windowId, pending.explicitSpaceId);
                        pending.resolvers.forEach(r => r());
                    } catch (err) {
                        pending.rejecters.forEach(rj => rj(err));
                    }
                }, delay),
            };
            pendingSyncs.set(windowId, pending);
        }
    });
}
