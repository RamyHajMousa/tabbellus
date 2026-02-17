import { useState, useEffect } from 'react';

export function useCurrentTabs() {
    const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
    const [groups, setGroups] = useState<Map<number, chrome.tabGroups.TabGroup>>(new Map());
    const [activeTabId, setActiveTabId] = useState<number | null>(null);

    useEffect(() => {
        let mounted = true;

        // Listener references
        let onTabCreated: (tab: chrome.tabs.Tab) => void;
        let onTabUpdated: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void;
        let onTabRemoved: (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void;
        let onTabMoved: (tabId: number, moveInfo: chrome.tabs.TabMoveInfo) => void;
        let onTabActivated: (activeInfo: chrome.tabs.TabActiveInfo) => void;
        let onTabAttached: (tabId: number, attachInfo: chrome.tabs.TabAttachInfo) => void;
        let onTabDetached: (tabId: number, detachInfo: chrome.tabs.TabDetachInfo) => void;

        let onGroupCreated: (group: chrome.tabGroups.TabGroup) => void;
        let onGroupUpdated: (group: chrome.tabGroups.TabGroup) => void;
        let onGroupRemoved: (group: chrome.tabGroups.TabGroup) => void;

        const init = async () => {
            try {
                // 1. Get Current Window ID securely
                const win = await chrome.windows.getCurrent();
                const currentWindowId = win.id;

                if (currentWindowId === undefined || !mounted) return;

                // 2. Initial Fetch (Strictly Scoped)
                const currentFnOption = { windowId: currentWindowId };

                // Fetch Tabs
                const currentTabs = await chrome.tabs.query(currentFnOption);
                if (mounted) {
                    setTabs(currentTabs);
                    const active = currentTabs.find(t => t.active);
                    if (active && active.id) setActiveTabId(active.id);
                }

                // Fetch Groups
                if (chrome.tabGroups) {
                    const currentGroups = await chrome.tabGroups.query({ windowId: currentWindowId });
                    if (mounted) {
                        const groupMap = new Map();
                        currentGroups.forEach(g => groupMap.set(g.id, g));
                        setGroups(groupMap);
                    }
                }

                // 3. Define Listeners (Strictly Scoped via Closure)

                // --- Tab Listeners ---
                onTabCreated = (tab) => {
                    if (tab.windowId !== currentWindowId) return;
                    setTabs(prev => {
                        if (prev.some(t => t.id === tab.id)) return prev;
                        return [...prev, tab];
                    });
                };

                onTabUpdated = (tabId, changeInfo, tab) => {
                    if (tab.windowId !== currentWindowId) return;
                    // Intentionally check strict/shallow updates prevents over-rendering
                    if (changeInfo.status || changeInfo.title || changeInfo.favIconUrl || changeInfo.groupId || changeInfo.pinned || changeInfo.audible) {
                        setTabs(prev => prev.map(t => (t.id === tabId ? tab : t)));
                    }
                };

                onTabRemoved = (tabId, removeInfo) => {
                    if (removeInfo.windowId !== currentWindowId) return;
                    setTabs(prev => prev.filter(t => t.id !== tabId));
                };

                onTabMoved = async (_tabId, moveInfo) => {
                    if (moveInfo.windowId !== currentWindowId) return;
                    // Re-fetch to guarantee correct order index
                    const sortedTabs = await chrome.tabs.query({ windowId: currentWindowId });
                    if (mounted) setTabs(sortedTabs);
                };

                onTabActivated = (activeInfo) => {
                    if (activeInfo.windowId !== currentWindowId) return;
                    setActiveTabId(activeInfo.tabId);
                    setTabs(prev => prev.map(t => ({ ...t, active: t.id === activeInfo.tabId })));
                };

                onTabAttached = async (_tabId, attachInfo) => {
                    if (attachInfo.newWindowId !== currentWindowId) return;
                    // Tab moved INTO this window. Fetch it or re-fetch all to ensure order.
                    // Re-fetching all is safer to respect the new index.
                    const sortedTabs = await chrome.tabs.query({ windowId: currentWindowId });
                    if (mounted) setTabs(sortedTabs);
                };

                onTabDetached = (tabId, detachInfo) => {
                    if (detachInfo.oldWindowId !== currentWindowId) return;
                    // Tab moved OUT of this window.
                    setTabs(prev => prev.filter(t => t.id !== tabId));
                };

                // --- Group Listeners ---
                if (chrome.tabGroups) {
                    onGroupCreated = (group) => {
                        if (group.windowId !== currentWindowId) return;
                        setGroups(prev => new Map(prev).set(group.id, group));
                    };

                    onGroupUpdated = (group) => {
                        if (group.windowId !== currentWindowId) return;
                        setGroups(prev => new Map(prev).set(group.id, group));
                    };

                    onGroupRemoved = (group) => {
                        // Note: chrome.tabGroups.onRemoved passes the group object (with windowId) in modern Chrome
                        if (group.windowId !== currentWindowId) return;
                        setGroups(prev => {
                            const next = new Map(prev);
                            next.delete(group.id);
                            return next;
                        });
                    };

                    chrome.tabGroups.onCreated.addListener(onGroupCreated);
                    chrome.tabGroups.onUpdated.addListener(onGroupUpdated);
                    chrome.tabGroups.onRemoved.addListener(onGroupRemoved);
                }

                // Register Tab Listeners
                chrome.tabs.onCreated.addListener(onTabCreated);
                chrome.tabs.onUpdated.addListener(onTabUpdated);
                chrome.tabs.onRemoved.addListener(onTabRemoved);
                chrome.tabs.onMoved.addListener(onTabMoved);
                chrome.tabs.onActivated.addListener(onTabActivated);
                chrome.tabs.onAttached.addListener(onTabAttached);
                chrome.tabs.onDetached.addListener(onTabDetached);

            } catch (e) {
                console.warn('Failed to initialize useCurrentTabs:', e);
            }
        };

        // Ignite
        init();

        // Cleanup
        return () => {
            mounted = false;

            if (onTabCreated) chrome.tabs.onCreated.removeListener(onTabCreated);
            if (onTabUpdated) chrome.tabs.onUpdated.removeListener(onTabUpdated);
            if (onTabRemoved) chrome.tabs.onRemoved.removeListener(onTabRemoved);
            if (onTabMoved) chrome.tabs.onMoved.removeListener(onTabMoved);
            if (onTabActivated) chrome.tabs.onActivated.removeListener(onTabActivated);
            if (onTabAttached) chrome.tabs.onAttached.removeListener(onTabAttached);
            if (onTabDetached) chrome.tabs.onDetached.removeListener(onTabDetached);

            if (chrome.tabGroups) {
                if (onGroupCreated) chrome.tabGroups.onCreated.removeListener(onGroupCreated);
                if (onGroupUpdated) chrome.tabGroups.onUpdated.removeListener(onGroupUpdated);
                if (onGroupRemoved) chrome.tabGroups.onRemoved.removeListener(onGroupRemoved);
            }
        };
    }, []);

    return { tabs, groups, activeTabId };
}
