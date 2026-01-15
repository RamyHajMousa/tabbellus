import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// 1. Create a Custom Bridge for Chrome Storage
const chromeStorageAdapter: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        const data = await chrome.storage.local.get(name);
        return data[name] || null;
    },
    setItem: async (name: string, value: string): Promise<void> => {
        await chrome.storage.local.set({ [name]: value });
    },
    removeItem: async (name: string): Promise<void> => {
        await chrome.storage.local.remove(name);
    },
};

interface AppState {
    theme: 'light' | 'dark' | 'system';
    isHydrated: boolean;
    setTheme: (theme: AppState['theme']) => void;
    setHydrated: (state: boolean) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            theme: 'system',
            isHydrated: false,
            setTheme: (theme) => set({ theme }),
            setHydrated: (isHydrated) => set({ isHydrated }),
        }),
        {
            name: 'tabbellus-settings',
            // 2. Use the Chrome Adapter instead of sessionStorage
            storage: createJSONStorage(() => chromeStorageAdapter),
            onRehydrateStorage: () => (state) => {
                state?.setHydrated(true);
            }
        }
    )
);
