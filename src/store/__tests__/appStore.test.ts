import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, DEFAULT_SETTINGS } from '../appStore';

describe('useAppStore Settings Slice', () => {
    beforeEach(() => {
        // Reset store to default state
        useAppStore.setState({
            settings: { ...DEFAULT_SETTINGS },
            theme: DEFAULT_SETTINGS.theme,
            showDomain: DEFAULT_SETTINGS.showDomain,
            badgeMode: DEFAULT_SETTINGS.badgeMode,
            activeView: 'spaces',
            recentSearches: [],
        });
    });

    it('should initialize with default AppSettings', () => {
        const state = useAppStore.getState();
        expect(state.settings).toEqual({
            theme: 'system',
            badgeMode: 'read-later',
            showDomain: true,
            readLaterOpenBehavior: 'foreground',
            readLaterAutoArchive: true,
            autoDiscardInterval: 0,
            spaceRestoreTrigger: 'single',
            duplicateTabBehavior: 'focus-existing',
            settingsUpdatedAt: 0,
        });
        expect(state.theme).toBe('system');
        expect(state.showDomain).toBe(true);
        expect(state.badgeMode).toBe('read-later');
    });

    it('should update theme and sync backward-compatible accessor via setTheme', () => {
        useAppStore.getState().setTheme('dark');
        const state = useAppStore.getState();
        expect(state.theme).toBe('dark');
        expect(state.settings.theme).toBe('dark');
        expect(state.settings.showDomain).toBe(true);
        expect(state.settings.badgeMode).toBe('read-later');
    });

    it('should update showDomain and sync backward-compatible accessor via setShowDomain', () => {
        useAppStore.getState().setShowDomain(false);
        const state = useAppStore.getState();
        expect(state.showDomain).toBe(false);
        expect(state.settings.showDomain).toBe(false);
        expect(state.settings.theme).toBe('system');
    });

    it('should update badgeMode and sync backward-compatible accessor via setBadgeMode', () => {
        useAppStore.getState().setBadgeMode('tabs');
        const state = useAppStore.getState();
        expect(state.badgeMode).toBe('tabs');
        expect(state.settings.badgeMode).toBe('tabs');
    });

    it('should update readLaterOpenBehavior via setReadLaterOpenBehavior', () => {
        useAppStore.getState().setReadLaterOpenBehavior('background');
        const state = useAppStore.getState();
        expect(state.settings.readLaterOpenBehavior).toBe('background');
    });

    it('should update readLaterAutoArchive via setReadLaterAutoArchive', () => {
        useAppStore.getState().setReadLaterAutoArchive(false);
        const state = useAppStore.getState();
        expect(state.settings.readLaterAutoArchive).toBe(false);
    });

    it('should update autoDiscardInterval via setAutoDiscardInterval', () => {
        useAppStore.getState().setAutoDiscardInterval(30);
        const state = useAppStore.getState();
        expect(state.settings.autoDiscardInterval).toBe(30);
    });

    it('should update spaceRestoreTrigger via setSpaceRestoreTrigger', () => {
        useAppStore.getState().setSpaceRestoreTrigger('double');
        const state = useAppStore.getState();
        expect(state.settings.spaceRestoreTrigger).toBe('double');
    });

    it('should update duplicateTabBehavior via setDuplicateTabBehavior', () => {
        useAppStore.getState().setDuplicateTabBehavior('allow');
        const state = useAppStore.getState();
        expect(state.settings.duplicateTabBehavior).toBe('allow');
    });

    it('should update partial settings atomically via updateSettings', () => {
        useAppStore.getState().updateSettings({
            theme: 'light',
            showDomain: false,
            badgeMode: 'none',
            readLaterOpenBehavior: 'background',
            readLaterAutoArchive: false,
            autoDiscardInterval: 60,
            spaceRestoreTrigger: 'double',
            duplicateTabBehavior: 'allow',
        });
        const state = useAppStore.getState();
        expect(state.settings).toEqual({
            theme: 'light',
            showDomain: false,
            badgeMode: 'none',
            readLaterOpenBehavior: 'background',
            readLaterAutoArchive: false,
            autoDiscardInterval: 60,
            spaceRestoreTrigger: 'double',
            duplicateTabBehavior: 'allow',
            settingsUpdatedAt: expect.any(Number),
        });
        expect(state.theme).toBe('light');
        expect(state.showDomain).toBe(false);
        expect(state.badgeMode).toBe('none');
    });

    it('should preserve explicitly passed settingsUpdatedAt and respect skipMutationNotification (Requirement 3)', () => {
        const explicitTimestamp = 1234567890;
        useAppStore.getState().updateSettings(
            {
                duplicateTabBehavior: 'allow',
                settingsUpdatedAt: explicitTimestamp,
            },
            { skipMutationNotification: true },
        );
        const state = useAppStore.getState();
        expect(state.settings.duplicateTabBehavior).toBe('allow');
        expect(state.settings.settingsUpdatedAt).toBe(explicitTimestamp);
    });

    it('should handle persist merge fallback for legacy storage payload lacking settings object and new properties', () => {
        const persistOptions = (useAppStore as any).persist.getOptions();
        const mergeFn = persistOptions.merge;

        // Legacy state without settings object, showDomain, badgeMode, or readLater settings
        const legacyPersistedState = {
            theme: 'dark',
            activeView: 'read-later',
            recentSearches: ['test'],
        };

        const currentState = useAppStore.getState();
        const merged = mergeFn(legacyPersistedState, currentState);

        expect(merged.settings).toEqual({
            theme: 'dark',
            badgeMode: 'read-later',
            showDomain: true,
            readLaterOpenBehavior: 'foreground',
            readLaterAutoArchive: true,
            autoDiscardInterval: 0,
            spaceRestoreTrigger: 'single',
            duplicateTabBehavior: 'focus-existing',
        });
        expect(merged.theme).toBe('dark');
        expect(merged.showDomain).toBe(true);
        expect(merged.badgeMode).toBe('read-later');
        expect(merged.activeView).toBe('read-later');
        expect(merged.recentSearches).toEqual(['test']);
    });

    it('should handle persist merge with modern settings payload', () => {
        const persistOptions = (useAppStore as any).persist.getOptions();
        const mergeFn = persistOptions.merge;

        const modernPersistedState = {
            settings: {
                theme: 'light',
                showDomain: false,
                badgeMode: 'tabs',
                readLaterOpenBehavior: 'background',
                readLaterAutoArchive: false,
                autoDiscardInterval: 120,
                spaceRestoreTrigger: 'double',
                duplicateTabBehavior: 'allow',
            },
            activeView: 'spaces',
            recentSearches: [],
        };

        const currentState = useAppStore.getState();
        const merged = mergeFn(modernPersistedState, currentState);

        expect(merged.settings).toEqual({
            theme: 'light',
            showDomain: false,
            badgeMode: 'tabs',
            readLaterOpenBehavior: 'background',
            readLaterAutoArchive: false,
            autoDiscardInterval: 120,
            spaceRestoreTrigger: 'double',
            duplicateTabBehavior: 'allow',
        });
        expect(merged.theme).toBe('light');
        expect(merged.showDomain).toBe(false);
        expect(merged.badgeMode).toBe('tabs');
    });
});
