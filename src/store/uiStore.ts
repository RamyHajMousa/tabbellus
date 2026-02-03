import { create } from 'zustand';

interface UIState {
    isSearchOpen: boolean;
    isSettingsOpen: boolean;
    setSearchOpen: (v: boolean) => void;
    toggleSearch: () => void;
    setSettingsOpen: (v: boolean) => void;
    toggleSettings: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    isSearchOpen: false,
    isSettingsOpen: false,
    setSearchOpen: (v) => set({ isSearchOpen: v }),
    toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
    setSettingsOpen: (v) => set({ isSettingsOpen: v }),
    toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
}));
