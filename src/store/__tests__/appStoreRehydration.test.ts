import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore, DEFAULT_SETTINGS, initSettingsStorageListener, chromeStorageAdapter } from '../appStore';
import { contractRegistry } from '@/core/contracts/registry';

describe('useAppStore Rehydration & Concurrency Guards (T1–T6)', () => {
    interface StorageChange {
        oldValue?: any;
        newValue?: any;
    }

    type OnChangedListener = (
        changes: Record<string, StorageChange>,
        areaName: string
    ) => void;

    let storageData: Record<string, any> = {};
    let listeners: OnChangedListener[] = [];
    let getItemDelay = 0;

    const mockChrome = {
        runtime: {
            lastError: null,
        },
        storage: {
            local: {
                get: vi.fn((keys: string | string[], callback: (result: Record<string, any>) => void) => {
                    const keyList = Array.isArray(keys) ? keys : [keys];
                    const result: Record<string, any> = {};
                    for (const k of keyList) {
                        if (k in storageData) {
                            result[k] = storageData[k];
                        }
                    }
                    if (getItemDelay > 0) {
                        setTimeout(() => callback(result), getItemDelay);
                    } else {
                        callback(result);
                    }
                }),
                set: vi.fn((items: Record<string, any>, callback?: () => void) => {
                    const changes: Record<string, StorageChange> = {};
                    for (const [k, v] of Object.entries(items)) {
                        changes[k] = {
                            oldValue: storageData[k],
                            newValue: v,
                        };
                        storageData[k] = v;
                    }
                    callback?.();
                    for (const listener of [...listeners]) {
                        listener(changes, 'local');
                    }
                }),
                remove: vi.fn((keys: string | string[], callback?: () => void) => {
                    const keyList = Array.isArray(keys) ? keys : [keys];
                    const changes: Record<string, StorageChange> = {};
                    for (const k of keyList) {
                        changes[k] = {
                            oldValue: storageData[k],
                            newValue: undefined,
                        };
                        delete storageData[k];
                    }
                    callback?.();
                    for (const listener of [...listeners]) {
                        listener(changes, 'local');
                    }
                }),
            },
            onChanged: {
                addListener: vi.fn((listener: OnChangedListener) => {
                    listeners.push(listener);
                }),
                removeListener: vi.fn((listener: OnChangedListener) => {
                    const idx = listeners.indexOf(listener);
                    if (idx !== -1) listeners.splice(idx, 1);
                }),
            },
        },
    };

    beforeEach(() => {
        storageData = {};
        listeners = [];
        getItemDelay = 0;
        (globalThis as any).chrome = mockChrome;

        // Reset store to default state
        useAppStore.setState({
            settings: { ...DEFAULT_SETTINGS },
            theme: DEFAULT_SETTINGS.theme,
            showDomain: DEFAULT_SETTINGS.showDomain,
            badgeMode: DEFAULT_SETTINGS.badgeMode,
            activeView: 'spaces',
            recentSearches: [],
        });

        // Initialize listener with mock chrome
        initSettingsStorageListener(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("T1': an external change to a portable setting → store reflects it; a subsequent user change to a DIFFERENT setting persists both values", async () => {
        const notifySpy = vi.spyOn(contractRegistry, 'notifyLocalMutation');

        // External context writes to chrome.storage.local
        const externalPayload = JSON.stringify({
            state: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    spaceRestoreTrigger: 'double',
                    settingsUpdatedAt: 1234,
                },
            },
            version: 0,
        });

        await new Promise<void>((resolve) => {
            mockChrome.storage.local.set({ 'tabbellus-settings': externalPayload }, () => resolve());
        });

        await new Promise((r) => setTimeout(r, 50));

        // Store reflects external change
        expect(useAppStore.getState().settings.spaceRestoreTrigger).toBe('double');

        // Anti-echo guard: rehydration must not notify local mutation
        expect(notifySpy).not.toHaveBeenCalled();

        // User updates a DIFFERENT setting
        useAppStore.getState().updateSettings({
            readLaterOpenBehavior: 'background',
        });

        await new Promise((r) => setTimeout(r, 50));

        // In-memory state has both values
        const state = useAppStore.getState();
        expect(state.settings.spaceRestoreTrigger).toBe('double');
        expect(state.settings.readLaterOpenBehavior).toBe('background');

        // Storage persists both values
        const rawStored = storageData['tabbellus-settings'];
        expect(rawStored).toBeDefined();
        const parsed = typeof rawStored === 'string' ? JSON.parse(rawStored) : rawStored;
        expect(parsed.state.settings.spaceRestoreTrigger).toBe('double');
        expect(parsed.state.settings.readLaterOpenBehavior).toBe('background');
    });

    it('T2: Two rapid updateSettings calls -> both persisted', async () => {
        getItemDelay = 20;

        useAppStore.getState().updateSettings({ readLaterOpenBehavior: 'background' });
        useAppStore.getState().updateSettings({ duplicateTabBehavior: 'allow' });

        await new Promise((r) => setTimeout(r, 80));

        const state = useAppStore.getState();
        expect(state.settings.readLaterOpenBehavior).toBe('background');
        expect(state.settings.duplicateTabBehavior).toBe('allow');

        const rawStored = storageData['tabbellus-settings'];
        expect(rawStored).toBeDefined();
        const parsed = typeof rawStored === 'string' ? JSON.parse(rawStored) : rawStored;
        expect(parsed.state.settings.readLaterOpenBehavior).toBe('background');
        expect(parsed.state.settings.duplicateTabBehavior).toBe('allow');
    });

    it('T3: An external write (simulated adapter write with a different value) -> store rehydrates and reflects it; no notifyLocalMutation', async () => {
        const notifySpy = vi.spyOn(contractRegistry, 'notifyLocalMutation');
        const rehydrateSpy = vi.spyOn(useAppStore.persist, 'rehydrate');

        const externalPayload = JSON.stringify({
            state: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    duplicateTabBehavior: 'allow',
                    spaceRestoreTrigger: 'double',
                    settingsUpdatedAt: 8888,
                },
            },
            version: 0,
        });

        // External context writes to chrome.storage.local
        await new Promise<void>((resolve) => {
            mockChrome.storage.local.set({ 'tabbellus-settings': externalPayload }, () => resolve());
        });

        await new Promise((r) => setTimeout(r, 80));

        const state = useAppStore.getState();
        expect(state.settings.duplicateTabBehavior).toBe('allow');
        expect(state.settings.spaceRestoreTrigger).toBe('double');
        expect(state.settings.settingsUpdatedAt).toBe(8888);

        // Anti-echo guard: rehydration must NOT call notifyLocalMutation
        expect(notifySpy).not.toHaveBeenCalled();

        // Exactly 1 rehydrate call from external write; own write-back skips rehydrate (no loop)
        expect(rehydrateSpy).toHaveBeenCalledTimes(1);

        // Storage contains identical values
        const currentStored = JSON.parse(storageData['tabbellus-settings']);
        expect(currentStored.state.settings.duplicateTabBehavior).toBe('allow');
        expect(currentStored.state.settings.spaceRestoreTrigger).toBe('double');
        expect(currentStored.state.settings.settingsUpdatedAt).toBe(8888);
    });

    it('T4: Own write -> no rehydrate call', async () => {
        const rehydrateSpy = vi.spyOn(useAppStore.persist, 'rehydrate');

        useAppStore.getState().updateSettings({ theme: 'dark' });

        await new Promise((r) => setTimeout(r, 50));

        expect(rehydrateSpy).not.toHaveBeenCalled();
    });

    it('T5: setItem preserves an unknown top-level key and an unknown settings key written by a "future version"', async () => {
        const futureBlob = {
            version: 99,
            unknownTopLevelKey: 'keep-top-level',
            state: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    unknownFutureSetting: 'keep-setting',
                },
            },
        };
        storageData['tabbellus-settings'] = JSON.stringify(futureBlob);

        // Populate lastReadBlob via getItem
        await chromeStorageAdapter.getItem('tabbellus-settings');

        // Normal incoming write without knowing future keys
        const incomingWrite = {
            state: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    theme: 'dark',
                },
            },
        };
        await chromeStorageAdapter.setItem('tabbellus-settings', JSON.stringify(incomingWrite));

        const stored = JSON.parse(storageData['tabbellus-settings']);
        expect(stored.unknownTopLevelKey).toBe('keep-top-level');
        expect(stored.state.settings.unknownFutureSetting).toBe('keep-setting');
        expect(stored.state.settings.theme).toBe('dark');
        expect(stored.version).toBe(99);
    });

    it('T6: store version 2 writing over a stored blob with version 1 → stored version is 2', async () => {
        const storedV1 = {
            version: 1,
            state: {
                settings: { ...DEFAULT_SETTINGS },
            },
        };
        storageData['tabbellus-settings'] = JSON.stringify(storedV1);

        // Populate lastReadBlob
        await chromeStorageAdapter.getItem('tabbellus-settings');

        // Store version 2 writes over it
        const incomingV2 = {
            version: 2,
            state: {
                settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
            },
        };
        await chromeStorageAdapter.setItem('tabbellus-settings', JSON.stringify(incomingV2));

        const stored = JSON.parse(storageData['tabbellus-settings']);
        expect(stored.version).toBe(2);
    });

    it('T7 (R5): store configured with version 2 hydrating version 1 invokes migrate via useAppStore and persists version 2', async () => {
        const storedV1 = {
            version: 1,
            state: {
                settings: { ...DEFAULT_SETTINGS, theme: 'light' },
            },
        };
        storageData['tabbellus-settings'] = JSON.stringify(storedV1);

        const migrateSpy = vi.fn((persistedState: any, _version: number) => {
            return {
                ...persistedState,
                settings: {
                    ...persistedState.settings,
                    theme: 'dark',
                },
            };
        });

        useAppStore.persist.setOptions({
            version: 2,
            migrate: migrateSpy,
        });

        // Hydrate through useAppStore (not adapter alone)
        await useAppStore.persist.rehydrate();

        expect(migrateSpy).toHaveBeenCalledTimes(1);

        // Store update writes back through useAppStore
        useAppStore.getState().updateSettings({ autoDiscardInterval: 15 });

        await new Promise((r) => setTimeout(r, 50));

        const stored = JSON.parse(storageData['tabbellus-settings']);
        expect(stored.version).toBe(2);
        expect(useAppStore.persist.getOptions().version).toBe(2);
    });
});
