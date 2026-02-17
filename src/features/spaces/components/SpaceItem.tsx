import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Calendar, Layers, Pin } from 'lucide-react';
import { db, type Space, spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TabRow } from '@/features/tabs';
import { useAppStore } from '@/store/appStore';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/Tooltip';

interface SpaceItemProps {
    space: Space;
}

export const SpaceItem = React.memo(({ space }: SpaceItemProps) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const { toast } = useToast();
    const nameRef = React.useRef<HTMLHeadingElement>(null);
    const [isTruncated, setIsTruncated] = React.useState(false);

    // Check if the name text is visually truncated
    React.useEffect(() => {
        const el = nameRef.current;
        if (!el) return;

        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();

        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    }, [space.name]);

    // Subscribe to activeSpaces for this space
    const activeWindowId = useAppStore((state) => space.id ? state.activeSpaces[space.id] : undefined);
    const unregisterWindow = useAppStore((state) => state.unregisterWindow);
    const isActive = !!activeWindowId;

    // Fetch tabs only for this space
    const tabs = useLiveQuery(
        () => db.tabs.where({ spaceId: space.id }).sortBy('order'),
        [space.id]
    );

    const { deleteWithUndo: deleteTab } = useUndoDelete(db.tabs);

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

    const handlePin = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (space.id) spaceService.toggleSpacePin(space.id);
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
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

    const formatDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const handleDeleteTab = async (e: React.MouseEvent, tabId: number) => {
        e.stopPropagation();
        await deleteTab(tabId, "Tab deleted");
    };

    return (
        <div className="border-b border-border/40 group">
            {/* Header */}
            <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent transition-colors duration-150"
                onClick={handleClick}
            >
                {/* Expand/Collapse Toggle */}
                <button
                    onClick={handleToggle}
                    className="p-1 rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors"
                >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Active Status Dot */}
                {isActive && (
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" title="Window is open" />
                )}

                <div className="flex-1 min-w-0">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <h3 ref={nameRef} className="text-sm font-medium truncate">{space.name}</h3>
                            </TooltipTrigger>
                            {isTruncated && (
                                <TooltipContent side="top">
                                    {space.name}
                                </TooltipContent>
                            )}
                        </Tooltip>
                    </TooltipProvider>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {tabs?.length || 0} tabs
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(space.createdAt)}
                        </span>
                    </div>
                </div>

                {/* Actions (Visible on Hover) */}
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleClick(); }}
                        className="p-2 rounded-md hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                        title={isActive ? "Focus Window" : "Restore Space"}
                    >
                        <ExternalLink className="w-4 h-4" />
                    </button>
                    {/* Pin Action */}
                    <button
                        onClick={handlePin}
                        className={`p-2 rounded-md transition-colors ${space.isPinned ? 'text-blue-500 opacity-100' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'}`}
                        title={space.isPinned ? "Unpin Space" : "Pin Space"}
                    >
                        <Pin className={`w-4 h-4 ${space.isPinned ? 'fill-current' : ''}`} />
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-2 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete Space"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Accordion Body */}
            {isOpen && tabs && (
                <div className="bg-muted/30 pl-10 pr-4 py-2 space-y-0.5 animate-in slide-in-from-top-2 fade-in duration-200">
                    {tabs.map((tab) => (
                        <TabRow
                            key={tab.id}
                            tab={tab}
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
