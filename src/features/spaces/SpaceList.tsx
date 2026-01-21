import React, { useState } from 'react';
import { useSpaces } from './useSpaces';
import { db, type Space } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '@/components/ui/Toaster';
import { Virtuoso } from 'react-virtuoso';
import { ChevronDown, ChevronRight, Trash2, ExternalLink, Calendar, Layers, Globe } from 'lucide-react';
import { spaceService } from '@/lib/spaceService';
import { tabService } from '@/lib/tabService';

// Individual Space Item Component for better performance
const SpaceItem = ({ space }: { space: Space }) => {
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

    const formatDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    return (
        <div className="border-b border-border/40 group">
            {/* Header */}
            <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent transition-colors duration-150"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate">{space.name}</h3>
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
                        onClick={handleRestore}
                        className="p-2 rounded-md hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                        title="Restore Space"
                    >
                        <ExternalLink className="w-4 h-4" />
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
                        <div
                            key={tab.id}
                            className="flex items-center gap-2 py-1.5 px-2 -ml-2 rounded-md text-sm text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50 cursor-pointer transition-all duration-200 border-l-2 border-transparent hover:border-primary/50"
                            onClick={(e) => {
                                e.stopPropagation();
                                tabService.focusOrCreate(tab.url);
                            }}
                        >
                            {tab.favicon ? (
                                <img
                                    src={tab.favicon}
                                    alt=""
                                    className="w-4 h-4 rounded-sm flex-shrink-0"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                    }}
                                />
                            ) : null}
                            <Globe className={`w-4 h-4 text-zinc-600 flex-shrink-0 ${tab.favicon ? 'hidden' : ''}`} />
                            <span className="truncate">{tab.title || tab.url}</span>
                        </div>
                    ))}
                    {tabs.length === 0 && (
                        <p className="text-xs text-muted-foreground italic py-2">No saved tabs</p>
                    )}
                </div>
            )}
        </div>
    );
};

export const SpaceList = () => {
    const spaces = useSpaces();

    if (!spaces || spaces.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Layers className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-sm">No spaces captured yet</p>
            </div>
        );
    }

    return (
        <Virtuoso
            style={{ height: '100%', width: '100%' }}
            totalCount={spaces.length}
            itemContent={(index) => <SpaceItem space={spaces[index]} />}
        />
    );
};
