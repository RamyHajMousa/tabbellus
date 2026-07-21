import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Calendar, Layers, Pin, Pencil, Download } from 'lucide-react';
import { type Space, spaceService, dataService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TabRow, savedTabToRowData } from '@/features/tabs';
import { useAppStore } from '@/store/appStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';
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

export const SpaceItem = React.memo(({ space, isExpanded }: SpaceItemProps) => {
    const [isOpen, setIsOpen] = React.useState(isExpanded ?? false);

    React.useEffect(() => {
        if (isExpanded !== undefined) {
            setIsOpen(isExpanded);
        }
    }, [isExpanded]);

    const { toast } = useToast();

    // Editing State
    const [isEditing, setIsEditing] = React.useState(false);
    const [newName, setNewName] = React.useState(space.name);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const isRenamingRef = React.useRef(false);

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

    // Focus input when entering edit mode
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleClick = async () => {
        if (isEditing) return; // Prevent navigation while editing
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

    const handleRename = async () => {
        if (space.id && newName.trim() !== space.name) {
            await spaceService.updateSpaceName(space.id, newName);
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setNewName(space.name); // Revert
            setIsEditing(false);
        }
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
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" title="Window is open" />
                )}
            </InteractiveRow.Leading>

            {/* Content */}
            <InteractiveRow.Title
                subTitle={!isEditing && (
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
                {isEditing ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:outline-none focus:ring-0 text-foreground"
                    />
                ) : (
                    <span className="text-sm font-semibold text-foreground">
                        {space.name}
                    </span>
                )}
            </InteractiveRow.Title>

            {/* Actions (Visible on Hover) */}
            <InteractiveRow.Actions className="bg-background group-hover:bg-accent gap-0.5 px-1 py-0.5">
                <InteractiveRow.Action
                    icon={ExternalLink}
                    onClick={handleClick}
                    title={isActive ? "Focus Window" : "Restore Space"}
                    variant="primary"
                />
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
                <ContextMenuContent
                    className="w-48"
                    onCloseAutoFocus={(e) => {
                        if (isRenamingRef.current) {
                            e.preventDefault();
                            isRenamingRef.current = false;
                            setTimeout(() => {
                                inputRef.current?.focus();
                                inputRef.current?.select();
                            }, 50);
                        }
                    }}
                >
                    <ContextMenuItem onClick={handleClick}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {isActive ? 'Focus Window' : 'Restore Space'}
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => {
                            isRenamingRef.current = true;
                            setIsEditing(true);
                            setNewName(space.name);
                        }}
                    >
                        <Pencil className="mr-2 h-4 w-4" />
                        Rename
                    </ContextMenuItem>
                    <ContextMenuSeparator />
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
});
