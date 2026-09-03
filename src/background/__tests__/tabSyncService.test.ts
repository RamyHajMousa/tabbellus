import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performSync } from '@/background/tabSyncService';
import { db } from '@/lib/db';

describe('Background Tab Sync Service — performSync (In-Place Delta Upsert)', () => {
    let queryTabsMock: ReturnType<typeof vi.fn>;
    let sessionGetMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        queryTabsMock = vi.fn();
        sessionGetMock = vi.fn().mockResolvedValue({});

        (globalThis as any).chrome = {
            storage: {
                session: {
                    get: sessionGetMock,
                    set: vi.fn(),
                },
            },
            tabs: {
                query: queryTabsMock,
            },
        };
    });

    it('should update tab order and metadata in place while strictly preserving original auto-increment IDs', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Work Space',
            createdAt: Date.now(),
        })) as number;

        const tab1Id = (await db.tabs.add({
            spaceId,
            url: 'https://github.com/project',
            title: 'GitHub - Project',
            favicon: 'https://github.com/favicon.ico',
            order: 0,
        })) as number;

        const tab2Id = (await db.tabs.add({
            spaceId,
            url: 'https://linear.app/issue/1',
            title: 'Linear Issue',
            favicon: 'https://linear.app/favicon.ico',
            order: 1,
        })) as number;

        // Simulate user swapped tab order in the active Chrome window
        queryTabsMock.mockResolvedValue([
            {
                id: 101,
                windowId: 2001,
                url: 'https://linear.app/issue/1',
                title: 'Linear Issue - Updated Title',
                favIconUrl: 'https://linear.app/favicon.ico',
            },
            {
                id: 102,
                windowId: 2001,
                url: 'https://github.com/project',
                title: 'GitHub - Project',
                favIconUrl: 'https://github.com/favicon.ico',
            },
        ]);

        await performSync(2001, spaceId);

        // Fetch all tabs from Dexie
        const tabsInDb = await db.tabs.where({ spaceId }).toArray();
        expect(tabsInDb).toHaveLength(2);

        // Assert original IDs are completely preserved (no delete-and-reinsert)
        const linearTab = tabsInDb.find(t => t.id === tab2Id);
        expect(linearTab).toBeDefined();
        expect(linearTab!.order).toBe(0);
        expect(linearTab!.title).toBe('Linear Issue - Updated Title');
        expect(linearTab!.deletedAt).toBeUndefined();

        const githubTab = tabsInDb.find(t => t.id === tab1Id);
        expect(githubTab).toBeDefined();
        expect(githubTab!.order).toBe(1);
        expect(githubTab!.deletedAt).toBeUndefined();
    });

    it('should tombstone closed tabs with deletedAt instead of destroying rows', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Research Space',
            createdAt: Date.now(),
        })) as number;

        const t1 = (await db.tabs.add({
            spaceId,
            url: 'https://docs.google.com/doc/1',
            title: 'Doc 1',
            order: 0,
        })) as number;

        const t2 = (await db.tabs.add({
            spaceId,
            url: 'https://docs.google.com/doc/2',
            title: 'Doc 2',
            order: 1,
        })) as number;

        const t3 = (await db.tabs.add({
            spaceId,
            url: 'https://docs.google.com/doc/3',
            title: 'Doc 3',
            order: 2,
        })) as number;

        // User closed doc 2 in Chrome; only doc 1 and doc 3 remain open
        queryTabsMock.mockResolvedValue([
            {
                id: 101,
                windowId: 3001,
                url: 'https://docs.google.com/doc/1',
                title: 'Doc 1',
            },
            {
                id: 103,
                windowId: 3001,
                url: 'https://docs.google.com/doc/3',
                title: 'Doc 3',
            },
        ]);

        await performSync(3001, spaceId);

        // Dexie must STILL contain 3 rows (zero row loss)
        const allDbTabs = await db.tabs.where({ spaceId }).toArray();
        expect(allDbTabs).toHaveLength(3);

        // Tab 2 must be tombstoned
        const tombstone = await db.tabs.get(t2);
        expect(tombstone).toBeDefined();
        expect(tombstone!.deletedAt).toBeTypeOf('number');
        expect(tombstone!.deletedAt).toBeGreaterThan(0);

        // Tab 1 and 3 must remain active
        const tab1 = await db.tabs.get(t1);
        expect(tab1!.deletedAt).toBeUndefined();
        expect(tab1!.order).toBe(0);

        const tab3 = await db.tabs.get(t3);
        expect(tab3!.deletedAt).toBeUndefined();
        expect(tab3!.order).toBe(1);
    });

    it('should revive a tombstoned tab when reopened and preserve its original ID', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Revival Space',
            createdAt: Date.now(),
        })) as number;

        const tabId = (await db.tabs.add({
            spaceId,
            url: 'https://figma.com/file/xyz',
            title: 'Old Figma File',
            order: 0,
            deletedAt: Date.now() - 60000, // previously closed tab
        })) as number;

        // User reopens the Figma tab in window
        queryTabsMock.mockResolvedValue([
            {
                id: 201,
                windowId: 4001,
                url: 'https://figma.com/file/xyz',
                title: 'Fresh Figma File Title',
                favIconUrl: 'https://figma.com/favicon.ico',
            },
        ]);

        await performSync(4001, spaceId);

        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(1);

        const revivedTab = tabs[0];
        expect(revivedTab.id).toBe(tabId); // Preserves primary key
        expect(revivedTab.title).toBe('Fresh Figma File Title');
        expect(revivedTab.favicon).toBe('https://figma.com/favicon.ico');
        expect(revivedTab.order).toBe(0);
        expect(revivedTab.deletedAt).toBeUndefined(); // Tombstone cleared
    });

    it('should resolve spaceId from session storage activeSpaces when not explicitly provided', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Mapped Space',
            createdAt: Date.now(),
        })) as number;

        sessionGetMock.mockResolvedValue({
            activeSpaces: {
                [spaceId.toString()]: 5001,
            },
        });

        queryTabsMock.mockResolvedValue([
            {
                id: 301,
                windowId: 5001,
                url: 'https://mapped.com/test',
                title: 'Mapped Tab',
            },
        ]);

        await performSync(5001); // explicitSpaceId omitted

        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(1);
        expect(tabs[0].url).toBe('https://mapped.com/test');
    });

    it('should safely skip execution if window contains only internal or invalid URLs', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Protected Space',
            createdAt: Date.now(),
        })) as number;

        await db.tabs.add({
            spaceId,
            url: 'https://important.com',
            title: 'Important Page',
            order: 0,
        });

        // Window temporarily in chrome://newtab or about:blank
        queryTabsMock.mockResolvedValue([
            { id: 401, windowId: 6001, url: 'chrome://newtab/' },
            { id: 402, windowId: 6001, url: 'about:blank' },
            { id: 403, windowId: 6001, url: 'edge://settings/' },
        ]);

        await performSync(6001, spaceId);

        // Pre-existing tab must NOT be wiped or corrupted
        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(1);
        expect(tabs[0].url).toBe('https://important.com');
        expect(tabs[0].deletedAt).toBeUndefined();
    });
});
