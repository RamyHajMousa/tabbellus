import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { spaceService } from '@/lib/spaceService';

import { contractRegistry } from '@/core/contracts/registry';

import {
    type AppSettings,
    PORTABLE_SETTINGS_KEYS,
    DEFAULT_SETTINGS,
    memoryStorageFallback,
} from '@/lib/settings';

export type { AppSettings };
export { PORTABLE_SETTINGS_KEYS, DEFAULT_SETTINGS };

let isRehydrating = false;

// 1. Create a Custom Bridge for Chrome Storage
const chromeStorageAdapter: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage?.local) {
                const val = memoryStorageFallback[name];
                if (val && typeof val === 'object') {
                    resolve(JSON.stringify(val));
                } else {
                    resolve((val as string) || null);
                }
                return;
            }
            chrome.storage.local.get([name], (result) => {
                if (chrome.runtime?.lastError) {
                    console.error('Error loading state:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    const val = result[name];
                    if (val && typeof val === 'object') {
                        resolve(JSON.stringify(val));
                    } else {
                        resolve(val || null);
                    }
                }
            });
        });
    },
    setItem: async (name: string, value: string): Promise<void> => {
        if (isRehydrating) {
            return;
        }
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage?.local) {
                memoryStorageFallback[name] = value;
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
                delete memoryStorageFallback[name];
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
                const persisted = (persistedState as (Partial<AppState> & { settings?: Partial<AppSettings>; [key: string]: any })) || {};
                const persistedSettings: Partial<AppSettings> = persisted.settings || {};
                const mergedSettings: AppSettings = {
                    ...DEFAULT_SETTINGS,
                    ...persistedSettings,
                    theme: persistedSettings.theme ?? (persisted.theme as AppSettings['theme']) ?? DEFAULT_SETTINGS.theme,
                    showDomain: persistedSettings.showDomain ?? (persisted.showDomain as boolean) ?? DEFAULT_SETTINGS.showDomain,
                    badgeMode: persistedSettings.badgeMode ?? (persisted.badgeMode as AppSettings['badgeMode']) ?? DEFAULT_SETTINGS.badgeMode,
                    readLaterOpenBehavior: persistedSettings.readLaterOpenBehavior ?? DEFAULT_SETTINGS.readLaterOpenBehavior,
                    readLaterAutoArchive: persistedSettings.readLaterAutoArchive ?? DEFAULT_SETTINGS.readLaterAutoArchive,
                    autoDiscardInterval: persistedSettings.autoDiscardInterval ?? DEFAULT_SETTINGS.autoDiscardInterval,
                    spaceRestoreTrigger: persistedSettings.spaceRestoreTrigger ?? DEFAULT_SETTINGS.spaceRestoreTrigger,
                    duplicateTabBehavior: persistedSettings.duplicateTabBehavior ?? DEFAULT_SETTINGS.duplicateTabBehavior,
                    settingsUpdatedAt: persistedSettings.settingsUpdatedAt ?? DEFAULT_SETTINGS.settingsUpdatedAt,
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
            migrate: (persistedState: any) => persistedState,
            onRehydrateStorage: () => (state) => {
                if (state && !state.isHydrated) {
                    state.setHydrated(true);
                }
            }
        }
    )
);

// Wrap rehydrate to suppress write-backs while rehydrating from storage (Anti-Echo / No Echo Loop Guard)
const originalRehydrate = useAppStore.persist.rehydrate;
useAppStore.persist.rehydrate = async () => {
    isRehydrating = true;
    try {
        return await originalRehydrate();
    } finally {
        isRehydrating = false;
    }
};

// Subscribe to space restore events from the service layer to register active spaces.
spaceService.onRestore((spaceId, windowId) => {
    useAppStore.getState().registerActiveSpace(spaceId, windowId);
});

// R3: Rehydrate store when chrome.storage.onChanged reports a change to 'tabbellus-settings' in 'local' area.
// Rehydration uses the persist API's rehydrate, which does not trigger notifyLocalMutation or write back to storage.
let settingsSyncListenerRegistered = false;
export function initSettingsStorageListener(force = false): void {
    if (settingsSyncListenerRegistered && !force) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        settingsSyncListenerRegistered = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes['tabbellus-settings']) {
                useAppStore.persist.rehydrate();
            }
        });
    }
}
initSettingsStorageListener();
