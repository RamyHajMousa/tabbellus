import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';
import { db } from '@/lib/db';

export function useCurrentSpace() {
    const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
    const activeSpaces = useAppStore(state => state.activeSpaces);

    useEffect(() => {
        chrome.windows.getCurrent()
            .then(win => {
                if (win.id) setCurrentWindowId(win.id);
            })
            .catch(err => {
                console.warn('Failed to get current window:', err);
            });
    }, []);

    const spaceIdRaw = currentWindowId 
        ? Object.keys(activeSpaces).find(k => activeSpaces[parseInt(k)] === currentWindowId) 
        : undefined;
        
    const spaceId = spaceIdRaw ? parseInt(spaceIdRaw, 10) : undefined;

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
