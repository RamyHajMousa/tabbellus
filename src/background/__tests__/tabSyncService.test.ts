import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { performSync, clearPendingSyncsForTesting, cancelPendingSync } from '@/background/tabSyncService';
import { db } from '@/lib/db';

describe('Background Tab Sync Service — performSync (In-Place Delta Upsert)', () => {
    let queryTabsMock: ReturnType<typeof vi.fn>;
    let sessionGetMock: ReturnType<typeof vi.fn>;
    let sendMessageMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        queryTabsMock = vi.fn();
        sessionGetMock = vi.fn().mockResolvedValue({});
        sendMessageMock = vi.fn().mockResolvedValue(undefined);

        (globalThis as any).chrome = {
            storage: {
                session: {
                    get: sessionGetMock,
                    set: vi.fn().mockResolvedValue(undefined),
                },
            },
            tabs: {
                query: queryTabsMock,
            },
            runtime: {
                sendMessage: sendMessageMock,
            },
        };
    });

    afterEach(() => {
        clearPendingSyncsForTesting();
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

    it('should assign createdAt/updatedAt on new tabs and bump updatedAt on updates and tombstoning (Constraint 1)', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Timestamp Space',
            createdAt: Date.now(),
        })) as number;

        const initialTime = Date.now() - 10000;
        const tab1Id = (await db.tabs.add({
            spaceId,
            url: 'https://existing-tab.com',
            title: 'Existing Tab',
            order: 0,
            createdAt: initialTime,
            updatedAt: initialTime,
        })) as number;

        const tabToCloseId = (await db.tabs.add({
            spaceId,
            url: 'https://close-me.com',
            title: 'Close Me',
            order: 1,
            createdAt: initialTime,
            updatedAt: initialTime,
        })) as number;

        // Window has existing tab updated, new tab added, and close-me tab omitted
        queryTabsMock.mockResolvedValue([
            { id: 501, windowId: 7001, url: 'https://existing-tab.com', title: 'Existing Tab - Renamed' },
            { id: 502, windowId: 7001, url: 'https://brand-new-tab.com', title: 'Brand New Tab' },
        ]);

        await performSync(7001, spaceId);

        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(3);

        // 1. Existing tab updated: createdAt preserved, updatedAt bumped
        const existingTab = tabs.find(t => t.id === tab1Id)!;
        expect(existingTab.title).toBe('Existing Tab - Renamed');
        expect(existingTab.createdAt).toBe(initialTime);
        expect(existingTab.updatedAt).toBeGreaterThan(initialTime);
        expect(existingTab.deletedAt).toBeUndefined();

        // 2. Brand new tab: both createdAt and updatedAt set to current timestamp
        const newTab = tabs.find(t => t.url === 'https://brand-new-tab.com')!;
        expect(newTab.createdAt).toBeGreaterThan(initialTime);
        expect(newTab.updatedAt).toBeGreaterThan(initialTime);
        expect(newTab.deletedAt).toBeUndefined();

        // 3. Closed tab: deletedAt and updatedAt bumped
        const closedTab = tabs.find(t => t.id === tabToCloseId)!;
        expect(closedTab.deletedAt).toBeGreaterThan(initialTime);
        expect(closedTab.updatedAt).toBeGreaterThan(initialTime);
    });

    it('performSync skips tombstoning missing tabs when window is in restoring mode', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Restoring Space',
            createdAt: Date.now(),
        })) as number;

        const tab1Id = (await db.tabs.add({
            spaceId,
            url: 'https://site-a.com',
            title: 'Site A',
            order: 0,
        })) as number;

        const tab2Id = (await db.tabs.add({
            spaceId,
            url: 'https://site-b.com',
            title: 'Site B',
            order: 1,
        })) as number;

        // Mock window 8001 as currently in restoration mode
        sessionGetMock.mockResolvedValue({
            restoringWindows: { 8001: Date.now() + 10000 },
        });

        // Window only has Site A open (Site B not yet spawned)
        queryTabsMock.mockResolvedValue([
            { id: 801, windowId: 8001, url: 'https://site-a.com', title: 'Site A' },
        ]);

        await performSync(8001, spaceId);

        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(2);

        const tabA = tabs.find(t => t.id === tab1Id)!;
        expect(tabA.deletedAt).toBeUndefined();

        const tabB = tabs.find(t => t.id === tab2Id)!;
        // CRITICAL INVARIANT: Tab B must NOT be tombstoned
        expect(tabB.deletedAt).toBeUndefined();
    });

    it('performSync debounces rapid successive tab creation events', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Debounce Space',
            createdAt: Date.now(),
        })) as number;

        queryTabsMock.mockResolvedValue([
            { id: 901, windowId: 9001, url: 'https://example.com/1', title: 'Page 1' },
        ]);

        // Trigger performSync 3 times rapidly
        const p1 = performSync(9001, spaceId);
        const p2 = performSync(9001, spaceId);
        const p3 = performSync(9001, spaceId);

        await Promise.all([p1, p2, p3]);

        // Assert queryTabsMock was called only ONCE due to trailing-edge debounce
        expect(queryTabsMock).toHaveBeenCalledTimes(1);

        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(1);
    });

    it('performSync dispatches TABBELLUS_LOCAL_MUTATION runtime message when tabs are updated', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Runtime Msg Space',
            createdAt: Date.now(),
        })) as number;

        queryTabsMock.mockResolvedValue([
            { id: 950, windowId: 9501, url: 'https://mutation-test.com', title: 'Mutation Test' },
        ]);

        await performSync(9501, spaceId);

        expect(sendMessageMock).toHaveBeenCalledWith({
            type: 'TABBELLUS_LOCAL_MUTATION',
            source: 'tabSyncService',
        });
    });

    it('cancelPendingSync cancels active debounce timer and prevents sync execution', async () => {
        const spaceId = (await db.spaces.add({
            name: 'Cancel Sync Space',
            createdAt: Date.now(),
        })) as number;

        queryTabsMock.mockResolvedValue([
            { id: 980, windowId: 9801, url: 'https://cancel-test.com', title: 'Cancel Test' },
        ]);

        // Trigger debounced performSync with 50ms window
        performSync(9801, spaceId, { debounceMs: 50 });

        // Cancel immediately before timer fires
        cancelPendingSync(9801);

        // Wait past the debounce delay
        await new Promise((resolve) => setTimeout(resolve, 80));

        // queryTabsMock should never have been invoked
        expect(queryTabsMock).not.toHaveBeenCalled();

        // Database should remain untouched (zero tabs)
        const tabs = await db.tabs.where({ spaceId }).toArray();
        expect(tabs).toHaveLength(0);

        // Safe no-op on non-existent windowId
        expect(() => cancelPendingSync(99999)).not.toThrow();
    });
});

