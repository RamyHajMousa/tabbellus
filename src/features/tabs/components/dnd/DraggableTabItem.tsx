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
}

export const DraggableTabItem = memo(({
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
}: DraggableTabItemProps) => {
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
    }, [tab.id, tab.groupId, tab.index, tab.pinned, tab.url, globalIndex, onDropTab, onDropGroupToTab]);

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

DraggableTabItem.displayName = 'DraggableTabItem';
