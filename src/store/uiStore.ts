import { create } from 'zustand';

interface UIState {
    isSearchOpen: boolean;
    setSearchOpen: (v: boolean) => void;
    toggleSearch: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    isSearchOpen: false,
    setSearchOpen: (v) => set({ isSearchOpen: v }),
    toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
}));
