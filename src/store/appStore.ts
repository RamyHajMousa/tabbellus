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
