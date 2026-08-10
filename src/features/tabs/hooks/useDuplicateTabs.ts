import { useMemo, useCallback } from 'react';
import { tabService } from '@/lib/tabService';
import { useToast } from '@/components/ui/Toaster';

export function useDuplicateTabs(tabs: chrome.tabs.Tab[]) {
    const { toast } = useToast();

    const { duplicates, duplicateTabIds } = useMemo(() => {
        const { duplicates: duplicateTabs } = tabService.calculateDuplicates(tabs);
        const ids = new Set<number>();
        for (const tab of duplicateTabs) {
            if (tab.id !== undefined) {
                ids.add(tab.id);
            }
        }
        return { duplicates: duplicateTabs, duplicateTabIds: ids };
    }, [tabs]);

    const duplicateCount = duplicates.length;

    const deduplicate = useCallback(async () => {
        if (duplicates.length === 0) return;

        // Snapshot metadata for all eviction targets
        const snapshot = duplicates.map(t => ({
            id: t.id,
            url: t.url,
            title: t.title,
            index: t.index,
            windowId: t.windowId,
            groupId: t.groupId,
            pinned: t.pinned
        }));

        const idsToRemove = snapshot.map(t => t.id).filter((id): id is number => id !== undefined);

        try {
            await chrome.tabs.remove(idsToRemove);

            toast(`Closed ${snapshot.length} duplicate tab${snapshot.length === 1 ? '' : 's'}`, {
                duration: 5000,
                onUndo: async () => {
                    try {
                        for (const tab of snapshot) {
                            if (!tab.url) continue;
                            const newTab = await chrome.tabs.create({ 
                                url: tab.url, 
                                active: false,
                                index: tab.index,
                                pinned: tab.pinned,
                                windowId: tab.windowId
                            });

                            if (newTab.id !== undefined && tab.groupId !== undefined && tab.groupId !== -1) {
                                // Try to rejoin the original group if it still exists
                                try {
                                    await chrome.tabs.group({ tabIds: [newTab.id], groupId: tab.groupId });
                                } catch (groupErr) {
                                    console.warn('Could not restore tab to group, it may have been closed:', groupErr);
                                    // If group doesn't exist, we might want to just leave it ungrouped.
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Failed to undo deduplication:', err);
                    }
                }
            });
        } catch (err) {
            console.error('Failed to deduplicate tabs:', err);
            toast('Failed to close duplicate tabs', {
                description: 'An error occurred while removing tabs.'
            });
        }
    }, [duplicates, toast]);

    return {
        duplicateTabs: duplicates,
        duplicateTabIds,
        duplicateCount,
        deduplicate
    };
}
