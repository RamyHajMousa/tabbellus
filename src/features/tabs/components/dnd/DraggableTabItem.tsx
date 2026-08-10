import React, { useRef, useState, useEffect, memo } from 'react';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { getGroupColorClasses } from '@/lib/colors';
import { TabRow } from '../TabRow';
import { chromeTabToRowData, type TabDragPayload, type GroupDragPayload } from '../../types';

export interface DraggableTabItemProps {
    tab: chrome.tabs.Tab;
    globalIndex: number;
    inGroup?: boolean;
    color?: chrome.tabGroups.ColorEnum;
    isDuplicate?: boolean;
    activeTabId: number | null;
    draggingGroupId: number | null;
    handleClose: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void;
    handleReadLater: (e: React.MouseEvent, tab: chrome.tabs.Tab) => void;
    onDropTab: (
        source: TabDragPayload,
        target: TabDragPayload,
        edge: Edge | null
    ) => void;
    onDropGroupToTab: (
        sourceGroup: GroupDragPayload,
        targetTab: TabDragPayload,
        edge: Edge
    ) => void;
}

export const DraggableTabItem = memo(({
    tab,
    globalIndex,
    inGroup,
    color,
    isDuplicate,
    activeTabId,
    draggingGroupId,
    handleClose,
    handleReadLater,
    onDropTab,
    onDropGroupToTab,
}: DraggableTabItemProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const dragHandleRef = useRef<HTMLElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [closestEdge, setClosestEdge] = useState<'top' | 'bottom' | null>(null);
    const [isCenterHighlighted, setIsCenterHighlighted] = useState(false);

    const isGroupMemberDragging = tab.groupId !== -1 && tab.groupId === draggingGroupId;

    useEffect(() => {
        const el = ref.current;
        if (!el || tab.id === undefined) return;

        const payload: TabDragPayload = {
            type: 'tab',
            tabId: tab.id,
            globalIndex,
            chromeIndex: tab.index,
            groupId: tab.groupId,
            pinned: tab.pinned,
        };

        return combine(
            draggable({
                element: el,
                dragHandle: dragHandleRef.current || undefined,
                getInitialData: () => (payload as unknown) as Record<string, unknown>,
                getInitialDataForExternal: () => {
                    const url = tab.url || '';
                    return { 'text/plain': url, 'text/uri-list': url };
                },
                onDragStart: () => setIsDragging(true),
                onDrop: () => setIsDragging(false),
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
                        edge = null; // Tri-State Center Hit!
                    }

                    return attachClosestEdge(
                        (payload as unknown) as Record<string | symbol, unknown>,
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

                    if (args.source.data.type === 'tab') {
                        onDropTab(
                            args.source.data as unknown as TabDragPayload,
                            args.self.data as unknown as TabDragPayload,
                            isCenter ? null : (extractClosestEdge(args.self.data) as Edge | null)
                        );
                    } else if (args.source.data.type === 'group-header') {
                        const edge = extractClosestEdge(args.self.data) || (relativeY < height / 2 ? 'top' : 'bottom');
                        onDropGroupToTab(
                            args.source.data as unknown as GroupDragPayload,
                            args.self.data as unknown as TabDragPayload,
                            edge
                        );
                    }
                },
            })
        );
    }, [tab.id, tab.groupId, tab.index, tab.pinned, tab.url, globalIndex, onDropTab, onDropGroupToTab]);

    const content = (
        <TabRow
            data={chromeTabToRowData(tab, activeTabId)}
            onClose={(e) => handleClose(e, tab)}
            onReadLater={(e) => handleReadLater(e, tab)}
            isDragging={isDragging || isGroupMemberDragging}
            isCenterHighlighted={isCenterHighlighted}
            closestEdge={closestEdge}
            isDuplicate={isDuplicate}
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

DraggableTabItem.displayName = 'DraggableTabItem';
