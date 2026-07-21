import React from 'react';
import { Globe, X, Clock, Trash2, Copy, GripVertical, Pin, VolumeX } from 'lucide-react';
import { tabService } from '@/lib';
import { useClipboard } from '@/hooks/useClipboard';
import { AddToSpaceMenu } from '@/features/spaces/components/AddToSpaceMenu';
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { type RowTabData } from '../types';
import { InteractiveRow } from './InteractiveRow';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface TabRowProps {
    data: RowTabData;
    isActive?: boolean;
    onClose?: (e: React.MouseEvent) => void;
    onReadLater?: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
    isDragging?: boolean;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
}

export const TabRow = React.memo(({ data, isActive: propIsActive, onClose, onReadLater, onDelete, isDragging, dragHandleProps }: TabRowProps) => {
    const { copy } = useClipboard();
    const isActive = propIsActive ?? data.isActive;
    const canAddToSpace = data.source === 'active';

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.url) {
            copy(data.url);
        }
    };

    const isPinned = data.pinned;

    const handleDuplicate = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.chromeTabId) {
            chrome.tabs.duplicate(data.chromeTabId).catch(() => { });
        }
    };

    const handleSuspend = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.chromeTabId) {
            chrome.tabs.discard(data.chromeTabId).catch(() => { });
        }
    };

    const handleTogglePin = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.chromeTabId) {
            chrome.tabs.update(data.chromeTabId, { pinned: !isPinned }).catch(() => { });
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <InteractiveRow
                    size="md"
                    isActive={isActive}
                    isDragging={isDragging}
                    className={data.discarded ? "opacity-50 grayscale" : ""}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (data.source === 'saved') {
                            tabService.focusOrCreate(data.url).catch(() => { });
                        } else if (data.chromeTabId !== undefined) {
                            chrome.tabs.update(data.chromeTabId, { active: true }).catch(() => { });
                        }
                    }}
                >
                    {/* Leading */}
                    <InteractiveRow.Leading>
                        {dragHandleProps && (
                            <span
                                {...dragHandleProps}
                                className="opacity-0 group-hover:opacity-40 hover:!opacity-100 flex-shrink-0 cursor-grab active:cursor-grabbing transition-opacity -ml-1"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Drag to reorder"
                            >
                                <GripVertical className="w-3.5 h-3.5" />
                            </span>
                        )}
                        {data.favicon ? (
                            <img
                                src={data.favicon}
                                alt=""
                                className="w-4 h-4 rounded-sm flex-shrink-0"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                        ) : null}
                        <Globe className={`w-4 h-4 opacity-50 flex-shrink-0 ${data.favicon ? 'hidden' : ''}`} />
                    </InteractiveRow.Leading>

                    {/* Title */}
                    <InteractiveRow.Title
                        className={isActive ? 'text-foreground' : 'text-foreground/90'}
                        subTitle={
                            <span className="truncate text-[10px] text-muted-foreground/70 leading-none mt-0.5">
                                {tryParseHost(data.url)}
                            </span>
                        }
                    >
                        <span className="flex items-center gap-1 min-w-0">
                            {data.pinned && <Pin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                            {data.mutedInfo?.muted && <VolumeX className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                            <span className="truncate">{data.title || data.url}</span>
                        </span>
                    </InteractiveRow.Title>

                    {/* Actions */}
                    <InteractiveRow.Actions
                        className={`gap-0.5 px-1 py-0.5 ${isActive ? 'bg-accent' : 'bg-background group-hover:bg-accent'}`}
                    >
                        {canAddToSpace && (
                            <AddToSpaceMenu tab={data} />
                        )}

                        {onReadLater && (
                            <InteractiveRow.Action
                                icon={Clock}
                                onClick={onReadLater}
                                title="Read Later"
                                variant="primary"
                            />
                        )}
                        {onDelete && (
                            <InteractiveRow.Action
                                icon={Trash2}
                                onClick={onDelete}
                                title="Delete Tab from Space"
                                variant="destructive"
                            />
                        )}
                        {onClose && (
                            <InteractiveRow.Action
                                icon={X}
                                onClick={onClose}
                                title="Close Tab"
                                variant="destructive"
                            />
                        )}
                    </InteractiveRow.Actions>
                </InteractiveRow>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-48">
                {data.chromeTabId !== undefined && (
                    <>
                        <ContextMenuItem onClick={handleTogglePin}>
                            {isPinned ? 'Unpin Tab' : 'Pin Tab'}
                        </ContextMenuItem>
                        <ContextMenuItem
                            onSelect={() => {
                                if (data.chromeTabId !== undefined) {
                                    chrome.tabs.update(data.chromeTabId, { muted: !data.mutedInfo?.muted }).catch(() => { });
                                }
                            }}
                        >
                            {data.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab"}
                        </ContextMenuItem>
                        <ContextMenuItem onClick={handleDuplicate}>
                            Duplicate
                        </ContextMenuItem>
                        <ContextMenuItem onClick={handleSuspend}>
                            Suspend Tab
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>
                )}

                {data.url && (
                    <ContextMenuItem onClick={handleCopy}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy URL
                    </ContextMenuItem>
                )}

                {onReadLater && (
                    <ContextMenuItem onClick={onReadLater}>
                        <Clock className="mr-2 h-4 w-4" />
                        Read Later
                    </ContextMenuItem>
                )}

                {(onClose || onDelete) && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                            onClick={onClose || onDelete}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {onClose ? 'Close Tab' : 'Delete from Space'}
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
});

function tryParseHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}
