import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSpaces } from './useSpaces';
import { Virtuoso } from 'react-virtuoso';
import { Layers } from 'lucide-react';
import { SpaceItem } from './components/SpaceItem';
import { SpacesToolbar } from './components/SpacesToolbar';
import { SpaceDropzoneOverlay } from './components/SpaceDropzoneOverlay';
import { spaceService } from '@/lib/spaceService';
import { dataService } from '@/lib/dataService';
import { useAppStore } from '@/store/appStore';
import { useWindowId } from '@/features/tabs/hooks/useWindowId';
import { useToast } from '@/components/ui/Toaster';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';

export const SpaceList = () => {
    const spaces = useSpaces();
    const activeSpaces = useAppStore((state) => state.activeSpaces) || {};
    const currentWindowId = useWindowId();
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedColorFilter, setSelectedColorFilter] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'newest' | 'alpha'>('newest');
    const [isAllExpanded, setIsAllExpanded] = useState(false);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [newSpaceName, setNewSpaceName] = useState('');
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const dragCounterRef = useRef(0);

    useEffect(() => {
        const handleWindowBlur = () => {
            dragCounterRef.current = 0;
            setIsDraggingFile(false);
        };
        window.addEventListener('blur', handleWindowBlur);
        return () => {
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            dragCounterRef.current += 1;
            setIsDraggingFile(true);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            e.dataTransfer.dropEffect = 'copy';
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            dragCounterRef.current -= 1;
            if (dragCounterRef.current <= 0) {
                dragCounterRef.current = 0;
                setIsDraggingFile(false);
            }
        }
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDraggingFile(false);

        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
        const file = e.dataTransfer.files[0];

        try {
            const result = await dataService.importData(file);
            toast(`Imported ${result.spacesImported} space${result.spacesImported === 1 ? '' : 's'} and ${result.tabsImported} tab${result.tabsImported === 1 ? '' : 's'} successfully`);
        } catch (error) {
            console.error('Failed to import space backup:', error);
            const message = error instanceof Error ? error.message : 'Unknown error occurred during import';
            toast(`Import failed: ${message}`);
        }
    }, [toast]);

    const sortedSpaces = useMemo(() => {
        if (!spaces) return [];

        let filtered = spaces;
        const query = searchQuery.trim().toLowerCase();
        if (query) {
            filtered = filtered.filter((s) => s.name.toLowerCase().includes(query));
        }
        if (selectedColorFilter) {
            filtered = filtered.filter((s) => s.color === selectedColorFilter);
        }

        return [...filtered].sort((a, b) => {
            // 1. Current Window Active
            const aCurrentActive = activeSpaces[a.id!] === currentWindowId;
            const bCurrentActive = activeSpaces[b.id!] === currentWindowId;
            if (aCurrentActive && !bCurrentActive) return -1;
            if (!aCurrentActive && bCurrentActive) return 1;

            // 2. Any Window Active
            const aAnyActive = !!activeSpaces[a.id!];
            const bAnyActive = !!activeSpaces[b.id!];
            if (aAnyActive && !bAnyActive) return -1;
            if (!aAnyActive && bAnyActive) return 1;

            // 3. Pinned (Using correct DB schema 'isPinned')
            const aPinned = a.isPinned || false;
            const bPinned = b.isPinned || false;
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            // 4. Standard Sort Preference (Fallback)
            if (sortOrder === 'alpha') {
                return (a.name || '').localeCompare(b.name || '');
            }
            return (b.createdAt || 0) - (a.createdAt || 0); // newest
        });
    }, [spaces, activeSpaces, currentWindowId, sortOrder, searchQuery, selectedColorFilter]);

    const handleCreateSpace = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSpaceName.trim()) return;
        try {
            await spaceService.createEmptySpace(newSpaceName.trim());
            setNewSpaceName('');
            setIsAddDialogOpen(false);
        } catch (error) {
            console.error('Failed to create space:', error);
        }
    }, [newSpaceName]);

    const handleToggleSort = useCallback(() => {
        setSortOrder((prev) => (prev === 'newest' ? 'alpha' : 'newest'));
    }, []);

    const handleToggleExpandAll = useCallback(() => {
        setIsAllExpanded((prev) => !prev);
    }, []);

    const handleSelectColorFilter = useCallback((color: string | null) => {
        setSelectedColorFilter((prev) => (prev === color ? null : color));
    }, []);

    const computeItemKey = useCallback((index: number) => sortedSpaces[index].id!, [sortedSpaces]);

    const renderSpaceItem = useCallback((index: number) => (
        <SpaceItem
            space={sortedSpaces[index]}
            isExpanded={isAllExpanded}
        />
    ), [sortedSpaces, isAllExpanded]);

    return (
        <div
            className="relative flex flex-col h-full bg-background select-none"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <SpaceDropzoneOverlay isDragging={isDraggingFile} />

            <SpacesToolbar
                onAddSpace={() => setIsAddDialogOpen(true)}
                sortOrder={sortOrder}
                onToggleSort={handleToggleSort}
                isAllExpanded={isAllExpanded}
                onToggleExpandAll={handleToggleExpandAll}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedColorFilter={selectedColorFilter}
                onSelectColorFilter={handleSelectColorFilter}
            />

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent className="max-w-sm p-5">
                    <form onSubmit={handleCreateSpace}>
                        <DialogHeader className="mb-3">
                            <DialogTitle className="text-sm font-semibold">Create New Space</DialogTitle>
                            <DialogDescription className="text-xs">
                                Create a new empty space to organize your tabs.
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
                {spaces && spaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                        <Layers className="w-8 h-8 opacity-20 mb-2" />
                        <p className="text-sm">No spaces captured yet</p>
                    </div>
                ) : sortedSpaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                        <Layers className="w-8 h-8 opacity-20 mb-2" />
                        <p className="text-sm">No matching spaces found</p>
                    </div>
                ) : (
                    <Virtuoso
                        style={{ height: '100%', width: '100%' }}
                        totalCount={sortedSpaces.length}
                        computeItemKey={computeItemKey}
                        itemContent={renderSpaceItem}
                    />
                )}
            </div>
        </div>
    );
};

