import { create } from 'zustand';

interface TabLockState {
    lockedTabIds: number[];
    toggleLock: (tabId: number, isLocked: boolean) => void;
    initStore: () => Promise<void>;
}

export const useTabLockStore = create<TabLockState>((set, get) => ({
    lockedTabIds: [],
    toggleLock: (tabId: number, isLocked: boolean) => {
        const current = get().lockedTabIds;
        let updated: number[];
        if (isLocked) {
            updated = Array.from(new Set([...current, tabId]));
        } else {
            updated = current.filter((id) => id !== tabId);
        }
        set({ lockedTabIds: updated });
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
            chrome.storage.session.set({ lockedTabIds: updated }).catch((err) => {
                console.error('TabLockStore: Failed to sync lockedTabIds to chrome.storage.session:', err);
            });
        }
    },
    initStore: async () => {
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
            try {
                const res = await chrome.storage.session.get('lockedTabIds');
                if (res && Array.isArray(res.lockedTabIds)) {
                    set({ lockedTabIds: res.lockedTabIds });
                }
            } catch (err) {
                console.error('TabLockStore: Failed to hydrate lockedTabIds from chrome.storage.session:', err);
            }
        }
    },
}));

// Hydrate on initial load and listen for session storage updates across extension pages
if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    useTabLockStore.getState().initStore();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'session' && changes.lockedTabIds) {
            const newLockedIds: number[] = changes.lockedTabIds.newValue || [];
            useTabLockStore.setState({ lockedTabIds: newLockedIds });
        }
    });
}
