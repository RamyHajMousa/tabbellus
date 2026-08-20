import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Calendar, Layers, Pin, Pencil, Download, Copy, FolderOutput, CopyPlus, Clock, Link, FolderPlus } from 'lucide-react';
import { type Space, type Tab, spaceService, readLaterService, dataService, getGroupColorClasses, tabService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { useClipboard } from '@/hooks/useClipboard';
import { TabRow, savedTabToRowData } from '@/features/tabs';
import { useAppStore } from '@/store/appStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';
import { EditSpaceDialog } from './EditSpaceDialog';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { SpaceSelectorModal } from './SpaceSelectorModal';

interface SpaceItemProps {
    space: Space;
    isExpanded?: boolean;
}

const SpaceItemComponent = ({ space, isExpanded }: SpaceItemProps) => {
    const [isOpen, setIsOpen] = React.useState(isExpanded ?? false);
    const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
    const [dialogState, setDialogState] = React.useState<{
        isOpen: boolean;
        tab: Tab | null;
        mode: 'move' | 'copy';
    }>({ isOpen: false, tab: null, mode: 'move' });

    React.useEffect(() => {
        if (isExpanded !== undefined) {
            setIsOpen(isExpanded);
        }
    }, [isExpanded]);

    const { toast } = useToast();
    const { copy } = useClipboard();

    // Subscribe to activeSpaces and settings for this space
    const activeWindowId = space.id ? useAppStore((state) => state.activeSpaces[space.id!]) : undefined;
    const spaceRestoreTrigger = useAppStore((state) => state.settings.spaceRestoreTrigger);
    const unregisterWindow = useAppStore((state) => state.unregisterWindow);
    const isActive = !!activeWindowId;

    // Fetch tabs only for this space
    const tabs = useLiveQuery(
        spaceService.getTabsForSpaceQuery(space.id),
        [space.id]
    );

    const { deleteWithUndo: deleteTab } = useUndoDelete({
        fetch: (id) => spaceService.getTabById(id),
        delete: (id) => spaceService.deleteTab(id),
        restore: (tab) => spaceService.restoreTab(tab),
    });

    const handleClick = React.useCallback(async () => {
        if (!space.id) return;

        if (isActive && activeWindowId) {
            // Focus the existing window
            try {
                await chrome.windows.update(activeWindowId, { focused: true });
            } catch {
                // Window doesn't exist anymore, self-heal
                unregisterWindow(activeWindowId);
                // Restore instead
                await spaceService.restoreSpace(space.id);
            }
        } else {
            // Restore (opens in new window)
            await spaceService.restoreSpace(space.id);
        }
    }, [space.id, isActive, activeWindowId, unregisterWindow]);

    const handleHeaderClick = React.useCallback(() => {
        if (spaceRestoreTrigger === 'double') {
            setIsOpen((prev) => !prev);
        } else {
            handleClick();
        }
    }, [spaceRestoreTrigger, handleClick]);

    const handleHeaderDoubleClick = React.useCallback(() => {
        if (spaceRestoreTrigger === 'double') {
            handleClick();
        }
    }, [spaceRestoreTrigger, handleClick]);

    const handleAppendToCurrentWindow = React.useCallback(async (e?: React.MouseEvent<HTMLElement>) => {
        if (e) {
            e.stopPropagation();
            e.currentTarget.blur();
        }
        if (!space.id) return;

        try {
            const currentWin = await chrome.windows.getCurrent();
            if (!currentWin?.id) {
                toast('Failed to find current window');
                return;
            }

            const result = await spaceService.appendSpaceTabsToWindow(space.id, currentWin.id);
            if (result.total === 0) {
                toast('No tabs to append', { description: 'This space does not contain any saved tabs.' });
                return;
            }

            if (result.appended > 0 && result.skipped === 0) {
                const label = result.appended === 1 ? '1 tab' : `${result.appended} tabs`;
                toast(`Appended ${label} to current window`);
            } else if (result.appended > 0 && result.skipped > 0) {
                const appLabel = result.appended === 1 ? '1 tab' : `${result.appended} tabs`;
                const skipLabel = result.skipped === 1 ? '1 already open' : `${result.skipped} already open`;
                toast(`Appended ${appLabel} (${skipLabel})`);
            } else if (result.appended === 0 && result.skipped > 0) {
                const allLabel = result.skipped === 1 ? 'Tab is' : `All ${result.skipped} tabs are`;
                toast(`${allLabel} already open in this window`);
            }
        } catch (err) {
            console.error('Failed to append tabs to window', err);
            toast('Failed to append tabs to window');
        }
    }, [space.id, toast]);

    const handleCopyAllUrls = React.useCallback(async (e?: React.MouseEvent<HTMLElement>) => {
        if (e) {
            e.stopPropagation();
            e.currentTarget.blur();
        }
        if (!space.id) return;

        try {
            const spaceTabs = await spaceService.getTabsForSpace(space.id);
            const urls = spaceTabs.map((t) => t.url).filter(Boolean);

            if (urls.length === 0) {
                toast('No tabs to copy', { description: 'This space does not contain any saved tabs.' });
                return;
            }

            // Strictly join using newlines producing multi-line individual lines
            const text = urls.join('\n');
            await copy(text);
            const label = urls.length === 1 ? '1 URL' : `${urls.length} URLs`;
            toast(`Copied ${label} to clipboard`);
        } catch (err) {
            console.error('Failed to copy space URLs', err);
            toast('Failed to copy URLs');
        }
    }, [space.id, copy, toast]);

    const handlePin = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (space.id) spaceService.toggleSpacePin(space.id);
    }, [space.id]);

    const handleDuplicate = React.useCallback(async (e?: React.MouseEvent<HTMLElement>) => {
        if (e) {
            e.stopPropagation();
            e.currentTarget.blur();
        }
        if (!space.id) return;

        try {
            await spaceService.duplicateSpace(space.id);
            toast(`Space "${space.name}" duplicated`);
        } catch {
            toast('Failed to duplicate space', { description: 'An error occurred while copying space.' });
        }
    }, [space.id, space.name, toast]);

    const handleToggle = React.useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
    }, []);

    const handleDelete = React.useCallback(async (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (!space.id) return;

        // 1. Soft Delete
        await spaceService.softDeleteSpace(space.id);

        // 2. Show Toast with Undo
        toast(`Space "${space.name}" deleted`, {
            duration: 10000,
            onUndo: () => {
                if (space.id) spaceService.undoDeleteSpace(space.id);
            }
        });

        // 3. Set Hard Delete Timer (Optimistic cleanup)
        setTimeout(async () => {
            // Check if it's still deleted before hard deleting
            const current = await spaceService.getSpaceById(space.id!);
            if (current && current.deletedAt) {
                await spaceService.hardDeleteSpace(space.id!);
            }
        }, 10001);
    }, [space.id, space.name, toast]);

    const formatDate = React.useCallback((ts: number) => new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric'
    }), []);

    const handleDeleteTab = React.useCallback(async (e: React.MouseEvent, tabId: number) => {
        e.stopPropagation();
        await deleteTab(tabId, "Tab deleted");
    }, [deleteTab]);

    const handleOpenTab = React.useCallback((url?: string) => {
        if (url) {
            tabService.focusOrCreate(url).catch(() => {});
        }
    }, []);

    const handleReadLater = React.useCallback(async (tab: { url?: string; title?: string; favicon?: string }) => {
        if (!tab.url) return;
        try {
            await readLaterService.addFromTab({
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favicon
            });
            toast('Saved to Read Later', { description: tab.title || tab.url });
        } catch (err: unknown) {
            const error = err as { name?: string; message?: string };
            if (error?.name === 'DuplicateReadLaterError' || error?.message?.includes('already in Read Later')) {
                toast('Already in Read Later', { description: 'This URL is already in your reading list.' });
            } else {
                toast('Failed to save to Read Later');
            }
        }
    }, [toast]);

    const headerRow = (
        <InteractiveRow
            size="md"
            className="group/space h-auto py-2 items-center"
            onClick={handleHeaderClick}
            onDoubleClick={handleHeaderDoubleClick}
        >
            {/* Expand/Collapse Toggle, Color Badge, Pin & Active Dot */}
            <InteractiveRow.Leading>
                <button
                    onClick={handleToggle}
                    className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {space.color && (
                    <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getGroupColorClasses(space.color).badge}`}
                    />
                )}
                {space.isPinned && (
                    <Pin className="w-3.5 h-3.5 text-primary fill-current flex-shrink-0" />
                )}
                {isActive && (
                    <TooltipSimple content="Window is open">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                    </TooltipSimple>
                )}
            </InteractiveRow.Leading>

            {/* Content */}
            <InteractiveRow.Title
                className="text-sm font-semibold text-foreground"
                subTitle={(
                    <span className="flex items-center gap-3 text-xxs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                        <span className="flex items-center gap-1">
                            <Layers className="w-2.5 h-2.5" />
                            {tabs?.length || 0} tabs
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-2.5 h-2.5" />
                            {formatDate(space.createdAt)}
                        </span>
                    </span>
                )}
            >
                <span className="whitespace-nowrap">{space.name}</span>
            </InteractiveRow.Title>

            {/* Actions (Visible on Hover) */}
            <InteractiveRow.Actions className="bg-background group-hover/space:bg-accent group-hover/space:opacity-100 group-hover/space:pointer-events-auto gap-0.5 px-1 py-0.5">
                <TooltipSimple content={space.isPinned ? "Unpin Space" : "Pin Space"} side="top">
                    <InteractiveRow.Action
                        icon={Pin}
                        onClick={handlePin}
                        className={space.isPinned ? 'fill-current text-primary' : ''}
                    />
                </TooltipSimple>
                <TooltipSimple content={isActive ? "Focus Window" : "Restore Space"} side="top">
                    <InteractiveRow.Action
                        icon={ExternalLink}
                        onClick={handleClick}
                        variant="primary"
                    />
                </TooltipSimple>
            </InteractiveRow.Actions>
        </InteractiveRow>
    );

    return (
        <div className="border-b border-border">
            {/* Header with Context Menu */}
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {headerRow}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-60">
                    <ContextMenuItem onClick={handleClick}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {isActive ? 'Focus Window' : 'Restore Space'}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleAppendToCurrentWindow}>
                        <FolderPlus className="mr-2 h-4 w-4" />
                        Append Tabs to Current Window
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => setTimeout(() => setIsEditDialogOpen(true), 10)}
                    >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Space
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={handleDuplicate}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate Space
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handlePin}>
                        <Pin className={`mr-2 h-4 w-4 ${space.isPinned ? 'fill-current' : ''}`} />
                        {space.isPinned ? 'Unpin Space' : 'Pin Space'}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleCopyAllUrls}>
                        <Link className="mr-2 h-4 w-4" />
                        Copy All URLs
                    </ContextMenuItem>
                    <ContextMenuItem
                        onClick={() => space.id && dataService.exportSpaceAsJson(space.id)}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Export to JSON
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onClick={handleDelete}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Space
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Controlled Edit Space Dialog */}
            {isEditDialogOpen && (
                <EditSpaceDialog
                    space={space}
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                />
            )}

            {dialogState.isOpen && (
                <SpaceSelectorModal
                    isOpen={dialogState.isOpen}
                    onClose={() => setDialogState({ isOpen: false, tab: null, mode: 'move' })}
                    tab={dialogState.tab!}
                    currentSpaceId={space.id!}
                    mode={dialogState.mode}
                />
            )}

            {/* Accordion Body */}
            {isOpen && tabs && (
                <div className="bg-transparent pl-8 pr-4 py-1.5 space-y-0.5 border-l border-border animate-in slide-in-from-top-2 fade-in duration-200 ml-4 mb-1">
                    {tabs.map((tab) => (
                        <ContextMenu key={tab.id}>
                            <ContextMenuTrigger asChild>
                                <TabRow
                                    data={savedTabToRowData(tab)}
                                    onDelete={(e) => tab.id && handleDeleteTab(e, tab.id)}
                                    disableContextMenu
                                />
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-52">
                                <ContextMenuItem onClick={() => handleOpenTab(tab.url)}>
                                    <ExternalLink className="mr-2 h-4 w-4 text-muted-foreground" />
                                    Open Tab
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() => setTimeout(() => setDialogState({ isOpen: true, tab, mode: 'move' }), 50)}>
                                    <FolderOutput className="mr-2 h-4 w-4 text-muted-foreground" />
                                    Move to Space...
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() => setTimeout(() => setDialogState({ isOpen: true, tab, mode: 'copy' }), 50)}>
                                    <CopyPlus className="mr-2 h-4 w-4 text-muted-foreground" />
                                    Copy to Space...
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => handleReadLater(tab)}>
                                    <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                                    Send to Read Later
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => tab.url && copy(tab.url)}>
                                    <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
                                    Copy URL
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                    onClick={(e) => tab.id && handleDeleteTab(e, tab.id)}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                    Delete from Space
                                </ContextMenuItem>
                            </ContextMenuContent>
                        </ContextMenu>
                    ))}
                    {tabs.length === 0 && (
                        <p className="text-xs text-muted-foreground italic py-2">No saved tabs</p>
                    )}
                </div>
            )}
        </div>
    );
};

const arePropsEqual = (prevProps: SpaceItemProps, nextProps: SpaceItemProps) => {
    return (
        prevProps.isExpanded === nextProps.isExpanded &&
        prevProps.space.id === nextProps.space.id &&
        prevProps.space.name === nextProps.space.name &&
        prevProps.space.color === nextProps.space.color &&
        prevProps.space.isPinned === nextProps.space.isPinned &&
        prevProps.space.createdAt === nextProps.space.createdAt &&
        prevProps.space.deletedAt === nextProps.space.deletedAt
    );
};

export const SpaceItem = React.memo(SpaceItemComponent, arePropsEqual);

