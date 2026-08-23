import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryAudioTabs } from '../useAudioTabs';
import { useActiveMediaSession } from '../useActiveMediaSession';

describe('queryAudioTabs Data Service & Mute State', () => {
    let mockTab1: chrome.tabs.Tab;
    let mockTab2: chrome.tabs.Tab;

    beforeEach(() => {
        vi.restoreAllMocks();
        useActiveMediaSession.getState().clearAllSessions();

        mockTab1 = {
            id: 101,
            url: 'https://youtube.com/watch?v=abc',
            title: 'Video 1',
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
            mutedInfo: { muted: false },
        };

        mockTab2 = {
            id: 102,
            url: 'https://spotify.com/track/123',
            title: 'Track 2',
            audible: false,
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
            mutedInfo: { muted: true },
        };

        (globalThis as any).chrome = {
            tabs: {
                query: vi.fn().mockImplementation(async ({ audible, muted }: { audible?: boolean; muted?: boolean }) => {
                    const results: chrome.tabs.Tab[] = [];
                    if (audible) {
                        if (mockTab1.audible) results.push(mockTab1);
                        if (mockTab2.audible) results.push(mockTab2);
                    }
                    if (muted) {
                        if (mockTab1.mutedInfo?.muted) results.push(mockTab1);
                        if (mockTab2.mutedInfo?.muted) results.push(mockTab2);
                    }
                    return results;
                }),
                get: vi.fn().mockImplementation(async (id: number) => {
                    if (id === mockTab1.id) return mockTab1;
                    if (id === mockTab2.id) return mockTab2;
                    throw new Error('Tab not found');
                }),
                update: vi.fn().mockResolvedValue({}),
            },
        };
    });

    it('discovers and returns audible tabs and populates tracking map', async () => {
        mockTab1.audible = true;
        const trackedMap = new Map<number, string>();

        const tabs = await queryAudioTabs(trackedMap);

        expect(tabs.map(t => t.id)).toContain(101);
        expect(trackedMap.has(101)).toBe(true);
    });

    it('discovers and retains muted tabs even when audible is false', async () => {
        const trackedMap = new Map<number, string>();

        const tabs = await queryAudioTabs(trackedMap);

        expect(tabs.map(t => t.id)).toContain(102);
        expect(trackedMap.has(102)).toBe(true);
    });

    it('retains audio tab when paused (audible becomes false) via tracking map', async () => {
        const trackedMap = new Map<number, string>([[101, 'https://youtube.com/watch?v=abc']]);
        mockTab1.audible = false; // Tab paused

        const tabs = await queryAudioTabs(trackedMap);

        // Retains tab even though audible is now false
        expect(tabs.map(t => t.id)).toContain(101);
        const tab1 = tabs.find(t => t.id === 101);
        expect(tab1?.audible).toBe(false);
    });

    it('removes discarded tabs from tracking map', async () => {
        const trackedMap = new Map<number, string>([[101, 'https://youtube.com/watch?v=abc']]);
        mockTab1.discarded = true;

        const tabs = await queryAudioTabs(trackedMap);

        expect(tabs.find(t => t.id === 101)).toBeUndefined();
        expect(trackedMap.has(101)).toBe(false);
    });

    it('removes tab if URL navigates away', async () => {
        const trackedMap = new Map<number, string>([[101, 'https://youtube.com/watch?v=abc']]);
        mockTab1.url = 'https://github.com/trending';
        mockTab1.audible = false;

        const tabs = await queryAudioTabs(trackedMap);

        expect(tabs.find(t => t.id === 101)).toBeUndefined();
        expect(trackedMap.has(101)).toBe(false);
    });

    it('integrates with active media session in useActiveMediaSession store', async () => {
        const trackedMap = new Map<number, string>();
        useActiveMediaSession.getState().setTabMediaState(101, 'paused', 'https://youtube.com/watch?v=abc');
        mockTab1.audible = false;

        const tabs = await queryAudioTabs(trackedMap);

        expect(tabs.map(t => t.id)).toContain(101);
    });

    it('correctly evaluates all-muted predicate for bulk action', () => {
        const audioTabs = [
            { id: 101, mutedInfo: { muted: true } } as chrome.tabs.Tab,
            { id: 102, mutedInfo: { muted: true } } as chrome.tabs.Tab,
        ];

        const isAllMuted = audioTabs.length > 0 && audioTabs.every(t => t.mutedInfo?.muted);
        expect(isAllMuted).toBe(true);

        const mixedAudioTabs = [
            { id: 101, mutedInfo: { muted: true } } as chrome.tabs.Tab,
            { id: 102, mutedInfo: { muted: false } } as chrome.tabs.Tab,
        ];

        const isMixedAllMuted = mixedAudioTabs.length > 0 && mixedAudioTabs.every(t => t.mutedInfo?.muted);
        expect(isMixedAllMuted).toBe(false);
    });
});
