import React, { useRef, useState, useEffect, memo } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { GroupRow } from '../GroupRow';
import { type TabDragPayload, type GroupDragPayload } from '../../types';

export interface DraggableGroupHeaderProps {
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
}

export const DraggableGroupHeader = memo(({
    group,
    groupTabs,
    handleCloseGroup,
    handleArchiveGroup,
    onDropTabToGroup,
    onDropGroup,
    onJoinGroup,
    setDraggingGroupId,
}: DraggableGroupHeaderProps) => {
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
                getInitialDataForExternal: () => {
                    const urls = groupTabs
                        .map(t => t.url || '')
                        .filter(Boolean)
                        .join('\n');
                    return { 'text/plain': urls, 'text/uri-list': urls };
                },
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
                groupTabs={groupTabs}
                onClose={(e) => handleCloseGroup(e, group, groupTabs)}
                onArchive={(e) => handleArchiveGroup(e, group, groupTabs)}
                isDragging={isDragging}
                isCenterHighlighted={isCenterHighlighted}
                closestEdge={closestEdge}
            />
        </div>
    );
});

DraggableGroupHeader.displayName = 'DraggableGroupHeader';
