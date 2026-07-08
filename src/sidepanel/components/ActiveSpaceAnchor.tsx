import { useCurrentSpace } from '@/hooks/useCurrentSpace';
import { Space } from '@/lib/db';
import { Link2 } from 'lucide-react';

export const ActiveSpaceAnchor = () => {
    const currentSpace = useCurrentSpace() as Space | null;

    if (!currentSpace) return null;

    return (
        <div className="h-8 flex items-center px-4 bg-muted border-b border-border sticky top-12 z-10">
            <Link2 className="w-3.5 h-3.5 mr-2 text-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-foreground tracking-wide truncate">
                <span className="font-bold">{currentSpace.name}</span>
            </span>
        </div>
    );
};
