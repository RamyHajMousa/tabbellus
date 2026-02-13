import { create } from 'zustand';

interface UIState {
    isSearchOpen: boolean;
    isSettingsOpen: boolean;
    setSearchOpen: (v: boolean) => void;
    toggleSearch: () => void;
    setSettingsOpen: (v: boolean) => void;
    toggleSettings: () => void;
    isHistoryOpen: boolean;
    setHistoryOpen: (v: boolean) => void;
    toggleHistory: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    isSearchOpen: false,
    isSettingsOpen: false,
    setSearchOpen: (v) => set({ isSearchOpen: v }),
    toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
    setSettingsOpen: (v) => set({ isSettingsOpen: v }),
    toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
    isHistoryOpen: false,
    setHistoryOpen: (v) => set({ isHistoryOpen: v }),
    toggleHistory: () => set((state) => ({ isHistoryOpen: !state.isHistoryOpen })),
}));
