import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';
import { db, type Space } from '@/lib/db';

export interface CurrentSpaceWithMetadata extends Space {
    tabCount: number;
    windowId: number | null;
}

export function useCurrentSpace(): CurrentSpaceWithMetadata | null {
    const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);

    useEffect(() => {
        chrome.windows.getCurrent()
            .then(win => {
                if (win.id) setCurrentWindowId(win.id);
            })
            .catch(err => {
                console.warn('Failed to get current window:', err);
            });
    }, []);

    // Specific selector: re-render only when the space assigned to currentWindowId changes
    const spaceId = useAppStore(state => {
        if (!currentWindowId) return undefined;
        const entry = Object.entries(state.activeSpaces).find(([_, winId]) => winId === currentWindowId);
        return entry ? parseInt(entry[0], 10) : undefined;
    });

    const space = useLiveQuery(
        spaceService.getSpaceByIdQuery(spaceId),
        [spaceId]
    );

    const tabCount = useLiveQuery(
        () => (spaceId ? db.tabs.where({ spaceId }).count() : 0),
        [spaceId]
    ) || 0;

    return space ? { ...space, tabCount, windowId: currentWindowId } : null;
}
