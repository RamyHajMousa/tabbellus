import React, { useState } from 'react';
import { X, Clock, Trash2, Copy, GripVertical, Pin, PinOff, VolumeX, Volume2, Lock, Unlock, Snowflake, CopyPlus, FolderPlus } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { AddToSpaceMenu } from '@/features/spaces/components/AddToSpaceMenu';
import { SaveToSpaceDialog } from '@/features/spaces/components/SaveToSpaceDialog';
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
    const [isSaveToSpaceOpen, setIsSaveToSpaceOpen] = useState(false);

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
                toast('Tab cannot be locked right now', {
                    description: 'Try refreshing the page first. System pages (like chrome://) cannot be locked.'
                });
                toggleLock(targetTabId, !nextLocked); // Revert state
            });
        }
    };

    return (
        <>
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
                                if (data.url) {
                                    chrome.tabs.create({ url: data.url, active: true }).catch(() => { });
                                }
                            } else if (data.chromeTabId !== undefined) {
                                chrome.tabs.update(data.chromeTabId, { active: true }).catch(() => { });
                            }
                        }}
                    >
                        {/* Leading */}
                        <InteractiveRow.Leading>
                            <div className="flex items-center w-8 shrink-0">
                                {dragHandleRef && (
                                    <span
                                        ref={dragHandleRef}
                                        className="opacity-0 group-hover:opacity-40 hover:!opacity-100 flex-shrink-0 cursor-grab active:cursor-grabbing transition-opacity -ml-1 mr-1"
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label="Drag to reorder"
                                    >
                                        <GripVertical className="w-3.5 h-3.5" />
                                    </span>
                                )}
                                {isLocked && (
                                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                            </div>
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
                            <span className="whitespace-nowrap">{data.title || data.url}</span>
                        </InteractiveRow.Title>

                        {/* Persistent Status Area */}
                        <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground pr-2">
                            {data.pinned && <Pin className="w-3.5 h-3.5" />}
                        </div>

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
                                <TooltipSimple content={isLocked ? "Tab is locked" : "Delete Tab from Space"} side="top">
                                    <InteractiveRow.Action
                                        icon={Trash2}
                                        onClick={onDelete}
                                        variant="destructive"
                                        disabled={isLocked}
                                    />
                                </TooltipSimple>
                            )}
                            {onClose && (
                                <TooltipSimple content={isLocked ? "Tab is locked" : "Close Tab"} side="top">
                                    <InteractiveRow.Action
                                        icon={X}
                                        onClick={onClose}
                                        variant="destructive"
                                        disabled={isLocked}
                                    />
                                </TooltipSimple>
                            )}
                        </InteractiveRow.Actions>
                    </InteractiveRow>
                </ContextMenuTrigger>

                <ContextMenuContent className="w-48">
                    {data.chromeTabId !== undefined && (
                        <>
                            <ContextMenuItem onClick={handleTogglePin}>
                                {isPinned ? (
                                    <PinOff className="w-4 h-4 mr-2 text-muted-foreground" />
                                ) : (
                                    <Pin className="w-4 h-4 mr-2 text-muted-foreground" />
                                )}
                                {isPinned ? 'Unpin Tab' : 'Pin Tab'}
                            </ContextMenuItem>
                            <ContextMenuItem 
                                onClick={handleToggleLock}
                                disabled={data.discarded}
                            >
                                {isLocked ? (
                                    <Unlock className="w-4 h-4 mr-2 text-muted-foreground" />
                                ) : (
                                    <Lock className="w-4 h-4 mr-2 text-muted-foreground" />
                                )}
                                {isLocked ? 'Unlock Tab' : 'Lock Tab'}
                            </ContextMenuItem>
                            <ContextMenuItem
                                onSelect={() => {
                                    if (data.chromeTabId !== undefined) {
                                        chrome.tabs.update(data.chromeTabId, { muted: !data.mutedInfo?.muted }).catch(() => { });
                                    }
                                }}
                            >
                                {data.mutedInfo?.muted ? (
                                    <Volume2 className="w-4 h-4 mr-2 text-muted-foreground" />
                                ) : (
                                    <VolumeX className="w-4 h-4 mr-2 text-muted-foreground" />
                                )}
                                {data.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab"}
                            </ContextMenuItem>
                            <ContextMenuItem 
                                onClick={handleSuspend}
                                disabled={data.discarded}
                            >
                                <Snowflake className="w-4 h-4 mr-2 text-muted-foreground" />
                                Suspend Tab
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                        </>
                    )}

                    {data.chromeTabId !== undefined && (
                        <ContextMenuItem onClick={handleDuplicate}>
                            <CopyPlus className="w-4 h-4 mr-2 text-muted-foreground" />
                            Duplicate
                        </ContextMenuItem>
                    )}

                    {data.url && (
                        <ContextMenuItem onClick={handleCopy}>
                            <Copy className="w-4 h-4 mr-2 text-muted-foreground" />
                            Copy URL
                        </ContextMenuItem>
                    )}

                    {canAddToSpace && (
                        <ContextMenuItem
                            onSelect={(e) => {
                                e.preventDefault();
                                setTimeout(() => {
                                    setIsSaveToSpaceOpen(true);
                                }, 50);
                            }}
                        >
                            <FolderPlus className="w-4 h-4 mr-2 text-muted-foreground" />
                            Save to Space...
                        </ContextMenuItem>
                    )}

                    {onReadLater && (
                        <ContextMenuItem onClick={onReadLater}>
                            <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                            Read Later
                        </ContextMenuItem>
                    )}

                    {(onClose || onDelete) && (
                        <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                                onClick={onClose || onDelete}
                                className="text-destructive focus:text-destructive"
                                disabled={isLocked}
                            >
                                <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                                {onClose ? 'Close Tab' : 'Delete from Space'}
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenuContent>
            </ContextMenu>

            {isSaveToSpaceOpen && (
                <SaveToSpaceDialog
                    open={isSaveToSpaceOpen}
                    onOpenChange={setIsSaveToSpaceOpen}
                    tab={data}
                />
            )}
        </>
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
