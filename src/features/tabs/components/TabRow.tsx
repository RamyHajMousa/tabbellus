import React, { useState } from 'react';
import { X, Clock, Trash2, Copy, Pin, PinOff, VolumeX, Volume2, Lock, Unlock, Snowflake, CopyPlus, FolderPlus, Moon, Loader2, Play, Pause } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { SpaceSelectorModal } from '@/features/spaces/components/SpaceSelectorModal';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { type RowTabData } from '../types';
import { InteractiveRow } from './InteractiveRow';
import { AnimatedAudioIcon } from './AnimatedAudioIcon';
import { useTabLockStore } from '../store/tabLockStore';
import { useActiveMediaSession } from '../hooks/useActiveMediaSession';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/Toaster';
import { getReadLaterShortcutText, tabService } from '@/lib';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
} from '@/components/ui/context-menu';

interface TabRowProps {
    data: RowTabData;
    isActive?: boolean;
    onClose?: (e: React.MouseEvent) => void;
    onReadLater?: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
    isDragging?: boolean;
    isCenterHighlighted?: boolean;
    closestEdge?: 'top' | 'bottom' | null;
    isDuplicate?: boolean;
    disableContextMenu?: boolean;
}

export const TabRow = React.memo(
    React.forwardRef<HTMLDivElement, TabRowProps>(({
        data,
        isActive: propIsActive,
        onClose,
        onReadLater,
        onDelete,
        isDragging,
        isCenterHighlighted,
        closestEdge,
        isDuplicate,
        disableContextMenu,
        ...props
    }, ref) => {
        const { copy } = useClipboard();
        const { toast } = useToast();
        const showDomain = useAppStore((state) => state.settings.showDomain);
        const isActive = propIsActive ?? data.isActive;
        const canAddToSpace = data.source === 'active';
        const [isSpaceSelectorOpen, setIsSpaceSelectorOpen] = useState(false);

        const mediaState = useActiveMediaSession(
            (state) => data.chromeTabId !== undefined ? state.mediaSessions[data.chromeTabId] : undefined
        );
        const togglePlayback = useActiveMediaSession((state) => state.togglePlayback);

        const isPausedSession = mediaState === 'paused';
        const isAudibleOrPlaying = Boolean(data.audible) || mediaState === 'playing';
        const showMediaControl = (isAudibleOrPlaying || isPausedSession) && typeof data.chromeTabId === 'number' && data.chromeTabId > 0;
        const isPlaying = isPausedSession ? false : true;

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

        const rowContent = (
            <InteractiveRow
                ref={ref}
                size="md"
                isActive={isActive}
                isDragging={isDragging}
                closestEdge={closestEdge}
                className={`group/tab ${data.discarded ? "opacity-50 grayscale" : ""} ${isCenterHighlighted ? "bg-primary/10 ring-1 ring-primary" : ""} ${isDuplicate ? "bg-destructive/5" : ""}`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (data.source === 'saved') {
                        if (data.url) {
                            tabService.focusOrCreate(data.url).catch(() => { });
                        }
                    } else if (data.chromeTabId !== undefined) {
                        chrome.tabs.update(data.chromeTabId, { active: true }).catch(() => { });
                    }
                }}
                {...props}
            >
                {/* Leading */}
                <InteractiveRow.Leading>
                    {isLocked && (
                        <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    {data.status === 'loading' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                    ) : (
                        <SmartFallbackIcon url={data.url} favicon={data.favicon} className="w-4 h-4 rounded-sm flex-shrink-0" />
                    )}

                    {/* Suspension Indicator */}
                    {data.discarded && (
                        <TooltipSimple content="Tab is suspended (~150 MB saved)">
                            <Moon className="w-3.5 h-3.5 text-muted-foreground/60 ml-1 flex-shrink-0" />
                        </TooltipSimple>
                    )}

                    {/* Audio Indicator Toggle */}
                    {(data.mutedInfo?.muted || data.audible || isPausedSession) && (
                        <TooltipSimple content={data.mutedInfo?.muted ? "Unmute Tab" : "Mute Tab"}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (typeof data.chromeTabId === 'number' && data.chromeTabId > 0) {
                                        chrome.tabs.update(data.chromeTabId, { muted: !data.mutedInfo?.muted }).catch(() => {});
                                    }
                                }}
                                className="flex-shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors z-0"
                            >
                                {data.mutedInfo?.muted ? (
                                    <VolumeX className="w-3.5 h-3.5" />
                                ) : (
                                    <AnimatedAudioIcon isPaused={isPausedSession} />
                                )}
                            </button>
                        </TooltipSimple>
                    )}
                </InteractiveRow.Leading>

                {/* Title */}
                <InteractiveRow.Title
                    className={isActive ? 'text-foreground' : 'text-foreground/90'}
                    subTitle={
                        showDomain && data.url ? (
                            <span className="truncate text-[10px] text-muted-foreground/70 leading-none mt-0.5">
                                {tryParseHost(data.url)}
                            </span>
                        ) : undefined
                    }
                >
                    <span className="whitespace-nowrap">{data.title || data.url}</span>
                </InteractiveRow.Title>

                {/* Persistent Status Area */}
                <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground pr-2">
                    {isDuplicate && <Copy className="w-3 h-3 text-destructive/80" />}
                    {data.pinned && <Pin className="w-3.5 h-3.5" />}
                </div>

                {/* Actions */}
                <InteractiveRow.Actions
                    className={`gap-0.5 px-1 py-0.5 group-hover/tab:opacity-100 group-hover/tab:pointer-events-auto ${isActive ? 'bg-accent' : 'bg-background group-hover/tab:bg-accent'}`}
                >
                    {showMediaControl && (
                        <TooltipSimple content={isPlaying ? "Pause Playback" : "Resume Playback"} side="top">
                            <InteractiveRow.Action
                                icon={isPlaying ? Pause : Play}
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (typeof data.chromeTabId === 'number' && data.chromeTabId > 0) {
                                        await togglePlayback(data.chromeTabId);
                                    }
                                }}
                                variant="primary"
                            />
                        </TooltipSimple>
                    )}
                    {canAddToSpace && (
                        <TooltipSimple content="Save to Space..." side="top">
                            <InteractiveRow.Action
                                icon={FolderPlus}
                                onClick={(e) => { e.stopPropagation(); setIsSpaceSelectorOpen(true); }}
                                variant="primary"
                            />
                        </TooltipSimple>
                    )}

                    {onReadLater && (
                        <TooltipSimple content={`Read Later (${getReadLaterShortcutText()})`} side="top">
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

                {isSpaceSelectorOpen && (
                    <SpaceSelectorModal
                        isOpen={isSpaceSelectorOpen}
                        onClose={() => setIsSpaceSelectorOpen(false)}
                        mode="save"
                        tab={data}
                    />
                )}
            </InteractiveRow>
        );

        if (disableContextMenu) {
            return rowContent;
        }

        return (
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {rowContent}
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
                                    setIsSpaceSelectorOpen(true);
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
                            <span>Read Later</span>
                            <ContextMenuShortcut>{getReadLaterShortcutText()}</ContextMenuShortcut>
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
        );
    }),
    (prevProps, nextProps) => {
    return (
        prevProps.isActive === nextProps.isActive &&
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.isCenterHighlighted === nextProps.isCenterHighlighted &&
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
        prevProps.data.mutedInfo?.muted === nextProps.data.mutedInfo?.muted &&
        prevProps.data.status === nextProps.data.status &&
        prevProps.isDuplicate === nextProps.isDuplicate &&
        prevProps.disableContextMenu === nextProps.disableContextMenu
    );
});
TabRow.displayName = 'TabRow';

function tryParseHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}
