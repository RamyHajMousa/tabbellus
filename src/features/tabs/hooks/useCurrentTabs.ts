import { useState, useEffect } from 'react';

export function useCurrentTabs() {
    const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
    const [activeTabId, setActiveTabId] = useState<number | null>(null);

    useEffect(() => {
        // Initial fetch
        const fetchTabs = async () => {
            try {
                const currentTabs = await chrome.tabs.query({ currentWindow: true });
                setTabs(currentTabs);
                const active = currentTabs.find(t => t.active);
                if (active && active.id) setActiveTabId(active.id);
            } catch (e) {
                console.warn('Failed to fetch tabs:', e);
            }
        };

        fetchTabs();

        // Listeners for real-time updates
        const onCreated = (tab: chrome.tabs.Tab) => {
            setTabs(prev => {
                if (prev.some(t => t.id === tab.id)) return prev;
                return [...prev, tab];
            });
        };

        const onRemoved = (tabId: number) => {
            setTabs(prev => prev.filter(t => t.id !== tabId));
        };

        const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            // Filter: Only update if relevant properties changed
            if (changeInfo.status || changeInfo.title || changeInfo.favIconUrl) {
                setTabs(prev => prev.map(t => (t.id === tabId ? tab : t)));
            }
        };

        const onMoved = async () => {
            // For move/reorder, re-fetch the entire list to ensure correct index order
            const sortedTabs = await chrome.tabs.query({ currentWindow: true });
            setTabs(sortedTabs);
        };

        const onActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
            setActiveTabId(activeInfo.tabId);
            // Optionally update the active status in the list if we were tracking it there too,
            // but for simple highlighting, `activeTabId` state is enough.
            // However, chrome.tabs.query keeps 'active' property, so let's update that to be safe.
            setTabs(prev => prev.map(t => ({ ...t, active: t.id === activeInfo.tabId })));
        };

        chrome.tabs.onCreated.addListener(onCreated);
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onRemoved.addListener(onRemoved);
        chrome.tabs.onMoved.addListener(onMoved);
        chrome.tabs.onActivated.addListener(onActivated);
        // Also listen to onDetached/onAttached if tabs move between windows? 
        // For "currentWindow: true", if a tab is detached it is removed from this window. onDetached -> onRemoved.
        // If attached, onAttached -> onCreated (effectively). 
        // Actually onAttached fires after... let's stick to onCreated/onRemoved for window moves for now.

        return () => {
            chrome.tabs.onCreated.removeListener(onCreated);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            chrome.tabs.onMoved.removeListener(onMoved);
            chrome.tabs.onActivated.removeListener(onActivated);
        };
    }, []);

    return { tabs, activeTabId };
}
