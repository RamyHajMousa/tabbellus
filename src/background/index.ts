import { db, type Tab } from '@/lib/db';


console.log('TabBellus Service Worker Initialized');

chrome.runtime.onInstalled.addListener(() => {
    console.log('TabBellus Installed');
    // Initialize default spaces if needed
    db.open().then(() => {
        console.log('DB Connected in Background');
    }).catch(err => {
        console.error('DB Connection Failed', err);
    });
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// --- Live Sync Logic ---

// Debounce map: WindowID -> Timeout
const syncDebounceMap = new Map<number, NodeJS.Timeout>();

const triggerSync = (windowId: number) => {
    if (syncDebounceMap.has(windowId)) {
        clearTimeout(syncDebounceMap.get(windowId));
    }

    syncDebounceMap.set(
        windowId,
        setTimeout(async () => {
            syncDebounceMap.delete(windowId);
            await performSync(windowId);
        }, 500)
    );
};

const performSync = async (windowId: number) => {
    // 1. Check if window is tracked as an active space
    const activeSpaces = await chrome.storage.session.get('activeSpaces').then(res => res.activeSpaces || {});
    const spaceIdStr = Object.keys(activeSpaces).find(k => activeSpaces[parseInt(k, 10)] === windowId);

    if (!spaceIdStr) return; // Not a tracked space window

    const spaceId = parseInt(spaceIdStr, 10);

    try {
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
        console.error('Background Sync: Failed to sync space', spaceId, error);
    }
};

// Listeners for Tab Changes
chrome.tabs.onCreated.addListener((tab) => {
    if (tab.windowId) triggerSync(tab.windowId);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    // Only trigger sync on relevant updates (e.g. url, title, but not simple visual loading states initially if possible to avoid spam)
    if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned) {
        if (tab.windowId) triggerSync(tab.windowId);
    }
});

chrome.tabs.onRemoved.addListener((_tabId, removeInfo) => {
    // Note: If this was the last tab, the window might close next, handled below
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
    // Clear any pending debounces
    if (syncDebounceMap.has(windowId)) {
        clearTimeout(syncDebounceMap.get(windowId));
        syncDebounceMap.delete(windowId);
    }

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
            // Let the store know directly if possible, though React hooks listen to session
        }
    } catch (e) {
        console.error('Failed to cleanup active spaces on window close', e);
    }
});
