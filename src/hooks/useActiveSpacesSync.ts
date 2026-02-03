import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

/**
 * Hook to synchronize activeSpaces across windows via chrome.storage.session.
 * Listens for changes from other windows and updates local Zustand store.
 */
export const useActiveSpacesSync = () => {
    useEffect(() => {
        // Initial load from session storage
        chrome.storage.session.get('activeSpaces', (result) => {
            if (result.activeSpaces) {
                useAppStore.getState().syncActiveSpaces(result.activeSpaces);
            }
        });

        // Listen for changes from other windows
        const handleStorageChange = (
            changes: { [key: string]: chrome.storage.StorageChange },
            area: string
        ) => {
            if (area === 'session' && changes.activeSpaces) {
                const newValue = changes.activeSpaces.newValue || {};
                useAppStore.getState().syncActiveSpaces(newValue);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);
};
