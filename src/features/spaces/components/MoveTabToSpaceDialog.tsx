import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';
import { Search, X, Folder } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';
import { useToast } from '@/components/ui/Toaster';
import { type Tab } from '@/lib';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface MoveTabToSpaceDialogProps {
    isOpen: boolean;
    onClose: () => void;
    tab: Tab | null;
    currentSpaceId: number;
    mode: 'move' | 'copy';
}

export function MoveTabToSpaceDialog({ isOpen, onClose, tab, currentSpaceId, mode }: MoveTabToSpaceDialogProps) {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Query spaces ordered by creation/pin, similar to main list but flat
    const allSpaces = useLiveQuery(spaceService.getSpacesOrderedQuery(), []);

    // Filter out current space and apply search query
    const filteredSpaces = useMemo(() => {
        if (!allSpaces) return [];
        return allSpaces.filter((space) => {
            if (space.id === currentSpaceId) return false;
            if (!searchQuery.trim()) return true;
            const normalizedQuery = searchQuery.toLowerCase().trim();
            const spaceName = space.name || 'Unnamed Space';
            return spaceName.toLowerCase().includes(normalizedQuery);
        });
    }, [allSpaces, currentSpaceId, searchQuery]);

    const handleSelectSpace = async (targetSpaceId: number, targetSpaceName: string) => {
        if (!tab || !tab.id) return;

        try {
            setError(null);
            if (mode === 'move') {
                const { originalOrder } = await spaceService.moveTabBetweenSpaces(tab.id, targetSpaceId);
                toast(`Moved tab to "${targetSpaceName}"`, {
                    onUndo: () => {
                        spaceService.restoreTabPosition(tab.id!, currentSpaceId, originalOrder)
                            .then(() => toast('Move undone', { description: 'Tab restored to original space.' }))
                            .catch(() => toast('Failed to undo', { description: 'Could not restore tab position.' }));
                    }
                });
            } else {
                await spaceService.copyTabToSpace(tab.id, targetSpaceId);
                toast(`Copied tab to "${targetSpaceName}"`);
            }
            onClose();
        } catch (err: any) {
            if (err?.message === 'DUPLICATE_TAB') {
                setError('Tab already exists in target space.');
            } else {
                setError(`Failed to ${mode} tab.`);
            }
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md p-0 overflow-hidden flex flex-col max-h-[80vh] gap-0">
                <DialogHeader className="px-4 py-3 border-b space-y-1">
                    <DialogTitle>{mode === 'move' ? 'Move to Space' : 'Copy to Space'}</DialogTitle>
                    <DialogDescription className="sr-only">
                        Select a target space to {mode} the tab.
                    </DialogDescription>
                </DialogHeader>

                <div className="p-2 border-b flex-shrink-0 flex flex-col gap-2">
                    <div className="relative flex items-center">
                        <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search spaces..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                if (error) setError(null);
                            }}
                            className="w-full h-9 pl-9 pr-9 bg-muted/50 border-none rounded-md text-sm outline-none focus-visible:ring-1 ring-ring placeholder:text-muted-foreground transition-shadow"
                        />
                        {searchQuery && (
                            <TooltipSimple content="Clear search">
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        if (error) setError(null);
                                    }}
                                    className="absolute right-2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus-visible:ring-1 ring-ring transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </TooltipSimple>
                        )}
                    </div>
                    {error && (
                        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md font-medium">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {filteredSpaces.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            {searchQuery ? 'No matching spaces found.' : 'No other spaces available.'}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {filteredSpaces.map(space => (
                                <button
                                    key={space.id}
                                    onClick={() => handleSelectSpace(space.id!, space.name || 'Unnamed Space')}
                                    className="flex items-center w-full px-3 py-2 text-left text-sm rounded-md hover:bg-accent focus:bg-accent focus:outline-none focus-visible:ring-1 ring-ring transition-colors group"
                                >
                                    <Folder className="w-4 h-4 mr-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    <span className="truncate flex-1 font-medium">{space.name || 'Unnamed Space'}</span>
                                    <div className={`w-2 h-2 rounded-full ml-3 shrink-0 ${space.color ? getGroupColorClasses(space.color).badge : 'bg-muted-foreground/30'}`} />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
