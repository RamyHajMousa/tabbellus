import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLaunchpadData } from '../useLaunchpadData';
import { db } from '@/lib/db';

describe('Launchpad Data Aggregation (fetchLaunchpadData)', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Clear Dexie database
        await db.spaces.clear();
        await db.tabs.clear();
    });

    it('should return empty lists when chrome APIs return empty arrays', async () => {
        (globalThis as any).chrome = {
            topSites: {
                get: vi.fn((cb) => cb([])),
            },
            sessions: {
                getRecentlyClosed: vi.fn((_opts, cb) => cb([])),
            },
            runtime: {},
        };

        const data = await fetchLaunchpadData();
        expect(data.topSites).toEqual([]);
        expect(data.pinnedSpaces).toEqual([]);
        expect(data.recentSessions).toEqual([]);
    });

    it('should aggregate top sites, pinned spaces, and recent sessions', async () => {
        // Mock chrome.topSites
        const mockTopSites = [
            { url: 'https://github.com', title: 'GitHub' },
            { url: 'https://news.ycombinator.com', title: 'Hacker News' },
            { url: 'https://reddit.com', title: 'Reddit' },
        ];

        const mockSessions = [
            {
                lastModified: 1700000000,
                tab: {
                    sessionId: 'tab-1',
                    url: 'https://example.com/docs',
                    title: 'Documentation',
                },
            },
            {
                lastModified: 1700000050,
                window: {
                    sessionId: 'win-1',
                    tabs: [
                        { sessionId: 'tab-2', url: 'https://test1.com' },
                        { sessionId: 'tab-3', url: 'https://test2.com' },
                    ],
                },
            },
        ];

        // Seed Dexie with a pinned space and unpinned space
        const spaceId1 = await db.spaces.add({
            name: 'Work Space',
            createdAt: Date.now(),
            isPinned: true,
            color: 'blue',
        });

        await db.tabs.add({
            spaceId: spaceId1 as number,
            url: 'https://work.com',
            title: 'Work Dashboard',
            order: 0,
        });

        await db.spaces.add({
            name: 'Personal Space',
            createdAt: Date.now(),
            isPinned: false,
        });

        // Set global chrome mocks
        (globalThis as any).chrome = {
            topSites: {
                get: vi.fn((cb) => cb(mockTopSites)),
            },
            sessions: {
                getRecentlyClosed: vi.fn((_opts, cb) => cb(mockSessions)),
            },
            runtime: {},
        };

        const data = await fetchLaunchpadData();

        // Top Sites verification
        expect(data.topSites.length).toBe(3);
        expect(data.topSites[0].title).toBe('GitHub');
        expect(data.topSites[0].url).toBe('https://github.com');

        // Pinned Spaces verification
        expect(data.pinnedSpaces.length).toBe(1);
        expect(data.pinnedSpaces[0].name).toBe('Work Space');
        expect(data.pinnedSpaces[0].tabCount).toBe(1);

        // Recent Sessions verification
        expect(data.recentSessions.length).toBe(2);
        expect(data.recentSessions[0].title).toBe('Documentation');
        expect(data.recentSessions[0].isWindow).toBe(false);
        expect(data.recentSessions[1].title).toBe('Window (2 tabs)');
        expect(data.recentSessions[1].isWindow).toBe(true);
    });

    it('should clamp top sites to 6 items maximum', async () => {
        const mockEightSites = Array.from({ length: 8 }, (_, i) => ({
            url: `https://site${i}.com`,
            title: `Site ${i}`,
        }));

        (globalThis as any).chrome = {
            topSites: {
                get: vi.fn((cb) => cb(mockEightSites)),
            },
            sessions: {
                getRecentlyClosed: vi.fn((_opts, cb) => cb([])),
            },
            runtime: {},
        };

        const data = await fetchLaunchpadData();
        expect(data.topSites.length).toBe(6);
    });

    it('should clamp recent sessions to 3 items maximum', async () => {
        const mockFiveSessions = Array.from({ length: 5 }, (_, i) => ({
            lastModified: 1700000000 + i,
            tab: {
                sessionId: `tab-${i}`,
                url: `https://site${i}.com`,
                title: `Site ${i}`,
            },
        }));

        (globalThis as any).chrome = {
            topSites: {
                get: vi.fn((cb) => cb([])),
            },
            sessions: {
                getRecentlyClosed: vi.fn((_opts, cb) => cb(mockFiveSessions)),
            },
            runtime: {},
        };

        const data = await fetchLaunchpadData();
        expect(data.recentSessions.length).toBe(3);
    });

    it('should handle API errors and missing chrome gracefully', async () => {
        (globalThis as any).chrome = {
            topSites: {
                get: vi.fn((_cb) => {
                    throw new Error('API Error');
                }),
            },
            sessions: {
                getRecentlyClosed: vi.fn((_opts, _cb) => {
                    throw new Error('Sessions Error');
                }),
            },
            runtime: {},
        };

        const data = await fetchLaunchpadData();
        expect(data.topSites).toEqual([]);
        expect(data.recentSessions).toEqual([]);
    });
});
