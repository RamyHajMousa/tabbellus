import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { spaceService, getRecentSessionId, readLaterService, DuplicateReadLaterError } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Save, Ghost } from 'lucide-react';
import { useCurrentTabs } from './hooks/useCurrentTabs';
import { TabRow } from './components/TabRow';
import { GroupRow } from './components/GroupRow';
import { useCurrentSpace } from '@/hooks/useCurrentSpace';
import { chromeTabToRowData } from './types';
import { ActiveToolbar } from './components/ActiveToolbar';

// A contiguous block of ungrouped tabs sharing a common position segment
interface UngroupedSegment {
    type: 'segment';
    segmentIndex: number;
    tabs: chrome.tabs.Tab[];
}

interface GroupBlock {
    type: 'group';
    groupId: number;
    tabs: chrome.tabs.Tab[];
}

type RenderItem = UngroupedSegment | GroupBlock;

// ── Render Strategy Components ───────────────────────────────────────────

const TabRowRenderer: React.FC<{ item: any; [key: string]: any }> = ({ item, activeTabId, handleClose, handleReadLater }) => {
    const segment = item as UngroupedSegment;
    const droppableId = `segment-${segment.segmentIndex}`;
    return (
        <Droppable
            droppableId={droppableId}
            type="ungrouped"
        >
            {(provided, snapshot) => (
                <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-0.5 rounded-md transition-colors ${snapshot.isDraggingOver ? 'bg-muted' : ''}`}
                >
                    {segment.tabs.map((tab, idx) => (
                        <Draggable
                            key={`tab-${tab.id}`}
                            draggableId={String(tab.id)}
                            index={idx}
                        >
                            {(dragProvided, dragSnapshot) => (
                                <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                >
                                    <TabRow
                                        data={chromeTabToRowData(tab, activeTabId)}
                                        onClose={(e) => handleClose(e, tab)}
                                        onReadLater={(e) => handleReadLater(e, tab)}
                                        isDragging={dragSnapshot.isDragging}
                                        dragHandleProps={dragProvided.dragHandleProps}
                                    />
                                </div>
                            )}
                        </Draggable>
                    ))}
                    {provided.placeholder}
                </div>
            )}
        </Droppable>
    );
};

const GroupBlockRenderer: React.FC<{ item: any; [key: string]: any }> = ({
    item,
    activeTabId,
    groups,
    handleClose,
    handleReadLater,
    handleCloseGroup,
    handleArchiveGroup
}) => {
    const groupBlock = item as GroupBlock;
    const group = groups.get(groupBlock.groupId);
    if (!group) return null;
    const droppableId = `group-${groupBlock.groupId}`;

    return (
        <div className="mb-1">
            <GroupRow
                group={group}
                onClose={(e) => handleCloseGroup(e, groupBlock.tabs)}
                onArchive={(e) => handleArchiveGroup(e, group, groupBlock.tabs)}
            />

            {/* Group Children — isolated Droppable prevents cross-group drops */}
            {!group.collapsed && (
                <Droppable
                    droppableId={droppableId}
                    type={`group-${groupBlock.groupId}`}
                >
                    {(provided, snapshot) => (
                        <GroupRow.Children
                            ref={provided.innerRef}
                            color={group.color}
                            isDraggingOver={snapshot.isDraggingOver}
                            {...provided.droppableProps}
                        >
                            {groupBlock.tabs.map((t, idx) => (
                                <Draggable
                                    key={`tab-${t.id}`}
                                    draggableId={String(t.id)}
                                    index={idx}
                                >
                                    {(dragProvided, dragSnapshot) => (
                                        <div
                                            ref={dragProvided.innerRef}
                                            {...dragProvided.draggableProps}
                                        >
                                            <TabRow
                                                data={chromeTabToRowData(t, activeTabId)}
                                                onClose={(e) => handleClose(e, t)}
                                                onReadLater={(e) => handleReadLater(e, t)}
                                                isDragging={dragSnapshot.isDragging}
                                                dragHandleProps={dragProvided.dragHandleProps}
                                            />
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </GroupRow.Children>
                    )}
                </Droppable>
            )}
        </div>
    );
};

const ACTIVE_SESSION_RENDERERS: Record<string, React.FC<{ item: any; [key: string]: any }>> = {
    segment: TabRowRenderer,
    tab: TabRowRenderer,
    group: GroupBlockRenderer,
};

// ── ActiveSession Component ──────────────────────────────────────────────

export const ActiveSession = () => {
    const { tabs, setTabs, groups, activeTabId } = useCurrentTabs();
    const currentSpace = useCurrentSpace();
    const [spaceName, setSpaceName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    // Grouping Topology — coalesces contiguous ungrouped tabs into named segments
    // so each segment maps to exactly one <Droppable> with a contiguous index range.
    const renderList = useMemo<RenderItem[]>(() => {
        const list: RenderItem[] = [];
        const processedGroups = new Set<number>();
        const groupMap = new Map<number, chrome.tabs.Tab[]>();

        tabs.forEach(tab => {
            const gid = tab.groupId;
            if (gid !== -1) {
                if (!groupMap.has(gid)) groupMap.set(gid, []);
                groupMap.get(gid)!.push(tab);
            }
        });

        let currentSegment: chrome.tabs.Tab[] | null = null;
        let segmentIndex = 0;

        for (const tab of tabs) {
            if (tab.groupId === -1) {
                // Ungrouped — coalesce into current segment
                if (currentSegment === null) {
                    currentSegment = [];
                }
                currentSegment.push(tab);
            } else {
                // Flush any open ungrouped segment
                if (currentSegment !== null) {
                    list.push({ type: 'segment', segmentIndex: segmentIndex++, tabs: currentSegment });
                    currentSegment = null;
                }
                // Add group block only once
                if (!processedGroups.has(tab.groupId)) {
                    processedGroups.add(tab.groupId);
                    list.push({ type: 'group', groupId: tab.groupId, tabs: groupMap.get(tab.groupId) || [] });
                }
            }
        }
        // Flush trailing ungrouped segment
        if (currentSegment !== null) {
            list.push({ type: 'segment', segmentIndex: segmentIndex++, tabs: currentSegment });
        }

        return list;
    }, [tabs]);

    // ── Drag & Drop Handler ──────────────────────────────────────────────────
    const handleDragEnd = useCallback((result: DropResult) => {
        const { source, destination, draggableId } = result;

        // Dropped outside a valid zone or no movement
        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const tabId = parseInt(draggableId, 10);
        if (isNaN(tabId)) return;

        // Find the target droppable's tab list to compute the global Chrome index
        let targetTabs: chrome.tabs.Tab[] = [];
        for (const item of renderList) {
            if (item.type === 'segment' && `segment-${item.segmentIndex}` === destination.droppableId) {
                targetTabs = item.tabs;
                break;
            }
            if (item.type === 'group' && `group-${item.groupId}` === destination.droppableId) {
                targetTabs = item.tabs;
                break;
            }
        }

        // Global Chrome index = first tab's global index in that list + destination.index
        const startGlobalIndex = targetTabs[0]?.index ?? 0;
        const newIndex = startGlobalIndex + destination.index;

        // ── Optimistic UI Update ─────────────────────────────────────────────
        // Splice the dragged tab into the new position in the local array so the
        // library's controlled component doesn't snap back while Chrome processes.
        setTabs(prev => {
            const next = [...prev];
            const fromIdx = next.findIndex(t => t.id === tabId);
            if (fromIdx === -1) return prev;

            const [moved] = next.splice(fromIdx, 1);
            // Insert at the absolute target position
            next.splice(newIndex, 0, moved);

            // Re-assign .index sequentially so sort() doesn't undo the move
            return next.map((t, i) => ({ ...t, index: i }));
        });

        // ── Chrome API Sync ──────────────────────────────────────────────────
        // Fire-and-forget. chrome.tabs.onMoved will trigger triggerTabsRefresh()
        // which replaces the optimistic state with the true Chrome state.
        chrome.tabs.move(tabId, { index: newIndex }).catch(err => {
            console.warn('chrome.tabs.move failed:', err);
        });
    }, [renderList, setTabs]);

    // ── Existing Handlers ────────────────────────────────────────────────────
    const handleCapture = async () => {
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
    };

    const handleReadLater = async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
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
    };

    const handleClose = async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
        e.stopPropagation();
        if (!tab.id) return;

        const tabId = tab.id;
        const tabUrl = tab.url || '';

        // Skip Undo for blank tabs (Chrome doesn't save these)
        const isBlankTab = tabUrl === '' || tabUrl === 'chrome://newtab/' || tabUrl === 'about:blank';

        try {
            await chrome.tabs.remove(tabId);

            if (isBlankTab) {
                toast("Tab closed", { duration: 2000 });
                return;
            }

            // Poll for the session entry with retry backoff
            const sessionId = await getRecentSessionId();

            if (sessionId) {
                toast("Tab closed", {
                    duration: 4000,
                    onUndo: () => {
                        chrome.sessions.restore(sessionId).catch(console.error);
                    }
                });
            } else {
                // No sessionId available (e.g., incognito)
                toast("Tab closed", { duration: 2000 });
            }
        } catch {
            // Tab might already be closed
        }
    };

    const handleCloseGroup = async (e: React.MouseEvent, groupTabs: chrome.tabs.Tab[]) => {
        e.stopPropagation();
        const ids = groupTabs.map(t => t.id).filter((id): id is number => id !== undefined);
        if (ids.length === 0) return;

        try {
            await chrome.tabs.remove(ids);

            // Capture sessionId before offering Undo — never call restore() without one
            const sessionId = await getRecentSessionId();

            if (sessionId) {
                toast(`Closed group with ${ids.length} tabs`, {
                    duration: 4000,
                    onUndo: () => {
                        chrome.sessions.restore(sessionId).catch(console.error);
                    }
                });
            } else {
                toast(`Closed group with ${ids.length} tabs`, { duration: 2000 });
            }
        } catch {
            // Tabs might already be closed
        }
    };

    const handleArchiveGroup = async (e: React.MouseEvent, group: chrome.tabGroups.TabGroup, tabs: chrome.tabs.Tab[]) => {
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
    };

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

            {/* Scrollable Tab List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0 bg-background">
                <DragDropContext onDragEnd={handleDragEnd}>
                    {renderList.map((item) => {
                        const Renderer = ACTIVE_SESSION_RENDERERS[item.type];
                        if (!Renderer) return null;

                        return (
                            <Renderer
                                key={item.type === 'segment' ? `segment-${item.segmentIndex}` : `group-${item.groupId}`}
                                item={item}
                                activeTabId={activeTabId}
                                groups={groups}
                                handleClose={handleClose}
                                handleReadLater={handleReadLater}
                                handleCloseGroup={handleCloseGroup}
                                handleArchiveGroup={handleArchiveGroup}
                            />
                        );
                    })}
                </DragDropContext>

                {tabs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground opacity-50">
                        <Ghost className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs">No active tabs</p>
                    </div>
                )}
            </div>
        </div>
    );
};
