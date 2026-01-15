import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
            name: 'tabbellus-storage',
            storage: createJSONStorage(() => sessionStorage), // Default to session, swapped to chrome.storage in production usually or keep localStorage
            onRehydrateStorage: () => (state) => {
                state?.setHydrated(true);
            }
        }
    )
);
