import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Calendar, Layers, Pin, Pencil } from 'lucide-react';
import { db, type Space, spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TabRow, savedTabToRowData } from '@/features/tabs';
import { useAppStore } from '@/store/appStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';

interface SpaceItemProps {
    space: Space;
}

export const SpaceItem = React.memo(({ space }: SpaceItemProps) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const { toast } = useToast();

    // Editing State
    const [isEditing, setIsEditing] = React.useState(false);
    const [newName, setNewName] = React.useState(space.name);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Subscribe to activeSpaces for this space
    const activeWindowId = space.id ? useAppStore((state) => state.activeSpaces[space.id!]) : undefined;
    const unregisterWindow = useAppStore((state) => state.unregisterWindow);
    const isActive = !!activeWindowId;

    // Fetch tabs only for this space
    const tabs = useLiveQuery(
        () => db.tabs.where({ spaceId: space.id }).sortBy('order'),
        [space.id]
    );

    const { deleteWithUndo: deleteTab } = useUndoDelete(db.tabs);

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

    const handlePin = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (space.id) spaceService.toggleSpacePin(space.id);
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleDelete = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (!space.id) return;

        // 1. Soft Delete
        await db.softDeleteSpace(space.id);

        // 2. Show Toast with Undo
        toast(`Space "${space.name}" deleted`, {
            duration: 10000,
            onUndo: () => {
                if (space.id) db.undoDeleteSpace(space.id);
            }
        });

        // 3. Set Hard Delete Timer (Optimistic cleanup)
        setTimeout(async () => {
            // Check if it's still deleted before hard deleting
            const current = await db.spaces.get(space.id!);
            if (current && current.deletedAt) {
                await db.hardDeleteSpace(space.id!);
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

    return (
        <div className="border-b border-border group">
            {/* Header */}
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

                {/* Passive Pin Indicator (Hidden on Hover) */}
                {space.isPinned && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-primary opacity-100 group-hover:opacity-0 transition-opacity p-2 pointer-events-none">
                        <Pin className="w-3.5 h-3.5 fill-current" />
                    </div>
                )}

                {/* Actions (Visible on Hover) */}
                <InteractiveRow.Actions className="bg-background group-hover:bg-accent gap-0.5">
                    {!isEditing && (
                        <InteractiveRow.Action
                            icon={Pencil}
                            onClick={() => {
                                setIsEditing(true);
                                setNewName(space.name); // Reset state to current name
                            }}
                            title="Rename Space"
                            variant="primary"
                        />
                    )}
                    <InteractiveRow.Action
                        icon={ExternalLink}
                        onClick={handleClick}
                        title={isActive ? "Focus Window" : "Restore Space"}
                        variant="primary"
                    />
                    {/* Pin Action */}
                    <InteractiveRow.Action
                        icon={Pin}
                        onClick={handlePin}
                        title={space.isPinned ? "Unpin Space" : "Pin Space"}
                        variant={space.isPinned ? "primary" : "neutral"}
                        className={space.isPinned ? "text-primary hover:text-primary fill-current" : ""}
                    />
                    <InteractiveRow.Action
                        icon={Trash2}
                        onClick={handleDelete}
                        title="Delete Space"
                        variant="destructive"
                    />
                </InteractiveRow.Actions>
            </InteractiveRow>

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
