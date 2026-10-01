import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore, DEFAULT_SETTINGS, initSettingsStorageListener } from '../appStore';
import { contractRegistry } from '@/core/contracts/registry';

describe('useAppStore Rehydration & Concurrency Guards (T1–T4)', () => {
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

    it('T1: Start a rehydrate whose getItem resolves after a delay; during it, call updateSettings({ ...change }) -> after both settle, storage and in-memory state contain the user change', async () => {
        // Initial setup in storage
        const initialStored = JSON.stringify({
            state: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    theme: 'light',
                    spaceRestoreTrigger: 'single',
                },
            },
            version: 0,
        });
        storageData['tabbellus-settings'] = initialStored;

        // Make getItem delayed by 50ms
        getItemDelay = 50;

        // Start rehydration
        const rehydratePromise = useAppStore.persist.rehydrate();

        // While rehydration is in flight, user updates settings
        useAppStore.getState().updateSettings({
            theme: 'dark',
            spaceRestoreTrigger: 'double',
        });

        // Wait for rehydration to settle
        await rehydratePromise;
        await new Promise((r) => setTimeout(r, 80));

        // In-memory state must contain the user's change
        const state = useAppStore.getState();
        expect(state.settings.theme).toBe('dark');
        expect(state.settings.spaceRestoreTrigger).toBe('double');

        // Storage must also contain the user's change (not dropped or overwritten by old state)
        const rawStored = storageData['tabbellus-settings'];
        expect(rawStored).toBeDefined();
        const parsed = typeof rawStored === 'string' ? JSON.parse(rawStored) : rawStored;
        expect(parsed.state.settings.theme).toBe('dark');
        expect(parsed.state.settings.spaceRestoreTrigger).toBe('double');
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
});
