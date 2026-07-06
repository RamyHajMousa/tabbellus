import { useMemo } from 'react';
import { useWindowId } from './useWindowId';
import { useTabLifecycle } from './useTabLifecycle';
import { useGroupLifecycle } from './useGroupLifecycle';

/**
 * Composition hook — thin layer over the decomposed micro-hooks.
 *
 * Returns the same API as before:
 *   { tabs, setTabs, groups, activeTabId }
 *
 * Internally delegates to:
 *   useWindowId()          — resolves current window ID
 *   useTabLifecycle(id)    — chrome.tabs.* listeners + tab state
 *   useGroupLifecycle(id)  — chrome.tabGroups.* listeners + group Map
 *
 * activeTabId is derived from the tabs array (the tab with `active === true`)
 * rather than maintained via a separate listener, avoiding redundant event
 * subscriptions.
 */
export function useCurrentTabs() {
    const windowId = useWindowId();
    const { tabs, setTabs } = useTabLifecycle(windowId);
    const groups = useGroupLifecycle(windowId);

    const activeTabId = useMemo(() => {
        const active = tabs.find(t => t.active);
        return active?.id ?? null;
    }, [tabs]);

    return { tabs, setTabs, groups, activeTabId };
}
