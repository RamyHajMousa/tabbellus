import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { spaceService } from '@/lib/spaceService';

// 1. Create a Custom Bridge for Chrome Storage
const chromeStorageAdapter: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        return new Promise((resolve) => {
            chrome.storage.local.get([name], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('Error loading state:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    resolve(result[name] || null);
                }
            });
        });
    },
    setItem: async (name: string, value: string): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [name]: value }, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error saving state:', chrome.runtime.lastError);
                }
                resolve();
            });
        });
    },
    removeItem: async (name: string): Promise<void> => {
        return new Promise((resolve) => {
            chrome.storage.local.remove(name, () => {
                if (chrome.runtime.lastError) {
                    console.error('Error removing state:', chrome.runtime.lastError);
                }
                resolve();
            });
        });
    },
};

interface AppState {
    theme: 'light' | 'dark' | 'system';
    isHydrated: boolean;
    activeView: 'active' | 'spaces' | 'read-later';
    activeSpaces: Record<number, number>; // SpaceID -> WindowID (ephemeral)
    setTheme: (theme: AppState['theme']) => void;
    setHydrated: (state: boolean) => void;
    setActiveView: (view: AppState['activeView']) => void;
    registerActiveSpace: (spaceId: number, windowId: number) => void;
    unregisterWindow: (windowId: number) => void;
    syncActiveSpaces: (map: Record<number, number>) => void;
    recentSearches: string[];
    addRecentSearch: (query: string) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            theme: 'system',
            isHydrated: false,
            activeView: 'spaces',
            activeSpaces: {},
            setTheme: (theme) => set({ theme }),
            setHydrated: (isHydrated) => set({ isHydrated }),
            setActiveView: (view) => set({ activeView: view }),
            registerActiveSpace: (spaceId, windowId) => set((state) => {
                const newMap = { ...state.activeSpaces, [spaceId]: windowId };
                chrome.storage.session.set({ activeSpaces: newMap }); // Broadcast
                return { activeSpaces: newMap };
            }),
            unregisterWindow: (windowId) => set((state) => {
                const newMap = { ...state.activeSpaces };
                for (const key in newMap) {
                    if (newMap[key] === windowId) {
                        delete newMap[key];
                    }
                }
                chrome.storage.session.set({ activeSpaces: newMap }); // Broadcast
                return { activeSpaces: newMap };
            }),
            syncActiveSpaces: (map) => set({ activeSpaces: map }),
            recentSearches: [],
            addRecentSearch: (query) => set((state) => {
                const trimmed = query.trim();
                if (!trimmed) return state;
                const filtered = state.recentSearches.filter(s => s !== trimmed);
                return { recentSearches: [trimmed, ...filtered].slice(0, 5) };
            }),
        }),
        {
            name: 'tabbellus-settings',
            // 2. Use the Chrome Adapter instead of sessionStorage
            storage: createJSONStorage(() => chromeStorageAdapter),
            // 3. Exclude ephemeral state from persistence
            partialize: (state) => ({
                theme: state.theme,
                activeView: state.activeView,
                recentSearches: state.recentSearches,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHydrated(true);
            }
        }
    )
);

// Subscribe to space restore events from the service layer to register active spaces.
spaceService.onRestore((spaceId, windowId) => {
    useAppStore.getState().registerActiveSpace(spaceId, windowId);
});
