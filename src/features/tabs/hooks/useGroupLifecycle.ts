import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toaster';

/**
 * Manages Chrome Tab Group state for a specific window.
 * Owns chrome.tabGroups.* listeners and a Map of group ID → TabGroup.
 *
 * @param windowId  The window to scope listeners to. Skips setup when undefined.
 * @returns Map of group ID → TabGroup metadata and helper toggle action.
 */
export function useGroupLifecycle(
    windowId: number | undefined
): {
    groups: Map<number, chrome.tabGroups.TabGroup>;
    toggleAllGroupsCollapse: (collapse: boolean) => Promise<void>;
} {
    const [groups, setGroups] = useState<Map<number, chrome.tabGroups.TabGroup>>(new Map());
    const { toast } = useToast();

    useEffect(() => {
        if (windowId === undefined || !chrome.tabGroups) return;

        let mounted = true;

        // Initial fetch
        chrome.tabGroups.query({ windowId }).then(currentGroups => {
            if (mounted) {
                const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
                currentGroups.forEach(g => groupMap.set(g.id, g));
                setGroups(groupMap);
            }
        }).catch(e => {
            console.warn('Failed initial group fetch:', e);
        });

        // --- Listeners (strictly scoped via closure) ---
        const onGroupCreated = (group: chrome.tabGroups.TabGroup) => {
            if (group.windowId !== windowId) return;
            setGroups(prev => new Map(prev).set(group.id, group));
        };

        const onGroupUpdated = (group: chrome.tabGroups.TabGroup) => {
            if (group.windowId !== windowId) return;
            setGroups(prev => new Map(prev).set(group.id, group));
        };

        const onGroupRemoved = (group: chrome.tabGroups.TabGroup) => {
            // Note: chrome.tabGroups.onRemoved passes the group object (with windowId) in modern Chrome
            if (group.windowId !== windowId) return;
            setGroups(prev => {
                const next = new Map(prev);
                next.delete(group.id);
                return next;
            });
        };

        const onGroupMoved = (group: chrome.tabGroups.TabGroup) => {
            if (group.windowId !== windowId) return;
            setGroups(prev => new Map(prev).set(group.id, group));
        };

        // Register
        chrome.tabGroups.onCreated.addListener(onGroupCreated);
        chrome.tabGroups.onUpdated.addListener(onGroupUpdated);
        chrome.tabGroups.onRemoved.addListener(onGroupRemoved);
        if (chrome.tabGroups.onMoved) {
            chrome.tabGroups.onMoved.addListener(onGroupMoved);
        }

        // Cleanup
        return () => {
            mounted = false;
            chrome.tabGroups.onCreated.removeListener(onGroupCreated);
            chrome.tabGroups.onUpdated.removeListener(onGroupUpdated);
            chrome.tabGroups.onRemoved.removeListener(onGroupRemoved);
            if (chrome.tabGroups.onMoved) {
                chrome.tabGroups.onMoved.removeListener(onGroupMoved);
            }
        };
    }, [windowId]);

    const toggleAllGroupsCollapse = useCallback(async (collapse: boolean) => {
        if (windowId === undefined || !chrome.tabGroups) return;
        try {
            const windowGroups = await chrome.tabGroups.query({ windowId });
            if (windowGroups.length === 0) return;

            await Promise.all(
                windowGroups.map(g =>
                    chrome.tabGroups.update(g.id, { collapsed: collapse }).catch(err => {
                        console.warn(`Failed to update group ${g.id}:`, err);
                    })
                )
            );
        } catch (err) {
            console.error('Failed to toggle all tab groups collapse state:', err);
            toast('Failed to toggle group collapse states', {
                description: err instanceof Error ? err.message : 'Chrome tab group update rejected.',
            });
        }
    }, [windowId, toast]);

    return { groups, toggleAllGroupsCollapse };
}
