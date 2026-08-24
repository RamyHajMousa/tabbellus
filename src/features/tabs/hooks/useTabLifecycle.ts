import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

/**
 * Manages Chrome tab state for a specific window.
 * Owns chrome.tabs.* listeners, debounced refresh, and index-sorted tab array.
 *
 * @param windowId  The window to scope listeners to. Skips setup when undefined.
 * @returns `tabs` array (sorted by index), `setTabs` for optimistic updates.
 */
export function useTabLifecycle(
    windowId: number | undefined
): { tabs: chrome.tabs.Tab[]; setTabs: Dispatch<SetStateAction<chrome.tabs.Tab[]>> } {
    const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);

    useEffect(() => {
        if (windowId === undefined) return;

        let mounted = true;
        let fetchTimeout: NodeJS.Timeout;

        const triggerTabsRefresh = () => {
            if (fetchTimeout) clearTimeout(fetchTimeout);
            fetchTimeout = setTimeout(async () => {
                if (!mounted) return;
                try {
                    const sortedTabs = await chrome.tabs.query({ windowId });
                    if (mounted) {
                        setTabs(sortedTabs.sort((a, b) => a.index - b.index));
                    }
                } catch (e) {
                    console.warn('Failed to refresh tabs:', e);
                }
            }, 50);
        };

        // Initial fetch
        chrome.tabs.query({ windowId }).then(currentTabs => {
            if (mounted) {
                setTabs(currentTabs.sort((a, b) => a.index - b.index));
            }
        }).catch(e => {
            console.warn('Failed initial tab fetch:', e);
        });

        // --- Listeners (strictly scoped via closure) ---
        const onTabCreated = (tab: chrome.tabs.Tab) => {
            if (tab.windowId !== windowId) return;
            triggerTabsRefresh();
        };

        const onTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            if (tab.windowId !== windowId) return;
            // Strict property check to avoid redundant re-renders while ensuring all relevant tab updates (including URL & status) are captured
            if (
                changeInfo.status !== undefined ||
                changeInfo.title !== undefined ||
                changeInfo.favIconUrl !== undefined ||
                changeInfo.url !== undefined ||
                changeInfo.groupId !== undefined ||
                changeInfo.pinned !== undefined ||
                changeInfo.audible !== undefined ||
                changeInfo.mutedInfo !== undefined ||
                changeInfo.discarded !== undefined
            ) {
                // Guarantee tab state updates extract status and all properties directly from the full tab record
                setTabs(prev => prev.map(t => (t.id === _tabId ? tab : t)).sort((a, b) => a.index - b.index));
            }
        };

        const onTabRemoved = (_tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => {
            if (removeInfo.windowId !== windowId) return;
            triggerTabsRefresh();
        };

        const onTabMoved = (_tabId: number, moveInfo: chrome.tabs.TabMoveInfo) => {
            if (moveInfo.windowId !== windowId) return;
            triggerTabsRefresh();
        };

        const onTabActivated = async (activeInfo: chrome.tabs.TabActiveInfo) => {
            if (activeInfo.windowId !== windowId) return;
            // Optimistically update active flag
            setTabs(prev => prev.map(t => ({ ...t, active: t.id === activeInfo.tabId })).sort((a, b) => a.index - b.index));
            // Reconcile fresh tab record (including status) to resolve background loading transitions
            try {
                const freshTab = await chrome.tabs.get(activeInfo.tabId);
                if (mounted && freshTab.windowId === windowId) {
                    setTabs(prev => prev.map(t => (t.id === freshTab.id ? freshTab : t)).sort((a, b) => a.index - b.index));
                }
            } catch (e) {
                // Tab may have closed or query failed
            }
        };

        const onTabAttached = (_tabId: number, attachInfo: chrome.tabs.TabAttachInfo) => {
            if (attachInfo.newWindowId !== windowId) return;
            triggerTabsRefresh();
        };

        const onTabDetached = (_tabId: number, detachInfo: chrome.tabs.TabDetachInfo) => {
            if (detachInfo.oldWindowId !== windowId) return;
            triggerTabsRefresh();
        };

        const onTabReplaced = async (addedTabId: number, _removedTabId: number) => {
            try {
                const newTab = await chrome.tabs.get(addedTabId);
                if (mounted && newTab.windowId === windowId) {
                    triggerTabsRefresh();
                }
            } catch (e) {
                console.warn('Failed to handle tab replacement:', e);
            }
        };

        // Register
        chrome.tabs.onCreated.addListener(onTabCreated);
        chrome.tabs.onUpdated.addListener(onTabUpdated);
        chrome.tabs.onRemoved.addListener(onTabRemoved);
        chrome.tabs.onMoved.addListener(onTabMoved);
        chrome.tabs.onActivated.addListener(onTabActivated);
        chrome.tabs.onAttached.addListener(onTabAttached);
        chrome.tabs.onDetached.addListener(onTabDetached);
        chrome.tabs.onReplaced.addListener(onTabReplaced);

        // Cleanup
        return () => {
            mounted = false;
            if (fetchTimeout) clearTimeout(fetchTimeout);

            chrome.tabs.onCreated.removeListener(onTabCreated);
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
            chrome.tabs.onRemoved.removeListener(onTabRemoved);
            chrome.tabs.onMoved.removeListener(onTabMoved);
            chrome.tabs.onActivated.removeListener(onTabActivated);
            chrome.tabs.onAttached.removeListener(onTabAttached);
            chrome.tabs.onDetached.removeListener(onTabDetached);
            chrome.tabs.onReplaced.removeListener(onTabReplaced);
        };
    }, [windowId]);

    return { tabs, setTabs };
}
