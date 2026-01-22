import { useState, useEffect } from 'react';

export function useCurrentTabs() {
    const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
    const [groups, setGroups] = useState<Map<number, chrome.tabGroups.TabGroup>>(new Map());
    const [activeTabId, setActiveTabId] = useState<number | null>(null);

    useEffect(() => {
        // Initial fetch
        const fetchAll = async () => {
            try {
                const currentFnOption = { currentWindow: true };

                // Fetch Tabs
                const currentTabs = await chrome.tabs.query(currentFnOption);
                setTabs(currentTabs);

                // Fetch Groups
                const currentGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
                const groupMap = new Map();
                currentGroups.forEach(g => groupMap.set(g.id, g));
                setGroups(groupMap);

                // Set Active
                const active = currentTabs.find(t => t.active);
                if (active && active.id) setActiveTabId(active.id);
            } catch (e) {
                console.warn('Failed to fetch tabs/groups:', e);
            }
        };

        fetchAll();

        // --- Tab Listeners ---
        const onTabCreated = (tab: chrome.tabs.Tab) => {
            setTabs(prev => {
                if (prev.some(t => t.id === tab.id)) return prev;
                return [...prev, tab];
            });
        };

        const onTabRemoved = (tabId: number) => {
            setTabs(prev => prev.filter(t => t.id !== tabId));
        };

        const onTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            if (changeInfo.status || changeInfo.title || changeInfo.favIconUrl || changeInfo.groupId) {
                setTabs(prev => prev.map(t => (t.id === tabId ? tab : t)));
            }
        };

        const onTabMoved = async () => {
            const sortedTabs = await chrome.tabs.query({ currentWindow: true });
            setTabs(sortedTabs);
        };

        const onTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
            setActiveTabId(activeInfo.tabId);
            setTabs(prev => prev.map(t => ({ ...t, active: t.id === activeInfo.tabId })));
        };

        // --- Group Listeners ---
        const onGroupCreated = (group: chrome.tabGroups.TabGroup) => {
            if (group.windowId !== chrome.windows.WINDOW_ID_CURRENT) return; // Although Query is constrained, listeners might fire globally? No, but let's be safe if possible, or filter at render. Actually listeners are global.
            // Just update our map.
            setGroups(prev => new Map(prev).set(group.id, group));
        };

        const onGroupRemoved = (groupId: chrome.tabGroups.TabGroup) => {
            // Note: Listener signature varies, check docs. 
            // chrome.tabGroups.onRemoved.addListener(callback: (group: TabGroup) => void) in Types? 
            // Actually it passes the group object.
            setGroups(prev => {
                const next = new Map(prev);
                next.delete(groupId.id);
                return next;
            });
        };

        const onGroupUpdated = (group: chrome.tabGroups.TabGroup) => {
            setGroups(prev => new Map(prev).set(group.id, group));
        };

        // Register
        chrome.tabs.onCreated.addListener(onTabCreated);
        chrome.tabs.onUpdated.addListener(onTabUpdated);
        chrome.tabs.onRemoved.addListener(onTabRemoved);
        chrome.tabs.onMoved.addListener(onTabMoved);
        chrome.tabs.onActivated.addListener(onTabActivated);

        if (chrome.tabGroups) {
            chrome.tabGroups.onCreated.addListener(onGroupCreated);
            chrome.tabGroups.onUpdated.addListener(onGroupUpdated);
            chrome.tabGroups.onRemoved.addListener(onGroupRemoved);
        }

        return () => {
            chrome.tabs.onCreated.removeListener(onTabCreated);
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
            chrome.tabs.onRemoved.removeListener(onTabRemoved);
            chrome.tabs.onMoved.removeListener(onTabMoved);
            chrome.tabs.onActivated.removeListener(onTabActivated);

            if (chrome.tabGroups) {
                chrome.tabGroups.onCreated.removeListener(onGroupCreated);
                chrome.tabGroups.onUpdated.removeListener(onGroupUpdated);
                chrome.tabGroups.onRemoved.removeListener(onGroupRemoved);
            }
        };
    }, []);

    return { tabs, groups, activeTabId };
}
