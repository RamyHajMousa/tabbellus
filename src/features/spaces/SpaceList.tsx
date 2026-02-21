import { useSpaces } from './useSpaces';
import { Virtuoso } from 'react-virtuoso';
import { Layers } from 'lucide-react';
import { SpaceItem } from './components/SpaceItem';

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
            computeItemKey={(index) => spaces[index].id!}
            itemContent={(index) => <SpaceItem space={spaces[index]} />}
        />
    );
};
