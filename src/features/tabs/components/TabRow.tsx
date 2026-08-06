import React from 'react';
import { X, Clock, Trash2, Copy, GripVertical, Pin, VolumeX, Lock } from 'lucide-react';
import { tabService } from '@/lib';
import { useClipboard } from '@/hooks/useClipboard';
import { AddToSpaceMenu } from '@/features/spaces/components/AddToSpaceMenu';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { type RowTabData } from '../types';
import { InteractiveRow } from './InteractiveRow';
import { AnimatedAudioIcon } from './AnimatedAudioIcon';
import { useTabLockStore } from '../store/tabLockStore';
import { useToast } from '@/components/ui/Toaster';
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
    closestEdge?: 'top' | 'bottom' | null;
    dragHandleRef?: (element: HTMLElement | null) => void;
}

export const TabRow = React.memo(({ data, isActive: propIsActive, onClose, onReadLater, onDelete, isDragging, closestEdge, dragHandleRef }: TabRowProps) => {
    const { copy } = useClipboard();
    const { toast } = useToast();
    const isActive = propIsActive ?? data.isActive;
    const canAddToSpace = data.source === 'active';

    const isLocked = useTabLockStore((state) => data.chromeTabId !== undefined && state.lockedTabIds.includes(data.chromeTabId));
    const toggleLock = useTabLockStore((state) => state.toggleLock);

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

    const handleToggleLock = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (data.chromeTabId !== undefined) {
            const targetTabId = data.chromeTabId;
            const nextLocked = !isLocked;
            toggleLock(targetTabId, nextLocked);
            chrome.tabs.sendMessage(targetTabId, { action: 'SET_TAB_LOCK', isLocked: nextLocked }).catch((err) => {
                console.warn('Failed to dispatch SET_TAB_LOCK message to content script:', err);
                toast('Cannot lock tab protection', {
                    description: 'Tab protection is restricted on system pages or unavailable pages.'
                });
            });
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <InteractiveRow
                    size="md"
                    isActive={isActive}
                    isDragging={isDragging}
                    closestEdge={closestEdge}
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
                        {dragHandleRef && (
                            <span
                                ref={dragHandleRef}
                                className="opacity-0 group-hover:opacity-40 hover:!opacity-100 flex-shrink-0 cursor-grab active:cursor-grabbing transition-opacity -ml-1"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Drag to reorder"
                            >
                                <GripVertical className="w-3.5 h-3.5" />
                            </span>
                        )}
                        {isLocked && (
                            <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
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
                        <SmartFallbackIcon url={data.url} className={`w-4 h-4 opacity-50 flex-shrink-0 ${data.favicon ? 'hidden' : ''}`} />

                        {/* Audio Indicator Toggle */}
                        {(data.mutedInfo?.muted || data.audible) && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (data.chromeTabId !== undefined) {
                                        chrome.tabs.update(data.chromeTabId, { muted: !data.mutedInfo?.muted }).catch(() => {});
                                    }
                                }}
                                className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors z-0"
                                title={data.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab"}
                            >
                                {data.mutedInfo?.muted ? (
                                    <VolumeX className="w-3.5 h-3.5" />
                                ) : (
                                    <AnimatedAudioIcon />
                                )}
                            </button>
                        )}
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
                            <span className="whitespace-nowrap">{data.title || data.url}</span>
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
                            <TooltipSimple content="Read Later" side="top">
                                <InteractiveRow.Action
                                    icon={Clock}
                                    onClick={onReadLater}
                                    variant="primary"
                                />
                            </TooltipSimple>
                        )}
                        {onDelete && (
                            <TooltipSimple content="Delete Tab from Space" side="top">
                                <InteractiveRow.Action
                                    icon={Trash2}
                                    onClick={onDelete}
                                    variant="destructive"
                                />
                            </TooltipSimple>
                        )}
                        {onClose && (
                            <TooltipSimple content="Close Tab" side="top">
                                <InteractiveRow.Action
                                    icon={X}
                                    onClick={onClose}
                                    variant="destructive"
                                />
                            </TooltipSimple>
                        )}
                    </InteractiveRow.Actions>
                </InteractiveRow>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-48">
                {data.chromeTabId !== undefined && (
                    <>
                        <ContextMenuItem onClick={handleToggleLock}>
                            <Lock className="mr-2 h-4 w-4" />
                            {isLocked ? 'Unlock Tab' : 'Lock Tab'}
                        </ContextMenuItem>
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
}, (prevProps, nextProps) => {
    return (
        prevProps.isActive === nextProps.isActive &&
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.closestEdge === nextProps.closestEdge &&
        prevProps.data.id === nextProps.data.id &&
        prevProps.data.chromeTabId === nextProps.data.chromeTabId &&
        prevProps.data.isActive === nextProps.data.isActive &&
        prevProps.data.url === nextProps.data.url &&
        prevProps.data.title === nextProps.data.title &&
        prevProps.data.favicon === nextProps.data.favicon &&
        prevProps.data.pinned === nextProps.data.pinned &&
        prevProps.data.discarded === nextProps.data.discarded &&
        prevProps.data.audible === nextProps.data.audible &&
        prevProps.data.mutedInfo?.muted === nextProps.data.mutedInfo?.muted
    );
});

function tryParseHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}
