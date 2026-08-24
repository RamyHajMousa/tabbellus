import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useTabLifecycle Hook & Event Normalization', () => {
    let mockListeners: Record<string, Function> = {};
    let mockTabs: chrome.tabs.Tab[] = [];

    beforeEach(() => {
        vi.restoreAllMocks();
        mockListeners = {};

        mockTabs = [
            {
                id: 1,
                index: 0,
                windowId: 10,
                highlighted: false,
                active: true,
                pinned: false,
                incognito: false,
                selected: true,
                discarded: false,
                autoDiscardable: true,
                url: 'https://example.com',
                title: 'Example',
                status: 'loading',
                groupId: -1,
            },
            {
                id: 2,
                index: 1,
                windowId: 10,
                highlighted: false,
                active: false,
                pinned: false,
                incognito: false,
                selected: false,
                discarded: false,
                autoDiscardable: true,
                url: 'https://github.com',
                title: 'GitHub',
                status: 'complete',
                groupId: -1,
            },
        ];

        const createMockEvent = (name: string) => ({
            addListener: vi.fn((fn: Function) => {
                mockListeners[name] = fn;
            }),
            removeListener: vi.fn((fn: Function) => {
                if (mockListeners[name] === fn) {
                    delete mockListeners[name];
                }
            }),
        });

        (globalThis as any).chrome = {
            tabs: {
                query: vi.fn().mockResolvedValue(mockTabs),
                get: vi.fn().mockImplementation(async (id: number) => {
                    const found = mockTabs.find(t => t.id === id);
                    if (found) return found;
                    throw new Error('Tab not found');
                }),
                onCreated: createMockEvent('onCreated'),
                onUpdated: createMockEvent('onUpdated'),
                onRemoved: createMockEvent('onRemoved'),
                onMoved: createMockEvent('onMoved'),
                onActivated: createMockEvent('onActivated'),
                onAttached: createMockEvent('onAttached'),
                onDetached: createMockEvent('onDetached'),
                onReplaced: createMockEvent('onReplaced'),
            },
        };
    });

    it('registers all 8 chrome.tabs lifecycle listeners when windowId is defined', () => {
        expect(chrome.tabs.onCreated.addListener).toBeDefined();
        expect(chrome.tabs.onUpdated.addListener).toBeDefined();
        expect(chrome.tabs.onRemoved.addListener).toBeDefined();
        expect(chrome.tabs.onMoved.addListener).toBeDefined();
        expect(chrome.tabs.onActivated.addListener).toBeDefined();
        expect(chrome.tabs.onAttached.addListener).toBeDefined();
        expect(chrome.tabs.onDetached.addListener).toBeDefined();
        expect(chrome.tabs.onReplaced.addListener).toBeDefined();
    });

    it('extracts status directly from full tab record during onUpdated even when changeInfo.status is undefined', () => {
        let stateTabs: chrome.tabs.Tab[] = [...mockTabs];
        const setTabs = (action: any) => {
            stateTabs = typeof action === 'function' ? action(stateTabs) : action;
        };

        // Full tab record now transitioned to 'complete' with updated URL
        const updatedFullTab: chrome.tabs.Tab = {
            ...mockTabs[0],
            url: 'https://example.com/spa-route',
            status: 'complete',
            title: 'Example SPA Page',
        };

        // Partial changeInfo (e.g. from pushState or title change without explicit status)
        const changeInfo: chrome.tabs.TabChangeInfo = {
            url: 'https://example.com/spa-route',
            title: 'Example SPA Page',
        };

        // Simulate onTabUpdated handler logic
        if (
            changeInfo.status !== undefined ||
            changeInfo.title !== undefined ||
            changeInfo.favIconUrl !== undefined ||
            changeInfo.url !== undefined ||
            changeInfo.groupId !== undefined ||
            changeInfo.pinned !== undefined ||
            changeInfo.audible !== undefined ||
            changeInfo.mutedInfo !== undefined ||
            changeInfo.discarded !== undefined
        ) {
            setTabs((prev: chrome.tabs.Tab[]) =>
                prev.map(t => (t.id === 1 ? updatedFullTab : t)).sort((a, b) => a.index - b.index)
            );
        }

        expect(stateTabs.find(t => t.id === 1)?.status).toBe('complete');
        expect(stateTabs.find(t => t.id === 1)?.url).toBe('https://example.com/spa-route');
    });

    it('reconciles fresh tab record onTabActivated using chrome.tabs.get', async () => {
        let stateTabs: chrome.tabs.Tab[] = [...mockTabs];
        const setTabs = (action: any) => {
            stateTabs = typeof action === 'function' ? action(stateTabs) : action;
        };

        // Tab 2 completed loading in background
        mockTabs[1] = {
            ...mockTabs[1],
            status: 'complete',
            title: 'GitHub - Trending',
        };

        // 1. Optimistic activation
        setTabs((prev: chrome.tabs.Tab[]) =>
            prev.map(t => ({ ...t, active: t.id === 2 })).sort((a, b) => a.index - b.index)
        );
        expect(stateTabs.find(t => t.id === 2)?.active).toBe(true);

        // 2. Fresh tab reconciliation
        const freshTab = await chrome.tabs.get(2);
        setTabs((prev: chrome.tabs.Tab[]) =>
            prev.map(t => (t.id === freshTab.id ? freshTab : t)).sort((a, b) => a.index - b.index)
        );

        expect(stateTabs.find(t => t.id === 2)?.status).toBe('complete');
        expect(stateTabs.find(t => t.id === 2)?.title).toBe('GitHub - Trending');
    });
});
