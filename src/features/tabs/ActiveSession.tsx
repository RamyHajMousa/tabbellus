import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { spaceService, getRecentSessionId, readLaterService, DuplicateReadLaterError } from '@/lib';
import { getGroupColorClasses } from '@/lib/colors';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Save, Ghost } from 'lucide-react';
import { useCurrentTabs } from './hooks/useCurrentTabs';
import { TabRow } from './components/TabRow';
import { GroupRow } from './components/GroupRow';
import { useCurrentSpace } from '@/hooks/useCurrentSpace';
import { chromeTabToRowData } from './types';
import { ActiveToolbar } from './components/ActiveToolbar';

// ── Virtual Item Discrimination & Drag Payload Types ────────────────────

export type VirtualRow =
    | {
          type: 'tab';
          tab: chrome.tabs.Tab;
          globalIndex: number;
          inGroup?: boolean;
          color?: chrome.tabGroups.ColorEnum;
      }
    | {
          type: 'group-header';
          group: chrome.tabGroups.TabGroup;
          tabs: chrome.tabs.Tab[];
      };

export interface TabDragPayload {
    type: 'tab';
    tabId: number;
    globalIndex: number;
    groupId: number;
    [key: string]: unknown;
}

export interface GroupDragPayload {
    type: 'group-header';
    groupId: number;
    tabIds: number[];
    fromMinIndex: number;
    [key: string]: unknown;
}

// ── Draggable & DropTarget Sub-Components ────────────────────────────────

const DraggableTabItem = memo(({
    tab,
    globalIndex,
    inGroup,
    color,
    activeTabId,
    draggingGroupId,
    handleClose,
    handleReadLater,
    onDropTab,
    onDropGroupToTab,
}: {
    tab: chrome.tabs.Tab;
    globalIndex: number;
    inGroup?: boolean;
    color?: chrome.tabGroups.ColorEnum;
    activeTabId: number | null;
    draggingGroupId: number | null;
    handleClose: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void;
    handleReadLater: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void;
    onDropTab: (
        source: TabDragPayload,
        target: TabDragPayload,
        edge: Edge
    ) => void;
    onDropGroupToTab: (
        sourceGroup: GroupDragPayload,
        targetTab: TabDragPayload,
        edge: Edge
    ) => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const dragHandleRef = useRef<HTMLElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [closestEdge, setClosestEdge] = useState<'top' | 'bottom' | null>(null);

    const isGroupMemberDragging = tab.groupId !== -1 && tab.groupId === draggingGroupId;

    useEffect(() => {
        const el = ref.current;
        if (!el || tab.id === undefined) return;

        const payload: TabDragPayload = {
            type: 'tab',
            tabId: tab.id,
            globalIndex,
            groupId: tab.groupId,
        };

        return combine(
            draggable({
                element: el,
                dragHandle: dragHandleRef.current || undefined,
                getInitialData: () => (payload as unknown) as Record<string, unknown>,
                onDragStart: () => setIsDragging(true),
                onDrop: () => setIsDragging(false),
            }),
            dropTargetForElements({
                element: el,
                getData: ({ input }) => {
                    return attachClosestEdge(
                        (payload as unknown) as Record<string | symbol, unknown>,
                        {
                            element: el,
                            input,
                            allowedEdges: ['top', 'bottom'],
                        }
                    );
                },
                onDragEnter: (args) => {
                    const edge = extractClosestEdge(args.self.data);
                    setClosestEdge(edge === 'top' || edge === 'bottom' ? edge : null);
                },
                onDropTargetChange: (args) => {
                    const edge = extractClosestEdge(args.self.data);
                    setClosestEdge(edge === 'top' || edge === 'bottom' ? edge : null);
                },
                onDragLeave: () => setClosestEdge(null),
                onDrop: (args) => {
                    setClosestEdge(null);
                    const edge = extractClosestEdge(args.self.data);
                    if (!edge) return;
                    if (args.source.data.type === 'tab') {
                        onDropTab(
                            args.source.data as unknown as TabDragPayload,
                            args.self.data as unknown as TabDragPayload,
                            edge
                        );
                    } else if (args.source.data.type === 'group-header') {
                        onDropGroupToTab(
                            args.source.data as unknown as GroupDragPayload,
                            args.self.data as unknown as TabDragPayload,
                            edge
                        );
                    }
                },
            })
        );
    }, [tab.id, tab.groupId, globalIndex, onDropTab, onDropGroupToTab]);

    const content = (
        <TabRow
            data={chromeTabToRowData(tab, activeTabId)}
            onClose={(e) => handleClose(e, tab)}
            onReadLater={(e) => handleReadLater(e, tab)}
            isDragging={isDragging || isGroupMemberDragging}
            closestEdge={closestEdge}
            dragHandleRef={(node) => { dragHandleRef.current = node; }}
        />
    );

    if (inGroup && color) {
        const colors = getGroupColorClasses(color);
        return (
            <div ref={ref} className={`pl-[14px] border-l-2 ml-2 relative ${colors.border}`}>
                {content}
            </div>
        );
    }

    return <div ref={ref}>{content}</div>;
});

const DraggableGroupHeader = memo(({
    group,
    groupTabs,
    handleCloseGroup,
    handleArchiveGroup,
    onDropTabToGroup,
    onDropGroup,
    onJoinGroup,
    setDraggingGroupId,
}: {
    group: chrome.tabGroups.TabGroup;
    groupTabs: chrome.tabs.Tab[];
    handleCloseGroup: (e: React.MouseEvent, group: chrome.tabGroups.TabGroup, tabs: chrome.tabs.Tab[]) => void;
    handleArchiveGroup: (e: React.MouseEvent, group: chrome.tabGroups.TabGroup, tabs: chrome.tabs.Tab[]) => void;
    onDropTabToGroup: (
        source: TabDragPayload,
        targetGroup: chrome.tabGroups.TabGroup,
        groupTabs: chrome.tabs.Tab[],
        edge: Edge
    ) => void;
    onDropGroup: (
        sourceGroup: GroupDragPayload,
        targetGroup: chrome.tabGroups.TabGroup,
        groupTabs: chrome.tabs.Tab[],
        edge: Edge
    ) => void;
    onJoinGroup: (
        sourceTab: TabDragPayload,
        targetGroup: chrome.tabGroups.TabGroup
    ) => void;
    setDraggingGroupId: (id: number | null) => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [closestEdge, setClosestEdge] = useState<'top' | 'bottom' | null>(null);
    const [isCenterHighlighted, setIsCenterHighlighted] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const tabIds = groupTabs
            .map(t => t.id)
            .filter((id): id is number => id !== undefined);

        const groupPayload: GroupDragPayload = {
            type: 'group-header',
            groupId: group.id,
            tabIds,
            fromMinIndex: groupTabs[0]?.index ?? 0,
        };

        return combine(
            draggable({
                element: el,
                getInitialData: () => (groupPayload as unknown) as Record<string, unknown>,
                onDragStart: () => {
                    setIsDragging(true);
                    setDraggingGroupId(group.id);
                },
                onDrop: () => {
                    setIsDragging(false);
                    setDraggingGroupId(null);
                },
            }),
            dropTargetForElements({
                element: el,
                getData: ({ input }) => {
                    const rect = el.getBoundingClientRect();
                    const relativeY = input.clientY - rect.top;
                    const height = rect.height;

                    let edge: 'top' | 'bottom' | null = null;
                    if (relativeY < height * 0.30) {
                        edge = 'top';
                    } else if (relativeY > height * 0.70) {
                        edge = 'bottom';
                    } else {
                        edge = null; // Tri-State: Center Hit!
                    }

                    return attachClosestEdge(
                        (groupPayload as unknown) as Record<string | symbol, unknown>,
                        {
                            element: el,
                            input,
                            allowedEdges: edge ? [edge] : ['top', 'bottom'],
                        }
                    );
                },
                onDragEnter: (args) => {
                    const rect = el.getBoundingClientRect();
                    const relativeY = args.location.current.input.clientY - rect.top;
                    const height = rect.height;
                    const isTab = args.source.data.type === 'tab';

                    if (isTab && relativeY >= height * 0.30 && relativeY <= height * 0.70) {
                        setIsCenterHighlighted(true);
                        setClosestEdge(null);
                    } else {
                        setIsCenterHighlighted(false);
                        const edge = extractClosestEdge(args.self.data);
                        setClosestEdge(edge === 'top' || edge === 'bottom' ? edge : null);
                    }
                },
                onDropTargetChange: (args) => {
                    const rect = el.getBoundingClientRect();
                    const relativeY = args.location.current.input.clientY - rect.top;
                    const height = rect.height;
                    const isTab = args.source.data.type === 'tab';

                    if (isTab && relativeY >= height * 0.30 && relativeY <= height * 0.70) {
                        setIsCenterHighlighted(true);
                        setClosestEdge(null);
                    } else {
                        setIsCenterHighlighted(false);
                        const edge = extractClosestEdge(args.self.data);
                        setClosestEdge(edge === 'top' || edge === 'bottom' ? edge : null);
                    }
                },
                onDragLeave: () => {
                    setClosestEdge(null);
                    setIsCenterHighlighted(false);
                },
                onDrop: (args) => {
                    const rect = el.getBoundingClientRect();
                    const relativeY = args.location.current.input.clientY - rect.top;
                    const height = rect.height;
                    const isTab = args.source.data.type === 'tab';
                    const isCenter = isTab && relativeY >= height * 0.30 && relativeY <= height * 0.70;

                    setClosestEdge(null);
                    setIsCenterHighlighted(false);

                    if (isCenter) {
                        onJoinGroup(args.source.data as unknown as TabDragPayload, group);
                        return;
                    }

                    const edge = extractClosestEdge(args.self.data) || (relativeY < height / 2 ? 'top' : 'bottom');

                    if (args.source.data.type === 'tab') {
                        onDropTabToGroup(
                            args.source.data as unknown as TabDragPayload,
                            group,
                            groupTabs,
                            edge
                        );
                    } else if (args.source.data.type === 'group-header') {
                        onDropGroup(
                            args.source.data as unknown as GroupDragPayload,
                            group,
                            groupTabs,
                            edge
                        );
                    }
                },
            })
        );
    }, [group, groupTabs, onDropTabToGroup, onDropGroup, onJoinGroup, setDraggingGroupId]);

    return (
        <div ref={ref} className="mb-0.5">
            <GroupRow
                group={group}
                onClose={(e) => handleCloseGroup(e, group, groupTabs)}
                onArchive={(e) => handleArchiveGroup(e, group, groupTabs)}
                isDragging={isDragging}
                isCenterHighlighted={isCenterHighlighted}
                closestEdge={closestEdge}
            />
        </div>
    );
});

// ── ActiveSession Component ──────────────────────────────────────────────

export const ActiveSession = () => {
    const { tabs, setTabs, groups, activeTabId } = useCurrentTabs();
    const currentSpace = useCurrentSpace();
    const [spaceName, setSpaceName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [draggingGroupId, setDraggingGroupId] = useState<number | null>(null);
    const { toast } = useToast();

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
                    });
                }
            }
        }
        return result;
    }, [tabs, groups]);

    // ── Drag & Drop Handlers ─────────────────────────────────────────────────

    const handleDropTab = useCallback(
        (
            source: TabDragPayload,
            target: TabDragPayload,
            edge: Edge
        ) => {
            if (source.tabId === target.tabId) return;

            const sourceTabObj = tabs.find(t => t.id === source.tabId);
            const targetTab = tabs.find(t => t.id === target.tabId);
            if (!sourceTabObj || !targetTab) return;

            const rawTargetIndex = targetTab.index + (edge === 'bottom' ? 1 : 0);
            const targetGroupId = target.groupId;

            // Optimistic UI Update
            setTabs(prev => {
                const next = [...prev];
                const fromIdx = next.findIndex(t => t.id === source.tabId);
                if (fromIdx === -1) return prev;

                const [moved] = next.splice(fromIdx, 1);
                moved.groupId = targetGroupId;

                const tabsBeforeTarget = fromIdx < rawTargetIndex ? 1 : 0;
                const insertIdx = Math.max(0, Math.min(rawTargetIndex - tabsBeforeTarget, next.length));

                next.splice(insertIdx, 0, moved);
                return next.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API: subtract 1 if source was before target
            const chromeIndex = sourceTabObj.index < rawTargetIndex
                ? Math.max(0, rawTargetIndex - 1)
                : rawTargetIndex;
            chrome.tabs.move(source.tabId, { index: chromeIndex }).catch(err => {
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
        [tabs, setTabs]
    );

    const handleDropTabToGroup = useCallback(
        (
            source: TabDragPayload,
            targetGroup: chrome.tabGroups.TabGroup,
            groupTabs: chrome.tabs.Tab[],
            edge: Edge
        ) => {
            if (groupTabs.length === 0) return;

            const sourceTabObj = tabs.find(t => t.id === source.tabId);
            if (!sourceTabObj) return;

            const rawTargetIndex = edge === 'top' ? groupTabs[0].index : groupTabs[groupTabs.length - 1].index + 1;
            const targetGroupId = targetGroup.id;

            // Optimistic UI Update
            setTabs(prev => {
                const next = [...prev];
                const fromIdx = next.findIndex(t => t.id === source.tabId);
                if (fromIdx === -1) return prev;

                const [moved] = next.splice(fromIdx, 1);
                moved.groupId = targetGroupId;

                const tabsBeforeTarget = fromIdx < rawTargetIndex ? 1 : 0;
                const insertIdx = Math.max(0, Math.min(rawTargetIndex - tabsBeforeTarget, next.length));

                next.splice(insertIdx, 0, moved);
                return next.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API: subtract 1 if source was before target
            const chromeIndex = sourceTabObj.index < rawTargetIndex
                ? Math.max(0, rawTargetIndex - 1)
                : rawTargetIndex;
            chrome.tabs.move(source.tabId, { index: chromeIndex }).catch(err => {
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

            const targetTab = edge === 'top' ? targetGroupTabs[0] : targetGroupTabs[targetGroupTabs.length - 1];
            const rawTargetIndex = edge === 'top' ? targetTab.index : targetTab.index + 1;

            const groupTabSet = new Set(sourceGroup.tabIds);

            // Optimistic UI Update
            setTabs(prev => {
                const movedTabs: chrome.tabs.Tab[] = [];
                const remainingTabs = prev.filter(t => {
                    if (groupTabSet.has(t.id!)) {
                        movedTabs.push(t);
                        return false;
                    }
                    return true;
                });

                if (movedTabs.length === 0) return prev;

                const targetRefId = targetTab.id;
                const targetIdxInRemaining = remainingTabs.findIndex(t => t.id === targetRefId);
                let insertIdx = targetIdxInRemaining === -1 ? 0 : (edge === 'bottom' ? targetIdxInRemaining + 1 : targetIdxInRemaining);
                insertIdx = Math.max(0, Math.min(insertIdx, remainingTabs.length));

                remainingTabs.splice(insertIdx, 0, ...movedTabs);

                return remainingTabs.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API: subtract 1 if source group min index was before target (moving downward)
            const sourceMinIndex = Math.min(...sourceGroup.tabIds.map(id => tabs.find(t => t.id === id)?.index ?? Infinity));
            const isMovingDownward = sourceMinIndex < rawTargetIndex;
            const chromeIndex = isMovingDownward ? Math.max(0, rawTargetIndex - 1) : rawTargetIndex;

            chrome.tabs.move(sourceGroup.tabIds, { index: chromeIndex }).then(() => {
                return chrome.tabs.group({ tabIds: sourceGroup.tabIds, groupId: sourceGroup.groupId });
            }).catch(err => {
                console.warn('chrome.tabs.move group failed:', err);
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

            const targetTabObj = tabs.find(t => t.id === targetTab.tabId);
            if (!targetTabObj) return;

            const rawTargetIndex = targetTabObj.index + (edge === 'bottom' ? 1 : 0);

            const groupTabSet = new Set(sourceGroup.tabIds);

            // Optimistic UI Update
            setTabs(prev => {
                const movedTabs: chrome.tabs.Tab[] = [];
                const remainingTabs = prev.filter(t => {
                    if (groupTabSet.has(t.id!)) {
                        movedTabs.push(t);
                        return false;
                    }
                    return true;
                });

                if (movedTabs.length === 0) return prev;

                const targetIdxInRemaining = remainingTabs.findIndex(t => t.id === targetTab.tabId);
                let insertIdx = targetIdxInRemaining === -1 ? 0 : (edge === 'bottom' ? targetIdxInRemaining + 1 : targetIdxInRemaining);
                insertIdx = Math.max(0, Math.min(insertIdx, remainingTabs.length));

                remainingTabs.splice(insertIdx, 0, ...movedTabs);

                return remainingTabs.map((t, i) => ({ ...t, index: i }));
            });

            // Chrome API: subtract 1 if source group min index was before target (moving downward)
            const sourceMinIndex = Math.min(...sourceGroup.tabIds.map(id => tabs.find(t => t.id === id)?.index ?? Infinity));
            const isMovingDownward = sourceMinIndex < rawTargetIndex;
            const chromeIndex = isMovingDownward ? Math.max(0, rawTargetIndex - 1) : rawTargetIndex;

            chrome.tabs.move(sourceGroup.tabIds, { index: chromeIndex }).then(() => {
                return chrome.tabs.group({ tabIds: sourceGroup.tabIds, groupId: sourceGroup.groupId });
            }).catch(err => {
                console.warn('chrome.tabs.move group failed:', err);
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
            <ActiveToolbar tabs={tabs} activeTabId={activeTabId} />

            {/* Virtualized Active Tab List */}
            <div className="flex-1 p-2 min-h-0 bg-background overflow-hidden">
                {flatList.length > 0 ? (
                    <Virtuoso
                        style={{ height: '100%' }}
                        data={flatList}
                        itemContent={(_idx, item) => {
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
                                    handleClose={handleClose}
                                    handleReadLater={handleReadLater}
                                    onDropTab={handleDropTab}
                                    onDropGroupToTab={handleDropGroupToTab}
                                />
                            );
                        }}
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
