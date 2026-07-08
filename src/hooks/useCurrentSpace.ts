import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';

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

    return space || null;
}
