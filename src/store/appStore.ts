import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

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
            registerActiveSpace: (spaceId, windowId) => set((state) => ({
                activeSpaces: { ...state.activeSpaces, [spaceId]: windowId }
            })),
            unregisterWindow: (windowId) => set((state) => {
                const newActiveSpaces = { ...state.activeSpaces };
                for (const key in newActiveSpaces) {
                    if (newActiveSpaces[key] === windowId) {
                        delete newActiveSpaces[key];
                    }
                }
                return { activeSpaces: newActiveSpaces };
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
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHydrated(true);
            }
        }
    )
);
