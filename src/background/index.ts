import { db, type Tab } from '@/lib/db';

console.log('TabBellus Service Worker Initialized');

// Helper to check fuzzy URL matching for active spaces reconstruction
function isFuzzyUrlMatch(urlA: string, urlB: string): boolean {
    try {
        const a = new URL(urlA);
        const b = new URL(urlB);
        const hostA = a.hostname.replace(/^www\./, '').toLowerCase();
        const hostB = b.hostname.replace(/^www\./, '').toLowerCase();
        if (hostA !== hostB) return false;

        const pathA = a.pathname.replace(/\/$/, '') || '/';
        const pathB = b.pathname.replace(/\/$/, '') || '/';
        return pathA === pathB || pathA === '/' || pathB === '/' || pathA.startsWith(pathB) || pathB.startsWith(pathA);
    } catch {
        return urlA.trim().toLowerCase() === urlB.trim().toLowerCase();
    }
}

// Audit all open Chrome windows and match them against saved spaces to reconstruct tracking mappings
const auditActiveSpacesOnStartup = async () => {
    try {
        console.log('Background Sync: Commencing active space startup audit...');
        const windows = await chrome.windows.getAll({ populate: true });
        const spaces = await db.spaces.filter(s => !s.deletedAt).toArray();
        const activeSpaces: Record<number, number> = {};

        for (const space of spaces) {
            if (!space.id) continue;
            const spaceTabs = await db.tabs.where('spaceId').equals(space.id).sortBy('order');
            if (spaceTabs.length === 0) continue;

            const spaceUrls = spaceTabs
                .map(t => t.url)
                .filter(u => u && !u.startsWith('chrome://') && !u.startsWith('chrome-extension://') && !u.startsWith('about:'));

            if (spaceUrls.length === 0) continue;

            let bestWindowId: number | null = null;
            let bestMatchRate = 0;

            for (const win of windows) {
                if (!win.id || !win.tabs || win.tabs.length === 0) continue;
                const winUrls = win.tabs
                    .map(t => t.url || '')
                    .filter(u => u && !u.startsWith('chrome://') && !u.startsWith('chrome-extension://') && !u.startsWith('about:'));

                if (winUrls.length === 0) continue;

                let matchCount = 0;
                for (const wUrl of winUrls) {
                    if (spaceUrls.some(sUrl => isFuzzyUrlMatch(sUrl, wUrl))) {
                        matchCount++;
                    }
                }

                const matchRate = matchCount / spaceUrls.length;
                if (matchRate >= 0.85 && matchRate > bestMatchRate) {
                    bestMatchRate = matchRate;
                    bestWindowId = win.id;
                }
            }

            if (bestWindowId !== null) {
                activeSpaces[space.id] = bestWindowId;
            }
        }

        if (Object.keys(activeSpaces).length > 0) {
            await chrome.storage.session.set({ activeSpaces });
            console.log('Background Sync: Reconstructed activeSpaces mapping:', activeSpaces);

            // Staggered sync commit for each audited active space
            for (const spaceIdStr in activeSpaces) {
                const winId = activeSpaces[parseInt(spaceIdStr, 10)];
                await performSync(winId);
            }
        } else {
            console.log('Background Sync: Audit finished, no matching active spaces found.');
        }
    } catch (error) {
        console.error('Background Sync: Startup audit failed', error);
    }
};

chrome.runtime.onInstalled.addListener(() => {
    console.log('TabBellus Installed');
    db.open().then(() => {
        console.log('DB Connected in Background');
        auditActiveSpacesOnStartup();
    }).catch(err => {
        console.error('DB Connection Failed', err);
    });
});

chrome.runtime.onStartup.addListener(() => {
    console.log('TabBellus Startup');
    db.open().then(() => {
        auditActiveSpacesOnStartup();
    }).catch(err => {
        console.error('DB Connection Failed on Startup', err);
    });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// --- Live Sync Logic ---

const triggerSync = async (windowId: number) => {
    try {
        // 1. Mark windowId as dirty in session storage
        const res = await chrome.storage.session.get('dirtySyncWindows');
        const dirtySyncWindows: number[] = res.dirtySyncWindows || [];
        if (!dirtySyncWindows.includes(windowId)) {
            dirtySyncWindows.push(windowId);
            await chrome.storage.session.set({ dirtySyncWindows });
        }

        // 2. Schedule single-fire alarm (5 second delay). Re-creating resets native alarm timeout.
        await chrome.alarms.create(`sync-flush-${windowId}`, { delayInMinutes: 1 / 12 });
    } catch (err) {
        console.error('Background Sync: Failed to trigger sync', err);
    }
};

const performSync = async (windowId: number) => {
    try {
        // 1. Check if window is tracked as an active space
        const activeSpaces = await chrome.storage.session.get('activeSpaces').then(res => res.activeSpaces || {});
        const spaceIdStr = Object.keys(activeSpaces).find(k => activeSpaces[parseInt(k, 10)] === windowId);

        if (!spaceIdStr) return; // Not a tracked space window

        const spaceId = parseInt(spaceIdStr, 10);

        // 2. Fetch current tabs in that window
        const windowTabs = await chrome.tabs.query({ windowId });

        // Filter valid tabs (consistent with SpaceService capture logic)
        const validTabs = windowTabs.filter(tab => {
            const url = tab.url || '';
            return (
                url &&
                !url.startsWith('chrome://') &&
                !url.startsWith('chrome-extension://') &&
                !url.startsWith('about:')
            );
        });

        if (validTabs.length === 0) return; // Don't wipe space if empty/invalid state temporarily

        // 3. Update the database
        await db.transaction('rw', db.tabs, async () => {
            // Clear old tabs for this space
            await db.tabs.where({ spaceId }).delete();

            // Create new tab records
            const tabRecords: Tab[] = validTabs.map((tab, index) => ({
                spaceId,
                url: tab.url!,
                title: tab.title || 'Untitled',
                favicon: tab.favIconUrl || '',
                order: index
            }));

            await db.tabs.bulkAdd(tabRecords);
        });

    } catch (error) {
        console.error('Background Sync: Failed to sync space for window', windowId, error);
    }
};

// Global alarms listener to handle flushed synchronization
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith('sync-flush-')) {
        const windowIdStr = alarm.name.replace('sync-flush-', '');
        const windowId = parseInt(windowIdStr, 10);
        if (isNaN(windowId)) return;

        try {
            await performSync(windowId);

            // Clean up from dirtySyncWindows session cache
            const res = await chrome.storage.session.get('dirtySyncWindows');
            let dirtySyncWindows: number[] = res.dirtySyncWindows || [];
            dirtySyncWindows = dirtySyncWindows.filter(id => id !== windowId);
            await chrome.storage.session.set({ dirtySyncWindows });
        } catch (err) {
            console.error('Background Sync: Failed to process alarm sync', err);
        }
    }
});

// Listeners for Tab Changes
chrome.tabs.onCreated.addListener((tab) => {
    if (tab.windowId) triggerSync(tab.windowId);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned) {
        if (tab.windowId) triggerSync(tab.windowId);
    }
});

chrome.tabs.onRemoved.addListener((_tabId, removeInfo) => {
    if (removeInfo.windowId && !removeInfo.isWindowClosing) {
        triggerSync(removeInfo.windowId);
    }
});

chrome.tabs.onMoved.addListener((_tabId, moveInfo) => {
    if (moveInfo.windowId) triggerSync(moveInfo.windowId);
});

chrome.tabs.onAttached.addListener((_tabId, attachInfo) => {
    if (attachInfo.newWindowId) triggerSync(attachInfo.newWindowId);
});

chrome.tabs.onDetached.addListener((_tabId, detachInfo) => {
    if (detachInfo.oldWindowId) triggerSync(detachInfo.oldWindowId);
});

chrome.tabs.onReplaced.addListener(async (addedTabId) => {
    try {
        const tab = await chrome.tabs.get(addedTabId);
        if (tab.windowId) {
            triggerSync(tab.windowId);
        }
    } catch (e) {
        console.warn('Background Sync: Failed to handle tab replacement:', e);
    }
});

// Listener for Window Closed (Cleanup tracked space mapping)
chrome.windows.onRemoved.addListener(async (windowId) => {
    try {
        const activeSpaces = await chrome.storage.session.get('activeSpaces').then(res => res.activeSpaces || {});
        let modified = false;

        for (const key in activeSpaces) {
            if (activeSpaces[key] === windowId) {
                delete activeSpaces[key];
                modified = true;
            }
        }

        if (modified) {
            await chrome.storage.session.set({ activeSpaces });
        }
    } catch (e) {
        console.error('Background Sync: Failed to clean up window map', e);
    }
});
