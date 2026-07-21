import { useState, useMemo } from 'react';
import { useSpaces } from './useSpaces';
import { Virtuoso } from 'react-virtuoso';
import { Layers } from 'lucide-react';
import { SpaceItem } from './components/SpaceItem';
import { SpacesToolbar } from './components/SpacesToolbar';
import { spaceService } from '@/lib/spaceService';

export const SpaceList = () => {
    const rawSpaces = useSpaces();
    const [sortOrder, setSortOrder] = useState<'newest' | 'alpha'>('newest');
    const [isAllExpanded, setIsAllExpanded] = useState(false);

    const sortedSpaces = useMemo(() => {
        if (!rawSpaces) return [];
        if (sortOrder === 'alpha') {
            return [...rawSpaces].sort((a, b) => a.name.localeCompare(b.name));
        }
        return [...rawSpaces].sort((a, b) => b.createdAt - a.createdAt);
    }, [rawSpaces, sortOrder]);

    const handleAddSpace = async () => {
        const name = prompt('Enter a name for the new space:');
        if (name && name.trim()) {
            await spaceService.captureCurrentWindow(name.trim());
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
                onAddSpace={handleAddSpace}
                sortOrder={sortOrder}
                onToggleSort={handleToggleSort}
                isAllExpanded={isAllExpanded}
                onToggleExpandAll={handleToggleExpandAll}
            />

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
