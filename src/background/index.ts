import { db, type Tab } from '@/lib/db';
import { isFuzzyMatch } from '@/lib/sessionUtils';
import { spaceService } from '@/lib/spaceService';
import { readLaterService } from '@/lib/readLaterService';
import { getReadLaterShortcutText } from '@/lib/platform';

console.log('TabBellus Service Worker Initialized');

// Audit all open Chrome windows and match them against saved spaces to reconstruct tracking mappings
const auditActiveSpacesOnStartup = async () => {
    try {
        console.log('Background Sync: Commencing active space startup audit...');
        const windows = await chrome.windows.getAll({ populate: true });
        const spaces = await db.spaces.filter(s => !s.deletedAt).toArray();
        if (spaces.length === 0 || windows.length === 0) return;

        // Fetch tabs for all non-deleted spaces up front
        const spacesWithTabs = await Promise.all(
            spaces.map(async (space) => {
                if (!space.id) return null;
                const tabs = await db.tabs.where('spaceId').equals(space.id).sortBy('order');
                const spaceUrls = tabs
                    .map(t => t.url)
                    .filter(u => u && !u.startsWith('chrome://') && !u.startsWith('chrome-extension://') && !u.startsWith('about:'));
                return { space, spaceUrls };
            })
        );

        const validSpacesWithTabs = spacesWithTabs.filter(
            (item): item is { space: typeof spaces[0]; spaceUrls: string[] } =>
                item !== null && item.spaceUrls.length > 0
        );

        const activeSpaces: Record<number, number> = {};
        const claimedSpaces = new Set<number>();

        for (const win of windows) {
            if (!win.id || !win.tabs || win.tabs.length === 0) continue;
            const winUrls = win.tabs
                .map(t => t.url || '')
                .filter(u => u && !u.startsWith('chrome://') && !u.startsWith('chrome-extension://') && !u.startsWith('about:'));

            if (winUrls.length === 0) continue;

            const spaceScores: { spaceId: number; score: number; matchCount: number; lengthDiff: number }[] = [];

            for (const { space, spaceUrls } of validSpacesWithTabs) {
                if (!space.id || claimedSpaces.has(space.id)) continue;

                let matchCount = 0;
                for (const wUrl of winUrls) {
                    if (spaceUrls.some(sUrl => isFuzzyMatch(sUrl, wUrl))) {
                        matchCount++;
                    }
                }

                if (matchCount === 0) continue;

                const spaceCoverage = matchCount / spaceUrls.length;

                // Threshold check (85% space coverage required)
                if (spaceCoverage >= 0.85) {
                    const lengthDiff = Math.abs(spaceUrls.length - winUrls.length);
                    spaceScores.push({
                        spaceId: space.id,
                        score: spaceCoverage,
                        matchCount,
                        lengthDiff
                    });
                }
            }

            if (spaceScores.length > 0) {
                // Best match wins: exact tab length difference first, then highest score/match count
                spaceScores.sort((a, b) => {
                    const aExact = a.lengthDiff === 0 ? 0 : 1;
                    const bExact = b.lengthDiff === 0 ? 0 : 1;
                    if (aExact !== bExact) return aExact - bExact;
                    if (b.score !== a.score) return b.score - a.score;
                    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
                    return a.lengthDiff - b.lengthDiff;
                });

                const bestMatch = spaceScores[0];
                activeSpaces[bestMatch.spaceId] = win.id;
                claimedSpaces.add(bestMatch.spaceId);
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
    setupContextMenus();
    db.open().then(() => {
        console.log('DB Connected in Background');
        auditActiveSpacesOnStartup();
        readLaterService.migrateGhostStatesToArchive().catch(err => {
            console.error('Background: Ghost state migration failed on install', err);
        });
    }).catch(err => {
        console.error('DB Connection Failed', err);
    });
});

chrome.runtime.onStartup.addListener(() => {
    console.log('TabBellus Startup');
    db.open().then(() => {
        auditActiveSpacesOnStartup();
        readLaterService.migrateGhostStatesToArchive().catch(err => {
            console.error('Background: Ghost state migration failed on startup', err);
        });
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
        console.log(`Alarm scheduled/reset for window ${windowId}`);
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
    console.log("Background alarm triggered:", alarm.name);
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
    console.log("Background intercepted tab mutation event for window:", tab.windowId);
    if (tab.windowId) triggerSync(tab.windowId);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned) {
        console.log("Background intercepted tab mutation event for window:", tab.windowId);
        if (tab.windowId) triggerSync(tab.windowId);
    }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log("Background intercepted tab mutation event for window:", removeInfo.windowId);
    if (removeInfo.windowId && !removeInfo.isWindowClosing) {
        triggerSync(removeInfo.windowId);
    }
    // Clean up tab lock state for removed tab
    try {
        const res = await chrome.storage.session.get('lockedTabIds');
        const lockedTabIds: number[] = res.lockedTabIds || [];
        if (lockedTabIds.includes(tabId)) {
            const updated = lockedTabIds.filter(id => id !== tabId);
            await chrome.storage.session.set({ lockedTabIds: updated });
        }
    } catch (err) {
        console.error('Background TabLock: Failed to clean up lockedTabIds on tab removal', err);
    }
});

// Listener for Tab Lock state requests from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_TAB_LOCK_STATE') {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
            sendResponse({ isLocked: false });
            return false;
        }
        chrome.storage.session.get('lockedTabIds').then((res) => {
            const lockedTabIds: number[] = res.lockedTabIds || [];
            sendResponse({ isLocked: lockedTabIds.includes(tabId) });
        }).catch((err) => {
            console.error('Background TabLock: Error fetching lock state:', err);
            sendResponse({ isLocked: false });
        });
        return true; // Keep message channel open for async response
    }
});


chrome.tabs.onMoved.addListener((_tabId, moveInfo) => {
    console.log("Background intercepted tab mutation event for window:", moveInfo.windowId);
    if (moveInfo.windowId) triggerSync(moveInfo.windowId);
});

chrome.tabs.onAttached.addListener((_tabId, attachInfo) => {
    console.log("Background intercepted tab mutation event for window:", attachInfo.newWindowId);
    if (attachInfo.newWindowId) triggerSync(attachInfo.newWindowId);
});

chrome.tabs.onDetached.addListener((_tabId, detachInfo) => {
    console.log("Background intercepted tab mutation event for window:", detachInfo.oldWindowId);
    if (detachInfo.oldWindowId) triggerSync(detachInfo.oldWindowId);
});

chrome.tabs.onReplaced.addListener(async (addedTabId) => {
    try {
        const tab = await chrome.tabs.get(addedTabId);
        console.log("Background intercepted tab mutation event for window:", tab.windowId);
        if (tab.windowId) {
            triggerSync(tab.windowId);
        }
    } catch (e) {
        console.warn('Background Sync: Failed to handle tab replacement:', e);
    }
});

// Listener for Window Closed (Cleanup tracked space mapping with footprint verification)
chrome.windows.onRemoved.addListener(async (windowId) => {
    try {
        const activeSpaces = await chrome.storage.session.get('activeSpaces').then(res => res.activeSpaces || {});
        
        // Find all space IDs mapped to the closed window
        const closingSpaceIds = Object.keys(activeSpaces)
            .filter(k => activeSpaces[parseInt(k, 10)] === windowId)
            .map(k => parseInt(k, 10));

        if (closingSpaceIds.length === 0) return;

        // Fetch all remaining open windows with their tabs
        const remainingWindows = await chrome.windows.getAll({ populate: true });

        // Collect window IDs already claiming other active spaces to preserve 1-to-1 binding
        const otherClaimedWindowIds = new Set<number>(
            Object.entries(activeSpaces)
                .filter(([sId]) => !closingSpaceIds.includes(parseInt(sId, 10)))
                .map(([_, wId]) => wId as number)
        );

        let modified = false;

        for (const spaceId of closingSpaceIds) {
            // Check if space has saved tabs in IndexedDB
            const spaceTabs = await db.tabs.where('spaceId').equals(spaceId).toArray();
            const spaceUrls = spaceTabs
                .map(t => t.url)
                .filter(u => u && !u.startsWith('chrome://') && !u.startsWith('chrome-extension://') && !u.startsWith('about:'));

            let candidateWindowId: number | null = null;

            if (spaceUrls.length > 0) {
                // Search remaining unclaimed windows for a matching footprint (>= 85% coverage)
                for (const win of remainingWindows) {
                    if (!win.id || win.id === windowId || otherClaimedWindowIds.has(win.id) || !win.tabs || win.tabs.length === 0) {
                        continue;
                    }

                    const winUrls = win.tabs
                        .map(t => t.url || '')
                        .filter(u => u && !u.startsWith('chrome://') && !u.startsWith('chrome-extension://') && !u.startsWith('about:'));

                    if (winUrls.length === 0) continue;

                    let matchCount = 0;
                    for (const wUrl of winUrls) {
                        if (spaceUrls.some(sUrl => isFuzzyMatch(sUrl, wUrl))) {
                            matchCount++;
                        }
                    }

                    const spaceCoverage = matchCount / spaceUrls.length;
                    if (spaceCoverage >= 0.85) {
                        candidateWindowId = win.id;
                        otherClaimedWindowIds.add(win.id);
                        break;
                    }
                }
            }

            if (candidateWindowId !== null) {
                activeSpaces[spaceId] = candidateWindowId;
                modified = true;
                console.log(`Background Sync: Window ${windowId} closed, but re-bound Space ${spaceId} to Window ${candidateWindowId} matching footprint.`);
            } else {
                delete activeSpaces[spaceId];
                modified = true;
                console.log(`Background Sync: Unregistered Space ${spaceId} on Window ${windowId} closure (no matching window found).`);
            }
        }

        if (modified) {
            await chrome.storage.session.set({ activeSpaces });
        }
    } catch (e) {
        console.error('Background Sync: Failed to clean up window map', e);
    }
});

// --- Context Menus & Action Ingestion (Context Menu & Global Hotkey) ---

const READ_LATER_MENU_ID = 'tabbellus-read-later';
const ACTION_CAPTURE_WINDOW_ID = 'action-capture-window';
const ACTION_SAVE_READ_LATER_ID = 'action-save-read-later';

const setupContextMenus = () => {
    chrome.contextMenus.removeAll(() => {
        const shortcut = getReadLaterShortcutText();
        const title = shortcut ? `Save to TabBellus Read Later (${shortcut})` : 'Save to TabBellus Read Later';

        // 1. Page/Link Context Menu for Read Later
        chrome.contextMenus.create({
            id: READ_LATER_MENU_ID,
            title,
            contexts: ['page', 'link']
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn('Background: Context menu creation notice (page/link):', chrome.runtime.lastError.message);
            } else {
                console.log('Background: Read Later page/link context menu registered successfully');
            }
        });

        // 2. Action Toolbar Context Menu: Capture Window as New Space
        chrome.contextMenus.create({
            id: ACTION_CAPTURE_WINDOW_ID,
            title: 'Capture Window as New Space',
            contexts: ['action']
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn('Background: Context menu creation notice (action-capture-window):', chrome.runtime.lastError.message);
            } else {
                console.log('Background: Action capture-window context menu registered successfully');
            }
        });

        // 3. Action Toolbar Context Menu: Save Active Tab to Read Later
        chrome.contextMenus.create({
            id: ACTION_SAVE_READ_LATER_ID,
            title: 'Save Active Tab to Read Later',
            contexts: ['action']
        }, () => {
            if (chrome.runtime.lastError) {
                console.warn('Background: Context menu creation notice (action-save-read-later):', chrome.runtime.lastError.message);
            } else {
                console.log('Background: Action save-read-later context menu registered successfully');
            }
        });
    });
};

let badgeTimer: ReturnType<typeof setTimeout> | null = null;

const flashActionBadge = async (text: string, color: string, tabId?: number) => {
    try {
        if (badgeTimer) {
            clearTimeout(badgeTimer);
            badgeTimer = null;
        }

        await chrome.action.setBadgeBackgroundColor({ color, tabId });
        await chrome.action.setBadgeText({ text, tabId });

        badgeTimer = setTimeout(async () => {
            try {
                await chrome.action.setBadgeText({ text: '', tabId });
            } catch {
                // Tab or window may have closed
            }
            badgeTimer = null;
        }, 2000);
    } catch (e) {
        console.warn('Background ReadLater: Failed to update action badge:', e);
    }
};

const isInternalUrl = (url?: string): boolean => {
    if (!url) return true;
    return (
        url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('file://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('view-source:') ||
        url.startsWith('javascript:')
    );
};

const saveUrlToReadLater = async (payload: { url?: string; title?: string; favIconUrl?: string; tabId?: number }) => {
    const { url, title, favIconUrl, tabId } = payload;
    if (!url || isInternalUrl(url)) {
        console.warn('Background ReadLater: Skipped internal or invalid URL:', url);
        await flashActionBadge('✕', '#ef4444', tabId);
        return;
    }

    try {
        await readLaterService.addFromTab({
            url,
            title: title || url,
            favIconUrl
        });
        console.log('Background ReadLater: Successfully captured item:', url);
        await flashActionBadge('✓', '#22c55e', tabId);
    } catch (err: unknown) {
        const error = err as { name?: string; message?: string };
        if (error?.name === 'DuplicateReadLaterError' || error?.message?.includes('already in Read Later')) {
            console.log('Background ReadLater: Item already in queue:', url);
            await flashActionBadge('!', '#f59e0b', tabId);
        } else {
            console.error('Background ReadLater: Failed to capture item:', err);
            await flashActionBadge('✕', '#ef4444', tabId);
        }
    }
};

// Context Menu Click Listener
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === READ_LATER_MENU_ID || info.menuItemId === 'tabbellus-save-read-later') {
        if (info.linkUrl) {
            // User right-clicked a link on a page
            await saveUrlToReadLater({
                url: info.linkUrl,
                title: info.selectionText || info.linkUrl,
                favIconUrl: tab?.favIconUrl,
                tabId: tab?.id
            });
        } else {
            // User right-clicked anywhere on the page
            const targetUrl = info.pageUrl || tab?.url;
            const targetTitle = tab?.title || targetUrl;
            await saveUrlToReadLater({
                url: targetUrl,
                title: targetTitle,
                favIconUrl: tab?.favIconUrl,
                tabId: tab?.id
            });
        }
    } else if (info.menuItemId === ACTION_SAVE_READ_LATER_ID) {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const targetTab = activeTab || tab;
            await saveUrlToReadLater({
                url: targetTab?.url,
                title: targetTab?.title,
                favIconUrl: targetTab?.favIconUrl,
                tabId: targetTab?.id
            });
        } catch (err) {
            console.error('Background ActionMenu: Failed to save active tab to read later:', err);
            await flashActionBadge('✕', '#ef4444', tab?.id);
        }
    } else if (info.menuItemId === ACTION_CAPTURE_WINDOW_ID) {
        try {
            const fallbackName = `Captured Window (${new Date().toLocaleTimeString()})`;
            await spaceService.captureCurrentWindow(fallbackName);
            console.log('Background ActionMenu: Successfully captured window as new space');
            await flashActionBadge('✓', '#3b82f6', tab?.id);
        } catch (err) {
            console.error('Background ActionMenu: Failed to capture window as space:', err);
            await flashActionBadge('✕', '#ef4444', tab?.id);
        }
    }
});

// Global Keyboard Shortcut Command Listener
chrome.commands.onCommand.addListener(async (command) => {
    console.log('Background command dispatched:', command);
    if (command === 'save-to-read-later') {
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.url) {
                await saveUrlToReadLater({
                    url: activeTab.url,
                    title: activeTab.title,
                    favIconUrl: activeTab.favIconUrl,
                    tabId: activeTab.id
                });
            }
        } catch (err) {
            console.error('Background ReadLater: Error executing hotkey command:', err);
        }
    }
});
