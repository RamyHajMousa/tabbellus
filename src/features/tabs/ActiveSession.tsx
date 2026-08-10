import { useState, useMemo, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { spaceService, getRecentSessionId, readLaterService, DuplicateReadLaterError } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Save, Ghost } from 'lucide-react';
import { useCurrentTabs } from './hooks/useCurrentTabs';
import { useCurrentSpace } from '@/hooks/useCurrentSpace';
import { useDuplicateTabs } from './hooks/useDuplicateTabs';
import { type VirtualRow, type TabDragPayload, type GroupDragPayload } from './types';
import { ActiveToolbar } from './components/ActiveToolbar';
import { DraggableTabItem } from './components/dnd/DraggableTabItem';
import { DraggableGroupHeader } from './components/dnd/DraggableGroupHeader';

export type { VirtualRow, TabDragPayload, GroupDragPayload };

// ── ActiveSession Component ──────────────────────────────────────────────

export const ActiveSession = () => {
    const { tabs, setTabs, groups, activeTabId } = useCurrentTabs();
    const currentSpace = useCurrentSpace();
    const [spaceName, setSpaceName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [draggingGroupId, setDraggingGroupId] = useState<number | null>(null);
    const { toast } = useToast();

    const { duplicateTabIds, duplicateCount, deduplicate } = useDuplicateTabs(tabs);

    // ── 1D Topology Flattening for Virtuoso ──────────────────────────────────
    const flatList = useMemo<VirtualRow[]>(() => {
        const result: VirtualRow[] = [];
        const processedGroups = new Set<number>();

        const groupTabsMap = new Map<number, chrome.tabs.Tab[]>();
        tabs.forEach(t => {
            if (t.groupId !== -1) {
                if (!groupTabsMap.has(t.groupId)) groupTabsMap.set(t.groupId, []);
                groupTabsMap.get(t.groupId)!.push(t);
            }
        });

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            if (tab.groupId === -1) {
                result.push({
                    type: 'tab',
                    tab,
                    globalIndex: i,
                    isDuplicate: duplicateTabIds.has(tab.id!),
                });
            } else {
                if (!processedGroups.has(tab.groupId)) {
                    processedGroups.add(tab.groupId);
                    const group = groups.get(tab.groupId);
                    const groupTabs = groupTabsMap.get(tab.groupId) || [];
                    if (group) {
                        result.push({
                            type: 'group-header',
                            group,
                            tabs: groupTabs,
                        });
                    }
                }

                const group = groups.get(tab.groupId);
                if (!group?.collapsed) {
                    result.push({
                        type: 'tab',
                        tab,
                        globalIndex: i,
                        inGroup: true,
                        color: group?.color,
                        isDuplicate: duplicateTabIds.has(tab.id!),
                    });
                }
            }
        }
        return result;
    }, [tabs, groups]);

    // ── Drag & Drop Handlers ─────────────────────────────────────────────────

    const handleDropTab = useCallback(
        async (
            source: TabDragPayload,
            target: TabDragPayload,
            edge: Edge | null
        ) => {
            if (source.tabId === target.tabId) return;

            // ── Tab-to-Tab Grouping (Center Hit) ─────────────────────────────────
            if (edge === null) {
                try {
                    if (target.groupId === -1 || target.groupId === undefined) {
                        // Ungrouped target: group source and target tabs together into a new group
                        const newGroupId = await chrome.tabs.group({
                            tabIds: [source.tabId, target.tabId],
                        });
                        setTabs(prev =>
                            prev.map(t =>
                                t.id === source.tabId || t.id === target.tabId
                                    ? { ...t, groupId: newGroupId }
                                    : t
                            )
                        );
                    } else {
                        // Grouped target: add source tab into target's group
                        await chrome.tabs.group({
                            tabIds: [source.tabId],
                            groupId: target.groupId,
                        });
                        setTabs(prev =>
                            prev.map(t =>
                                t.id === source.tabId
                                    ? { ...t, groupId: target.groupId }
                                    : t
                            )
                        );
                    }
                } catch (err) {
                    console.error('Failed to group tabs:', err);
                    toast('Failed to group tabs', {
                        description: 'Chrome rejected grouping these tabs.',
                    });
                }
                return;
            }

            // ── Tab Reordering / Positioning (Edge Hit) ──────────────────────────
            const pinnedCount = tabs.filter(t => t.pinned).length;

            let targetChromeIndex = target.chromeIndex;
            if (edge === 'bottom') {
                targetChromeIndex += 1;
            }

            if (source.chromeIndex < targetChromeIndex) {
                targetChromeIndex -= 1;
            }

            if (source.pinned) {
                targetChromeIndex = Math.min(Math.max(0, pinnedCount - 1), targetChromeIndex);
            } else {
                targetChromeIndex = Math.max(pinnedCount, targetChromeIndex);
            }

            const targetGroupId = target.groupId;

            // Optimistic UI Update
            setTabs(prev => {
                const next = [...prev];
                const fromIdx = next.findIndex(t => t.id === source.tabId);
                if (fromIdx === -1) return prev;

                const [moved] = next.splice(fromIdx, 1);
                moved.groupId = targetGroupId;
                
                let insertIdx = Math.max(0, Math.min(targetChromeIndex, next.length));
                next.splice(insertIdx, 0, moved);

                return next.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API Sync
            chrome.tabs.move(source.tabId, { index: targetChromeIndex }).catch(err => {
                console.warn('chrome.tabs.move failed:', err);
            });

            if (targetGroupId !== -1 && source.groupId !== targetGroupId) {
                chrome.tabs.group({ tabIds: source.tabId, groupId: targetGroupId }).catch(err => {
                    console.warn('chrome.tabs.group failed:', err);
                });
            } else if (targetGroupId === -1 && source.groupId !== -1) {
                chrome.tabs.ungroup(source.tabId).catch(err => {
                    console.warn('chrome.tabs.ungroup failed:', err);
                });
            }
        },
        [tabs, setTabs, toast]
    );

    const handleDropTabToGroup = useCallback(
        (
            source: TabDragPayload,
            targetGroup: chrome.tabGroups.TabGroup,
            groupTabs: chrome.tabs.Tab[],
            edge: Edge
        ) => {
            if (groupTabs.length === 0) return;

            const pinnedCount = tabs.filter(t => t.pinned).length;

            let targetChromeIndex: number;
            if (edge === 'top') {
                targetChromeIndex = groupTabs[0].index;
            } else {
                targetChromeIndex = groupTabs[groupTabs.length - 1].index + 1;
            }

            if (source.chromeIndex < targetChromeIndex) {
                targetChromeIndex -= 1;
            }

            if (source.pinned) {
                targetChromeIndex = Math.min(Math.max(0, pinnedCount - 1), targetChromeIndex);
            } else {
                targetChromeIndex = Math.max(pinnedCount, targetChromeIndex);
            }

            const targetGroupId = targetGroup.id;

            // Optimistic UI Update
            setTabs(prev => {
                const next = [...prev];
                const fromIdx = next.findIndex(t => t.id === source.tabId);
                if (fromIdx === -1) return prev;

                const [moved] = next.splice(fromIdx, 1);
                moved.groupId = targetGroupId;
                
                let insertIdx = Math.max(0, Math.min(targetChromeIndex, next.length));
                next.splice(insertIdx, 0, moved);

                return next.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API Sync
            chrome.tabs.move(source.tabId, { index: targetChromeIndex }).catch(err => {
                console.warn('chrome.tabs.move failed:', err);
            });

            if (source.groupId !== targetGroupId) {
                chrome.tabs.group({ tabIds: source.tabId, groupId: targetGroupId }).catch(err => {
                    console.warn('chrome.tabs.group failed:', err);
                });
            }
        },
        [tabs, setTabs]
    );

    const handleJoinGroup = useCallback(
        (
            sourceTab: TabDragPayload,
            targetGroup: chrome.tabGroups.TabGroup
        ) => {
            if (sourceTab.groupId === targetGroup.id) return;

            // Optimistic UI Update
            setTabs(prev => {
                return prev.map(t => (t.id === sourceTab.tabId ? { ...t, groupId: targetGroup.id } : t));
            });

            // Chrome API Sync
            chrome.tabs.group({ tabIds: sourceTab.tabId, groupId: targetGroup.id }).catch(err => {
                console.warn('chrome.tabs.group join failed:', err);
            });
        },
        [setTabs]
    );

    const handleDropGroup = useCallback(
        (
            sourceGroup: GroupDragPayload,
            targetGroup: chrome.tabGroups.TabGroup,
            targetGroupTabs: chrome.tabs.Tab[],
            edge: Edge
        ) => {
            if (sourceGroup.groupId === targetGroup.id) return;
            if (sourceGroup.tabIds.length === 0 || targetGroupTabs.length === 0) return;

            const pinnedCount = tabs.filter(t => t.pinned).length;

            let targetChromeIndex: number;
            if (edge === 'top') {
                targetChromeIndex = targetGroupTabs[0].index;
            } else {
                targetChromeIndex = targetGroupTabs[targetGroupTabs.length - 1].index + 1;
            }

            if (sourceGroup.fromMinIndex < targetChromeIndex) {
                targetChromeIndex -= sourceGroup.tabIds.length;
            }

            targetChromeIndex = Math.max(pinnedCount, targetChromeIndex);

            const groupTabSet = new Set(sourceGroup.tabIds);

            // Optimistic UI Update
            setTabs(prev => {
                const next = [...prev];
                const movedTabs: chrome.tabs.Tab[] = [];
                const remainingTabs = next.filter(t => {
                    if (groupTabSet.has(t.id!)) {
                        movedTabs.push(t);
                        return false;
                    }
                    return true;
                });

                let insertIdx = Math.max(0, Math.min(targetChromeIndex, remainingTabs.length));
                remainingTabs.splice(insertIdx, 0, ...movedTabs);

                return remainingTabs.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API Sync — use tabGroups.move to move the group atomically
            // (preserves collapsed state and avoids contiguity issues with tabs.move)
            chrome.tabGroups.move(sourceGroup.groupId, { index: targetChromeIndex }).catch(err => {
                console.warn('chrome.tabGroups.move failed:', err);
            });
        },
        [tabs, setTabs]
    );

    const handleDropGroupToTab = useCallback(
        (
            sourceGroup: GroupDragPayload,
            targetTab: TabDragPayload,
            edge: Edge
        ) => {
            if (sourceGroup.tabIds.length === 0) return;

            const pinnedCount = tabs.filter(t => t.pinned).length;

            let targetChromeIndex = targetTab.chromeIndex;
            if (edge === 'bottom') {
                targetChromeIndex += 1;
            }

            if (sourceGroup.fromMinIndex < targetChromeIndex) {
                targetChromeIndex -= sourceGroup.tabIds.length;
            }

            targetChromeIndex = Math.max(pinnedCount, targetChromeIndex);

            const groupTabSet = new Set(sourceGroup.tabIds);

            // Optimistic UI Update
            setTabs(prev => {
                const next = [...prev];
                const movedTabs: chrome.tabs.Tab[] = [];
                const remainingTabs = next.filter(t => {
                    if (groupTabSet.has(t.id!)) {
                        movedTabs.push(t);
                        return false;
                    }
                    return true;
                });

                let insertIdx = Math.max(0, Math.min(targetChromeIndex, remainingTabs.length));
                remainingTabs.splice(insertIdx, 0, ...movedTabs);

                return remainingTabs.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API Sync — use tabGroups.move to move the group atomically
            // (preserves collapsed state and avoids contiguity issues with tabs.move)
            chrome.tabGroups.move(sourceGroup.groupId, { index: targetChromeIndex }).catch(err => {
                console.warn('chrome.tabGroups.move failed:', err);
            });
        },
        [tabs, setTabs]
    );

    // ── Active Session Handlers ──────────────────────────────────────────────

    const handleCapture = useCallback(async () => {
        if (!spaceName.trim()) return;

        const validTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'));

        if (validTabs.length === 0) {
            toast("No valid tabs to capture. Open some websites first!", { duration: 3000 });
            return;
        }

        setIsSaving(true);
        try {
            await spaceService.captureCurrentWindow(spaceName);
            setSpaceName('');
            toast("Space saved successfully", { duration: 2000 });
        } catch (error) {
            console.error(error);
            toast("Failed to save space", { duration: 3000 });
        } finally {
            setIsSaving(false);
        }
    }, [spaceName, tabs, toast]);

    const handleReadLater = useCallback(async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
        e.stopPropagation();
        if (!tab.url || !tab.id) return;

        try {
            await readLaterService.addFromTab(tab);
            await chrome.tabs.remove(tab.id).catch(() => { });
            toast("Saved to Read Later", { duration: 1500 });
        } catch (err) {
            if (err instanceof DuplicateReadLaterError) {
                toast("Already in Read Later", { duration: 2000 });
            } else {
                console.error(err);
                toast("Failed to save to Read Later");
            }
        }
    }, [toast]);

    const handleClose = useCallback(async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
        e.stopPropagation();
        if (!tab.id) return;

        const tabId = tab.id;
        const tabUrl = tab.url || '';

        const isBlankTab = tabUrl === '' || tabUrl === 'chrome://newtab/' || tabUrl === 'about:blank';

        try {
            await chrome.tabs.remove(tabId);

            if (isBlankTab) {
                toast("Tab closed", { duration: 2000 });
                return;
            }

            const sessionId = await getRecentSessionId();

            if (sessionId) {
                toast("Tab closed", {
                    duration: 4000,
                    onUndo: () => {
                        chrome.sessions.restore(sessionId).catch(console.error);
                    }
                });
            } else {
                toast("Tab closed", { duration: 2000 });
            }
        } catch {
            // Tab might already be closed
        }
    }, [toast]);

    const handleCloseGroup = useCallback(async (e: React.MouseEvent, group: chrome.tabGroups.TabGroup, groupTabs: chrome.tabs.Tab[]) => {
        e.stopPropagation();
        const ids = groupTabs.map(t => t.id).filter((id): id is number => id !== undefined);
        if (ids.length === 0) return;

        const title = group.title || 'Group';
        const color = group.color;
        const tabUrls = groupTabs
            .map(t => t.url)
            .filter((url): url is string => !!url && url !== '' && !url.startsWith('chrome://newtab/'));

        try {
            await chrome.tabs.remove(ids);

            toast(`Closed group "${title}"`, {
                duration: 5000,
                onUndo: async () => {
                    if (tabUrls.length === 0) return;
                    try {
                        const newTabIds: number[] = [];
                        for (const url of tabUrls) {
                            const newTab = await chrome.tabs.create({ url, active: false });
                            if (newTab.id !== undefined) {
                                newTabIds.push(newTab.id);
                            }
                        }
                        if (newTabIds.length > 0) {
                            const newGroupId = await chrome.tabs.group({ tabIds: newTabIds });
                            await chrome.tabGroups.update(newGroupId, { title, color });
                        }
                    } catch (err) {
                        console.error('Failed to undo group closure:', err);
                    }
                }
            });
        } catch (err) {
            console.error('Failed to close group:', err);
        }
    }, [toast]);

    const handleArchiveGroup = useCallback(async (e: React.MouseEvent, group: chrome.tabGroups.TabGroup, tabs: chrome.tabs.Tab[]) => {
        e.stopPropagation();
        const ids = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
        if (ids.length === 0) return;

        try {
            await spaceService.createSpaceFromTabs(group.title || '', tabs);
            await chrome.tabs.remove(ids);
            toast("Group archived to Spaces", { duration: 2000 });
        } catch (err) {
            console.error(err);
            toast("Failed to archive group");
        }
    }, [toast]);

    const renderItemContent = useCallback((_idx: number, item: VirtualRow) => {
        if (item.type === 'group-header') {
            return (
                <DraggableGroupHeader
                    key={`group-${item.group.id}`}
                    group={item.group}
                    groupTabs={item.tabs}
                    handleCloseGroup={handleCloseGroup}
                    handleArchiveGroup={handleArchiveGroup}
                    onDropTabToGroup={handleDropTabToGroup}
                    onDropGroup={handleDropGroup}
                    onJoinGroup={handleJoinGroup}
                    setDraggingGroupId={setDraggingGroupId}
                />
            );
        }

        return (
            <DraggableTabItem
                key={`tab-${item.tab.id}`}
                tab={item.tab}
                globalIndex={item.globalIndex}
                inGroup={item.inGroup}
                color={item.color}
                activeTabId={activeTabId}
                draggingGroupId={draggingGroupId}
                isDuplicate={item.isDuplicate}
                handleClose={handleClose}
                handleReadLater={handleReadLater}
                onDropTab={handleDropTab}
                onDropGroupToTab={handleDropGroupToTab}
            />
        );
    }, [
        activeTabId,
        draggingGroupId,
        handleCloseGroup,
        handleArchiveGroup,
        handleDropTabToGroup,
        handleDropGroup,
        handleJoinGroup,
        setDraggingGroupId,
        handleClose,
        handleReadLater,
        handleDropTab,
        handleDropGroupToTab,
    ]);

    return (
        <div className="flex flex-col h-full select-none">
            {/* Capture Header */}
            <div className="p-2 bg-card border-b border-border flex-shrink-0 z-10 w-full">
                <div className="flex items-center gap-1.5">
                    <input
                        type="text"
                        value={spaceName}
                        onChange={(e) => setSpaceName(e.target.value)}
                        placeholder={currentSpace ? `Update "${currentSpace.name}"...` : "Name this space..."}
                        className="flex-1 h-7 px-2 rounded-md border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-0"
                        onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                    />
                    <span className="text-xxs font-medium text-muted-foreground bg-secondary px-1.5 py-1 rounded-md shrink-0 whitespace-nowrap">
                        {tabs.length} Tabs
                    </span>
                    <TooltipSimple content={currentSpace ? "Update Space" : "Save Space"} side="bottom">
                        <button
                            onClick={handleCapture}
                            disabled={!spaceName.trim() || isSaving}
                            className="h-7 w-7 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors shrink-0"
                            aria-label={currentSpace ? "Update Space" : "Save Space"}
                        >
                            <Save className="w-3.5 h-3.5" />
                        </button>
                    </TooltipSimple>
                </div>
            </div>

            {/* Active View Local Toolbar */}
            <ActiveToolbar 
                tabs={tabs} 
                activeTabId={activeTabId} 
                duplicateCount={duplicateCount}
                onDeduplicate={deduplicate}
            />

            {/* Virtualized Active Tab List */}
            <div className="flex-1 p-2 min-h-0 bg-background overflow-hidden">
                {flatList.length > 0 ? (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={flatList}
                        itemContent={renderItemContent}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground opacity-50">
                        <Ghost className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs">No active tabs</p>
                    </div>
                )}
            </div>
        </div>
    );
};
