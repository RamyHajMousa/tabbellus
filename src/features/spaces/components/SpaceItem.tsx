import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Calendar, Layers, Pin, Pencil, Download, Copy } from 'lucide-react';
import { type Space, spaceService, dataService, getGroupColorClasses } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
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

interface SpaceItemProps {
    space: Space;
    isExpanded?: boolean;
}

const SpaceItemComponent = ({ space, isExpanded }: SpaceItemProps) => {
    const [isOpen, setIsOpen] = React.useState(isExpanded ?? false);
    const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);

    React.useEffect(() => {
        if (isExpanded !== undefined) {
            setIsOpen(isExpanded);
        }
    }, [isExpanded]);

    const { toast } = useToast();

    // Subscribe to activeSpaces for this space
    const activeWindowId = space.id ? useAppStore((state) => state.activeSpaces[space.id!]) : undefined;
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

    const handleClick = async () => {
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
    };

    const handlePin = (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (space.id) spaceService.toggleSpacePin(space.id);
    };

    const handleDuplicate = async (e?: React.MouseEvent<HTMLElement>) => {
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
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleDelete = async (e: React.MouseEvent<HTMLElement>) => {
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
    };

    const formatDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric'
    });

    const handleDeleteTab = async (e: React.MouseEvent, tabId: number) => {
        e.stopPropagation();
        await deleteTab(tabId, "Tab deleted");
    };

    const headerRow = (
        <InteractiveRow
            size="md"
            className="h-auto py-2 items-center"
            onClick={handleClick}
        >
            {/* Expand/Collapse Toggle & Active Dot */}
            <InteractiveRow.Leading>
                <button
                    onClick={handleToggle}
                    className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
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
                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                    {space.color && (
                        <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getGroupColorClasses(space.color).badge}`}
                        />
                    )}
                    <span className="truncate">{space.name}</span>
                </span>
            </InteractiveRow.Title>

            {/* Actions (Visible on Hover) */}
            <InteractiveRow.Actions className="bg-background group-hover:bg-accent gap-0.5 px-1 py-0.5">
                <TooltipSimple content="Duplicate Space" side="top">
                    <InteractiveRow.Action
                        icon={Copy}
                        onClick={handleDuplicate}
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
        <div className="border-b border-border group">
            {/* Header with Context Menu */}
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {headerRow}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={handleClick}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {isActive ? 'Focus Window' : 'Restore Space'}
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setIsEditDialogOpen(true);
                        }}
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
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    space={space}
                />
            )}

            {/* Accordion Body */}
            {isOpen && tabs && (
                <div className="bg-transparent pl-8 pr-4 py-1.5 space-y-0.5 border-l border-border animate-in slide-in-from-top-2 fade-in duration-200 ml-4 mb-1">
                    {tabs.map((tab) => (
                        <TabRow
                            key={tab.id}
                            data={savedTabToRowData(tab)}
                            onDelete={(e) => tab.id && handleDeleteTab(e, tab.id)}
                        />
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

