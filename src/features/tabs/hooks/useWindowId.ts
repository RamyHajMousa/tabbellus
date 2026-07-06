import { useState, useEffect } from 'react';

/**
 * Resolves the current Chrome window ID on mount.
 * Returns `undefined` while loading and the numeric window ID once resolved.
 */
export function useWindowId(): number | undefined {
    const [windowId, setWindowId] = useState<number | undefined>(undefined);

    useEffect(() => {
        let mounted = true;

        chrome.windows.getCurrent().then(win => {
            if (mounted && win.id !== undefined) {
                setWindowId(win.id);
            }
        }).catch(e => {
            console.warn('Failed to get current window:', e);
        });

        return () => { mounted = false; };
    }, []);

    return windowId;
}
