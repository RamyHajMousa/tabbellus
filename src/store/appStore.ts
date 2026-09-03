import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { spaceService } from '@/lib/spaceService';

import { contractRegistry } from '@/core/contracts/registry';

export interface AppSettings {
    theme: 'light' | 'dark' | 'system';
    badgeMode: 'none' | 'tabs' | 'read-later';
    showDomain: boolean;
    readLaterOpenBehavior: 'foreground' | 'background';
    readLaterAutoArchive: boolean;
    autoDiscardInterval: 0 | 15 | 30 | 60 | 120;
    spaceRestoreTrigger: 'single' | 'double';
    duplicateTabBehavior: 'allow' | 'focus-existing';
    settingsUpdatedAt: number;
}

export const PORTABLE_SETTINGS_KEYS: (keyof AppSettings)[] = [
    'duplicateTabBehavior',
    'spaceRestoreTrigger',
    'readLaterOpenBehavior',
    'readLaterAutoArchive',
];

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'system',
    badgeMode: 'read-later',
    showDomain: true,
    readLaterOpenBehavior: 'foreground',
    readLaterAutoArchive: true,
    autoDiscardInterval: 0,
    spaceRestoreTrigger: 'single',
    duplicateTabBehavior: 'focus-existing',
    settingsUpdatedAt: 0,
};

// 1. Create a Custom Bridge for Chrome Storage
const chromeStorageAdapter: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage?.local) {
                resolve(null);
                return;
            }
            chrome.storage.local.get([name], (result) => {
                if (chrome.runtime?.lastError) {
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
            if (typeof chrome === 'undefined' || !chrome.storage?.local) {
                resolve();
                return;
            }
            chrome.storage.local.set({ [name]: value }, () => {
                if (chrome.runtime?.lastError) {
                    console.error('Error saving state:', chrome.runtime.lastError);
                }
                resolve();
            });
        });
    },
    removeItem: async (name: string): Promise<void> => {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage?.local) {
                resolve();
                return;
            }
            chrome.storage.local.remove(name, () => {
                if (chrome.runtime?.lastError) {
                    console.error('Error removing state:', chrome.runtime.lastError);
                }
                resolve();
            });
        });
    },
};

export interface AppState {
    settings: AppSettings;
    // Backward-compatibility direct accessors
    theme: AppSettings['theme'];
    showDomain: AppSettings['showDomain'];
    badgeMode: AppSettings['badgeMode'];

    isHydrated: boolean;
    activeView: 'active' | 'spaces' | 'read-later';
    activeSpaces: Record<number, number>; // SpaceID -> WindowID (ephemeral)
    recentSearches: string[];

    // Actions
    updateSettings: (partial: Partial<AppSettings>, options?: { skipMutationNotification?: boolean }) => void;
    setTheme: (theme: AppSettings['theme']) => void;
    setShowDomain: (showDomain: AppSettings['showDomain']) => void;
    setBadgeMode: (badgeMode: AppSettings['badgeMode']) => void;
    setReadLaterOpenBehavior: (behavior: AppSettings['readLaterOpenBehavior']) => void;
    setReadLaterAutoArchive: (autoArchive: AppSettings['readLaterAutoArchive']) => void;
    setAutoDiscardInterval: (interval: AppSettings['autoDiscardInterval']) => void;
    setSpaceRestoreTrigger: (trigger: AppSettings['spaceRestoreTrigger']) => void;
    setDuplicateTabBehavior: (behavior: AppSettings['duplicateTabBehavior']) => void;
    setHydrated: (state: boolean) => void;
    setActiveView: (view: AppState['activeView']) => void;
    registerActiveSpace: (spaceId: number, windowId: number) => void;
    unregisterWindow: (windowId: number) => void;
    syncActiveSpaces: (map: Record<number, number>) => void;
    addRecentSearch: (query: string) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            settings: DEFAULT_SETTINGS,
            theme: DEFAULT_SETTINGS.theme,
            showDomain: DEFAULT_SETTINGS.showDomain,
            badgeMode: DEFAULT_SETTINGS.badgeMode,
            isHydrated: false,
            activeView: 'spaces',
            activeSpaces: {},
            recentSearches: [],

            updateSettings: (partial, options) => {
                const hasPortableChange = PORTABLE_SETTINGS_KEYS.some((key) => key in partial);
                let newTimestamp: number | undefined;

                if (typeof partial.settingsUpdatedAt === 'number') {
                    newTimestamp = partial.settingsUpdatedAt;
                } else if (hasPortableChange) {
                    newTimestamp = Date.now();
                }

                set((state) => {
                    const newSettings = {
                        ...state.settings,
                        ...partial,
                        ...(newTimestamp !== undefined ? { settingsUpdatedAt: newTimestamp } : {}),
                    };
                    return {
                        settings: newSettings,
                        theme: newSettings.theme,
                        showDomain: newSettings.showDomain,
                        badgeMode: newSettings.badgeMode,
                    };
                });

                if (hasPortableChange && !options?.skipMutationNotification) {
                    contractRegistry.notifyLocalMutation();
                }
            },
            setTheme: (theme) => set((state) => {
                const newSettings = { ...state.settings, theme };
                return {
                    settings: newSettings,
                    theme,
                };
            }),
            setShowDomain: (showDomain) => set((state) => {
                const newSettings = { ...state.settings, showDomain };
                return {
                    settings: newSettings,
                    showDomain,
                };
            }),
            setBadgeMode: (badgeMode) => set((state) => {
                const newSettings = { ...state.settings, badgeMode };
                return {
                    settings: newSettings,
                    badgeMode,
                };
            }),
            setReadLaterOpenBehavior: (readLaterOpenBehavior) => {
                const now = Date.now();
                set((state) => ({
                    settings: { ...state.settings, readLaterOpenBehavior, settingsUpdatedAt: now },
                }));
                contractRegistry.notifyLocalMutation();
            },
            setReadLaterAutoArchive: (readLaterAutoArchive) => {
                const now = Date.now();
                set((state) => ({
                    settings: { ...state.settings, readLaterAutoArchive, settingsUpdatedAt: now },
                }));
                contractRegistry.notifyLocalMutation();
            },
            setAutoDiscardInterval: (autoDiscardInterval) => set((state) => {
                const newSettings = { ...state.settings, autoDiscardInterval };
                return {
                    settings: newSettings,
                };
            }),
            setSpaceRestoreTrigger: (spaceRestoreTrigger) => {
                const now = Date.now();
                set((state) => ({
                    settings: { ...state.settings, spaceRestoreTrigger, settingsUpdatedAt: now },
                }));
                contractRegistry.notifyLocalMutation();
            },
            setDuplicateTabBehavior: (duplicateTabBehavior) => {
                const now = Date.now();
                set((state) => ({
                    settings: { ...state.settings, duplicateTabBehavior, settingsUpdatedAt: now },
                }));
                contractRegistry.notifyLocalMutation();
            },
            setHydrated: (isHydrated) => set({ isHydrated }),
            setActiveView: (view) => set({ activeView: view }),
            registerActiveSpace: (spaceId, windowId) => set((state) => {
                const newActiveSpaces = { ...state.activeSpaces };
                // Remove any other spaces claiming this window to enforce 1-to-1 binding
                Object.keys(newActiveSpaces).forEach((key) => {
                    if (newActiveSpaces[Number(key)] === windowId) {
                        delete newActiveSpaces[Number(key)];
                    }
                });
                newActiveSpaces[spaceId] = windowId;
                if (typeof chrome !== 'undefined' && chrome.storage?.session) {
                    chrome.storage.session.set({ activeSpaces: newActiveSpaces }); // Broadcast
                }
                return { activeSpaces: newActiveSpaces };
            }),
            unregisterWindow: (windowId) => set((state) => {
                const newMap = { ...state.activeSpaces };
                for (const key in newMap) {
                    if (newMap[key] === windowId) {
                        delete newMap[key];
                    }
                }
                if (typeof chrome !== 'undefined' && chrome.storage?.session) {
                    chrome.storage.session.set({ activeSpaces: newMap }); // Broadcast
                }
                return { activeSpaces: newMap };
            }),
            syncActiveSpaces: (map) => set({ activeSpaces: map }),
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
                settings: state.settings,
                theme: state.settings.theme,
                showDomain: state.settings.showDomain,
                badgeMode: state.settings.badgeMode,
                activeView: state.activeView,
                recentSearches: state.recentSearches,
            }),
            merge: (persistedState: unknown, currentState: AppState) => {
                const persisted = (persistedState as Partial<AppState> & { settings?: Partial<AppSettings> }) || {};
                const mergedSettings: AppSettings = {
                    theme: persisted.settings?.theme ?? (persisted.theme as AppSettings['theme']) ?? DEFAULT_SETTINGS.theme,
                    showDomain: persisted.settings?.showDomain ?? (persisted as any).showDomain ?? DEFAULT_SETTINGS.showDomain,
                    badgeMode: persisted.settings?.badgeMode ?? (persisted.badgeMode as AppSettings['badgeMode']) ?? DEFAULT_SETTINGS.badgeMode,
                    readLaterOpenBehavior: persisted.settings?.readLaterOpenBehavior ?? DEFAULT_SETTINGS.readLaterOpenBehavior,
                    readLaterAutoArchive: persisted.settings?.readLaterAutoArchive ?? DEFAULT_SETTINGS.readLaterAutoArchive,
                    autoDiscardInterval: persisted.settings?.autoDiscardInterval ?? DEFAULT_SETTINGS.autoDiscardInterval,
                    spaceRestoreTrigger: persisted.settings?.spaceRestoreTrigger ?? DEFAULT_SETTINGS.spaceRestoreTrigger,
                    duplicateTabBehavior: persisted.settings?.duplicateTabBehavior ?? DEFAULT_SETTINGS.duplicateTabBehavior,
                    settingsUpdatedAt: persisted.settings?.settingsUpdatedAt ?? DEFAULT_SETTINGS.settingsUpdatedAt,
                };
                return {
                    ...currentState,
                    ...persisted,
                    settings: mergedSettings,
                    theme: mergedSettings.theme,
                    showDomain: mergedSettings.showDomain,
                    badgeMode: mergedSettings.badgeMode,
                };
            },
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
