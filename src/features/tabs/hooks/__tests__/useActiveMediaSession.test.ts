import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useActiveMediaSession } from '../useActiveMediaSession';
import * as mediaService from '@/lib/mediaService';

describe('useActiveMediaSession Multi-Tab Registry Store', () => {
    let updateListeners: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void)[] = [];
    let removeListeners: ((tabId: number) => void)[] = [];

    beforeEach(() => {
        vi.restoreAllMocks();
        updateListeners = [];
        removeListeners = [];

        // Reset Zustand store state
        useActiveMediaSession.getState().clearAllSessions();

        // Chrome API Mocks
        (globalThis as any).chrome = {
            tabs: {
                query: vi.fn().mockResolvedValue([]),
                onUpdated: {
                    addListener: vi.fn((fn) => updateListeners.push(fn)),
                    removeListener: vi.fn(),
                },
                onRemoved: {
                    addListener: vi.fn((fn) => removeListeners.push(fn)),
                    removeListener: vi.fn(),
                },
            },
        };
    });

    it('initializes with an empty mediaSessions dictionary', () => {
        const state = useActiveMediaSession.getState();
        expect(state.mediaSessions).toEqual({});
        expect(state.lastKnownUrls).toEqual({});
    });

    it('tracks multiple concurrent audible tabs simultaneously as playing', () => {
        const cleanup = useActiveMediaSession.getState().initSessionListener();

        const tabA: chrome.tabs.Tab = {
            id: 101,
            url: 'https://youtube.com/watch?v=1',
            title: 'Video A',
            audible: true,
            active: true,
            index: 0,
            pinned: false,
            highlighted: false,
            windowId: 1,
            incognito: false,
            selected: false,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
        };

        const tabB: chrome.tabs.Tab = {
            id: 102,
            url: 'https://spotify.com/track/2',
            title: 'Track B',
            audible: true,
            active: false,
            index: 1,
            pinned: false,
            highlighted: false,
            windowId: 1,
            incognito: false,
            selected: false,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
        };

        // Trigger onUpdated for both tabs
        updateListeners.forEach((fn) => fn(101, { audible: true }, tabA));
        updateListeners.forEach((fn) => fn(102, { audible: true }, tabB));

        const state = useActiveMediaSession.getState();
        expect(state.mediaSessions[101]).toBe('playing');
        expect(state.mediaSessions[102]).toBe('playing');
        expect(state.lastKnownUrls[101]).toBe('https://youtube.com/watch?v=1');
        expect(state.lastKnownUrls[102]).toBe('https://spotify.com/track/2');

        cleanup();
    });

    it('pausing Tab A updates Tab A to paused while Tab B remains playing', () => {
        const cleanup = useActiveMediaSession.getState().initSessionListener();

        const tabA: chrome.tabs.Tab = {
            id: 101,
            url: 'https://youtube.com/watch?v=1',
            audible: true,
            active: true,
            index: 0,
            pinned: false,
            highlighted: false,
            windowId: 1,
            incognito: false,
            selected: false,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
        };

        const tabB: chrome.tabs.Tab = {
            id: 102,
            url: 'https://spotify.com/track/2',
            audible: true,
            active: false,
            index: 1,
            pinned: false,
            highlighted: false,
            windowId: 1,
            incognito: false,
            selected: false,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
        };

        updateListeners.forEach((fn) => fn(101, { audible: true }, tabA));
        updateListeners.forEach((fn) => fn(102, { audible: true }, tabB));

        // Tab A sound turns off (pause)
        updateListeners.forEach((fn) => fn(101, { audible: false }, { ...tabA, audible: false }));

        const state = useActiveMediaSession.getState();
        expect(state.mediaSessions[101]).toBe('paused');
        expect(state.mediaSessions[102]).toBe('playing');

        cleanup();
    });

    it('closing Tab A removes only Tab A from the dictionary', () => {
        const cleanup = useActiveMediaSession.getState().initSessionListener();

        useActiveMediaSession.getState().setTabMediaState(101, 'playing', 'https://youtube.com/1');
        useActiveMediaSession.getState().setTabMediaState(102, 'playing', 'https://spotify.com/2');

        // Close Tab 101
        removeListeners.forEach((fn) => fn(101));

        const state = useActiveMediaSession.getState();
        expect(state.mediaSessions[101]).toBeUndefined();
        expect(state.mediaSessions[102]).toBe('playing');

        cleanup();
    });

    it('navigating Tab A to a new URL tears down only Tab A session', () => {
        const cleanup = useActiveMediaSession.getState().initSessionListener();

        useActiveMediaSession.getState().setTabMediaState(101, 'playing', 'https://youtube.com/watch?v=1');
        useActiveMediaSession.getState().setTabMediaState(102, 'playing', 'https://spotify.com/track/2');

        const navigatedTabA: chrome.tabs.Tab = {
            id: 101,
            url: 'https://github.com/trending',
            active: true,
            index: 0,
            pinned: false,
            highlighted: false,
            windowId: 1,
            incognito: false,
            selected: false,
            discarded: false,
            autoDiscardable: true,
            groupId: -1,
        };

        // URL changed for tab 101
        updateListeners.forEach((fn) => fn(101, { url: 'https://github.com/trending' }, navigatedTabA));

        const state = useActiveMediaSession.getState();
        expect(state.mediaSessions[101]).toBeUndefined();
        expect(state.mediaSessions[102]).toBe('playing');

        cleanup();
    });

    it('discarding Tab A tears down only Tab A session', () => {
        const cleanup = useActiveMediaSession.getState().initSessionListener();

        useActiveMediaSession.getState().setTabMediaState(101, 'paused', 'https://youtube.com/1');
        useActiveMediaSession.getState().setTabMediaState(102, 'playing', 'https://spotify.com/2');

        const discardedTabA: chrome.tabs.Tab = {
            id: 101,
            url: 'https://youtube.com/1',
            discarded: true,
            active: false,
            index: 0,
            pinned: false,
            highlighted: false,
            windowId: 1,
            incognito: false,
            selected: false,
            autoDiscardable: true,
            groupId: -1,
        };

        updateListeners.forEach((fn) => fn(101, { discarded: true }, discardedTabA));

        const state = useActiveMediaSession.getState();
        expect(state.mediaSessions[101]).toBeUndefined();
        expect(state.mediaSessions[102]).toBe('playing');

        cleanup();
    });

    it('toggles playback optimistically for a specific tab and updates with verified state', async () => {
        const spy = vi.spyOn(mediaService, 'toggleMediaPlayback').mockResolvedValue({
            success: true,
            state: 'paused',
        });

        useActiveMediaSession.getState().setTabMediaState(101, 'playing', 'https://youtube.com');
        useActiveMediaSession.getState().setTabMediaState(102, 'playing', 'https://spotify.com');

        await useActiveMediaSession.getState().togglePlayback(101);

        expect(spy).toHaveBeenCalledWith(101);
        expect(useActiveMediaSession.getState().mediaSessions[101]).toBe('paused');
        expect(useActiveMediaSession.getState().mediaSessions[102]).toBe('playing');
    });

    it('reverts optimistic playback state for target tab if toggleMediaPlayback fails', async () => {
        vi.spyOn(mediaService, 'toggleMediaPlayback').mockResolvedValue({
            success: false,
            error: 'Injection failed',
        });

        useActiveMediaSession.getState().setTabMediaState(101, 'playing', 'https://youtube.com');

        await useActiveMediaSession.getState().togglePlayback(101);

        // Reverted to playing
        expect(useActiveMediaSession.getState().mediaSessions[101]).toBe('playing');
    });
});
