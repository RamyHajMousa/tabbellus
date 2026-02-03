import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Layers } from 'lucide-react';
import { db, type Space, spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TabRow } from '@/features/tabs';

interface SpaceItemProps {
    space: Space;
}

export const SpaceItem = React.memo(({ space }: SpaceItemProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const { toast } = useToast();

    // Fetch tabs only for this space
    const tabs = useLiveQuery(
        () => db.tabs.where({ spaceId: space.id }).sortBy('order'),
        [space.id]
    );

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

    const handleRestore = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (space.id) await spaceService.restoreSpace(space.id);
    };



    const handleDeleteTab = async (e: React.MouseEvent, tab: any) => {
        e.stopPropagation();
        if (!tab.id) return;

        // Snapshot for Undo
        const tabSnapshot = { ...tab };

        // Delete
        await db.tabs.delete(tab.id);

        // Toast with Undo
        toast(`Tab deleted`, {
            duration: 5000,
            onUndo: () => {
                db.tabs.add(tabSnapshot);
            }
        });
    };

    return (
        <div className="border-b border-border/40 group">
            {/* Header */}

            <div
                className="flex items-center gap-2 p-2 h-9 cursor-pointer hover:bg-accent/50 transition-colors duration-150 rounded-md mx-1"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground truncate">{space.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <span className="flex items-center gap-0.5">
                            <Layers className="w-3 h-3" />
                            {tabs?.length || 0}
                        </span>
                    </div>
                </div>

                {/* Actions (Visible on Hover) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={handleRestore}
                        className="p-1 rounded-sm hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        title="Restore Space"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-1 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete Space"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
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
                            onDelete={(e) => handleDeleteTab(e, tab)}
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
