import { useState, useMemo } from 'react';
import { useSpaces } from './useSpaces';
import { Virtuoso } from 'react-virtuoso';
import { Layers } from 'lucide-react';
import { SpaceItem } from './components/SpaceItem';
import { SpacesToolbar } from './components/SpacesToolbar';
import { spaceService } from '@/lib/spaceService';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';

export const SpaceList = () => {
    const rawSpaces = useSpaces();
    const [sortOrder, setSortOrder] = useState<'newest' | 'alpha'>('newest');
    const [isAllExpanded, setIsAllExpanded] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newSpaceName, setNewSpaceName] = useState('');

    const sortedSpaces = useMemo(() => {
        if (!rawSpaces) return [];
        if (sortOrder === 'alpha') {
            return [...rawSpaces].sort((a, b) => a.name.localeCompare(b.name));
        }
        return [...rawSpaces].sort((a, b) => b.createdAt - a.createdAt);
    }, [rawSpaces, sortOrder]);

    const handleCreateSpace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSpaceName.trim()) return;
        try {
            await spaceService.captureCurrentWindow(newSpaceName.trim());
            setNewSpaceName('');
            setIsAddDialogOpen(false);
        } catch (error) {
            console.error('Failed to create space:', error);
        }
    };

    const handleToggleSort = () => {
        setSortOrder((prev) => (prev === 'newest' ? 'alpha' : 'newest'));
    };

    const handleToggleExpandAll = () => {
        setIsAllExpanded((prev) => !prev);
    };

    return (
        <div className="flex flex-col h-full bg-background select-none">
            <SpacesToolbar
                onAddSpace={() => setIsAddDialogOpen(true)}
                sortOrder={sortOrder}
                onToggleSort={handleToggleSort}
                isAllExpanded={isAllExpanded}
                onToggleExpandAll={handleToggleExpandAll}
            />

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="max-w-sm p-5">
                    <form onSubmit={handleCreateSpace}>
                        <DialogHeader className="mb-3">
                            <DialogTitle className="text-sm font-semibold">Create New Space</DialogTitle>
                            <DialogDescription className="text-xs">
                                Save all open tabs in this window to a new space.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-2">
                            <input
                                autoFocus
                                type="text"
                                value={newSpaceName}
                                onChange={(e) => setNewSpaceName(e.target.value)}
                                placeholder="Space name..."
                                className="w-full h-8 px-3 rounded-md border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                        </div>

                        <DialogFooter className="mt-4 flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddDialogOpen(false)}
                                className="h-7 px-3 text-xs font-medium border border-input bg-background hover:bg-accent text-foreground rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!newSpaceName.trim()}
                                className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 rounded-md transition-colors"
                            >
                                Create Space
                            </button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <div className="flex-1 min-h-0">
                {sortedSpaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                        <Layers className="w-8 h-8 opacity-20 mb-2" />
                        <p className="text-sm">No spaces captured yet</p>
                    </div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%', width: '100%' }}
                        totalCount={sortedSpaces.length}
                        computeItemKey={(index) => sortedSpaces[index].id!}
                        itemContent={(index) => (
                            <SpaceItem
                                space={sortedSpaces[index]}
                                isExpanded={isAllExpanded}
                            />
                        )}
                    />
                )}
            </div>
        </div>
    );
};
