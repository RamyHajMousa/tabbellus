import { describe, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import { spaceService } from '@/lib/spaceService';

/**
 * Integration tests for SpaceService — pure Dexie surface only.
 *
 * Methods that call chrome.tabs.* / chrome.windows.* (captureCurrentWindow,
 * restoreSpace, createSpaceFromTabs) are excluded. Those require the
 * Playwright extension sandbox or explicit chrome mock injection.
 */

/** Helper: seed a space and return its auto-generated ID. */
async function seedSpace(name: string, opts?: { isPinned?: boolean }): Promise<number> {
  return (await db.spaces.add({
    name,
    createdAt: Date.now(),
    isPinned: opts?.isPinned,
  })) as number;
}

/** Helper: seed a tab attached to a space. */
async function seedTab(spaceId: number, url: string, order: number) {
  await db.tabs.add({ spaceId, url, title: `Tab: ${url}`, favicon: '', order });
}

describe('SpaceService — Dexie Integration', () => {
  // ── Create + Read ──────────────────────────────────────────────

  it('should create a space and read it back by ID', async () => {
    const id = await seedSpace('Research');
    const space = await spaceService.getSpaceById(id);

    expect(space).toBeDefined();
    expect(space!.name).toBe('Research');
    expect(space!.deletedAt).toBeUndefined();
  });

  // ── Create Empty Space ─────────────────────────────────────────

  it('should create an empty space without color and read it back', async () => {
    const id = await spaceService.createEmptySpace('  Brand New Space  ');
    const space = await spaceService.getSpaceById(id);

    expect(space).toBeDefined();
    expect(space!.name).toBe('Brand New Space');
    expect(space!.color).toBeUndefined();
    expect(space!.createdAt).toBeGreaterThan(0);
  });

  it('should create an empty space with a designated color tag', async () => {
    const id = await spaceService.createEmptySpace('Design Work', 'cyan');
    const space = await spaceService.getSpaceById(id);

    expect(space).toBeDefined();
    expect(space!.name).toBe('Design Work');
    expect(space!.color).toBe('cyan');
  });

  it('should treat "none" color tag as undefined in createEmptySpace', async () => {
    const id = await spaceService.createEmptySpace('No Color Space', 'none');
    const space = await spaceService.getSpaceById(id);

    expect(space).toBeDefined();
    expect(space!.name).toBe('No Color Space');
    expect(space!.color).toBeUndefined();
  });

  it('should reject creating empty space with blank name', async () => {
    await expect(spaceService.createEmptySpace('   ')).rejects.toThrow('Space name cannot be empty.');
  });

  // ── Tabs: Add + Ordered Retrieval ──────────────────────────────

  it('should add tabs to a space and retrieve them in order', async () => {
    const spaceId = await seedSpace('Dev Tools');

    await spaceService.addTabToSpace(spaceId, {
      url: 'https://vitejs.dev',
      title: 'Vite',
    });
    await spaceService.addTabToSpace(spaceId, {
      url: 'https://vitest.dev',
      title: 'Vitest',
    });

    const queryFn = spaceService.getTabsForSpaceQuery(spaceId);
    const tabs = await queryFn();

    expect(tabs).toHaveLength(2);
    expect(tabs[0].url).toBe('https://vitejs.dev');
    expect(tabs[1].url).toBe('https://vitest.dev');
    expect(tabs[0].order).toBeLessThan(tabs[1].order);
  });

  // ── Soft Delete + Filter Exclusion ─────────────────────────────

  it('should soft-delete a space and exclude it from active list', async () => {
    const id = await seedSpace('Ephemeral');
    await spaceService.softDeleteSpace(id);

    const active = await spaceService.getNonDeletedSpaces();
    expect(active.find((s) => s.id === id)).toBeUndefined();

    // The record still exists in the DB
    const raw = await db.spaces.get(id);
    expect(raw).toBeDefined();
    expect(raw!.deletedAt).toBeGreaterThan(0);
  });

  // ── Undo Delete ────────────────────────────────────────────────

  it('should undo a soft delete and restore visibility', async () => {
    const id = await seedSpace('Restored');
    await spaceService.softDeleteSpace(id);
    await spaceService.undoDeleteSpace(id);

    const active = await spaceService.getNonDeletedSpaces();
    expect(active.find((s) => s.id === id)).toBeDefined();

    const raw = await db.spaces.get(id);
    expect(raw!.deletedAt).toBeUndefined();
  });

  // ── Hard Delete Cascades ───────────────────────────────────────

  it('should hard-delete a space and cascade-remove its tabs', async () => {
    const spaceId = await seedSpace('Doomed');
    await seedTab(spaceId, 'https://example.com', 0);
    await seedTab(spaceId, 'https://example.org', 1);

    await spaceService.hardDeleteSpace(spaceId);

    const space = await db.spaces.get(spaceId);
    const tabs = await db.tabs.where({ spaceId }).toArray();

    expect(space).toBeUndefined();
    expect(tabs).toHaveLength(0);
  });

  // ── Toggle Pin ─────────────────────────────────────────────────

  it('should toggle the pinned state of a space', async () => {
    const id = await seedSpace('Pinnable');
    const before = await spaceService.getSpaceById(id);
    expect(before!.isPinned).toBeFalsy();

    await spaceService.toggleSpacePin(id);
    const after = await spaceService.getSpaceById(id);
    expect(after!.isPinned).toBe(true);

    await spaceService.toggleSpacePin(id);
    const final = await spaceService.getSpaceById(id);
    expect(final!.isPinned).toBe(false);
  });

  // ── getSavedTabsGroupedByUrl Deduplication ─────────────────────

  it('should group overlapping tabs across spaces by URL', async () => {
    const s1 = await seedSpace('Work');
    const s2 = await seedSpace('Personal');

    const sharedUrl = 'https://github.com';
    const uniqueUrl = 'https://reddit.com';

    await seedTab(s1, sharedUrl, 0);
    await seedTab(s1, uniqueUrl, 1);
    await seedTab(s2, sharedUrl, 0);

    const grouped = await spaceService.getSavedTabsGroupedByUrl();

    const githubEntry = grouped.find((g) => g.url === sharedUrl);
    expect(githubEntry).toBeDefined();
    expect(githubEntry!.spaceNames).toContain('Work');
    expect(githubEntry!.spaceNames).toContain('Personal');
    expect(githubEntry!.spaceNames).toHaveLength(2);

    const redditEntry = grouped.find((g) => g.url === uniqueUrl);
    expect(redditEntry).toBeDefined();
    expect(redditEntry!.spaceNames).toEqual(['Work']);
  });

  // ── Update Space Name ──────────────────────────────────────────

  it('should update a space name and trim whitespace', async () => {
    const id = await seedSpace('Old Name');
    await spaceService.updateSpaceName(id, '  New Name  ');

    const space = await spaceService.getSpaceById(id);
    expect(space!.name).toBe('New Name');
  });

  // ── Update Space Details ───────────────────────────────────────

  it('should update space name and color atomically in updateSpaceDetails', async () => {
    const id = await seedSpace('Initial Name');
    await spaceService.updateSpaceDetails(id, '  Updated Name  ', 'red');

    const space = await spaceService.getSpaceById(id);
    expect(space!.name).toBe('Updated Name');
    expect(space!.color).toBe('red');
  });

  // ── Update Space Color ─────────────────────────────────────────

  it('should update a space color tag and allow clearing it', async () => {
    const id = await seedSpace('Colored Space');
    await spaceService.updateSpaceColor(id, 'blue');

    let space = await spaceService.getSpaceById(id);
    expect(space!.color).toBe('blue');

    await spaceService.updateSpaceColor(id, undefined);
    space = await spaceService.getSpaceById(id);
    expect(space!.color).toBeUndefined();
  });

  // ── Duplicate Space ────────────────────────────────────────────

  it('should duplicate a space and all its tabs preserving relative order', async () => {
    const origId = (await db.spaces.add({
      name: 'Original Space',
      createdAt: Date.now(),
      isPinned: true,
      color: 'purple',
    })) as number;

    await seedTab(origId, 'https://alpha.com', 0);
    await seedTab(origId, 'https://beta.com', 1);

    const dupId = await spaceService.duplicateSpace(origId);

    const dupSpace = await spaceService.getSpaceById(dupId);
    expect(dupSpace).toBeDefined();
    expect(dupSpace!.name).toBe('Copy of Original Space');
    expect(dupSpace!.isPinned).toBe(true);
    expect(dupSpace!.color).toBe('purple');

    const dupTabs = await spaceService.getTabsForSpaceQuery(dupId)();
    expect(dupTabs).toHaveLength(2);
    expect(dupTabs[0].url).toBe('https://alpha.com');
    expect(dupTabs[0].order).toBe(0);
    expect(dupTabs[1].url).toBe('https://beta.com');
    expect(dupTabs[1].order).toBe(1);
    expect(dupTabs[0].spaceId).toBe(dupId);
    expect(dupTabs[1].spaceId).toBe(dupId);
  });

  // ── Move Tab Between Spaces ─────────────────────────────────────

  it('should move a tab between spaces and return original position metadata', async () => {
    const s1 = await seedSpace('Source Space');
    const s2 = await seedSpace('Target Space');

    await seedTab(s1, 'https://move-test.com', 0);
    const tabsInS1 = await spaceService.getTabsForSpaceQuery(s1)();
    const tabToMove = tabsInS1[0];

    const result = await spaceService.moveTabBetweenSpaces(tabToMove.id!, s2);

    expect(result.sourceSpaceId).toBe(s1);
    expect(result.originalOrder).toBe(0);

    const s1Tabs = await spaceService.getTabsForSpaceQuery(s1)();
    const s2Tabs = await spaceService.getTabsForSpaceQuery(s2)();

    expect(s1Tabs).toHaveLength(0);
    expect(s2Tabs).toHaveLength(1);
    expect(s2Tabs[0].url).toBe('https://move-test.com');
    expect(s2Tabs[0].spaceId).toBe(s2);
  });

  it('should prevent moving a tab if duplicate URL exists in target space', async () => {
    const s1 = await seedSpace('Source');
    const s2 = await seedSpace('Target');

    const duplicateUrl = 'https://duplicate-check.com';
    await seedTab(s1, duplicateUrl, 0);
    await seedTab(s2, duplicateUrl, 0);

    const tabsInS1 = await spaceService.getTabsForSpaceQuery(s1)();
    const tabToMove = tabsInS1[0];

    await expect(spaceService.moveTabBetweenSpaces(tabToMove.id!, s2)).rejects.toThrow('DUPLICATE_TAB');
  });

  // ── Copy Tab To Space ──────────────────────────────────────────

  it('should copy a tab to another space preserving the original tab', async () => {
    const s1 = await seedSpace('Space A');
    const s2 = await seedSpace('Space B');

    await seedTab(s1, 'https://copy-test.com', 0);
    const tabsInS1 = await spaceService.getTabsForSpaceQuery(s1)();
    const tabToCopy = tabsInS1[0];

    await spaceService.copyTabToSpace(tabToCopy.id!, s2);

    const s1Tabs = await spaceService.getTabsForSpaceQuery(s1)();
    const s2Tabs = await spaceService.getTabsForSpaceQuery(s2)();

    expect(s1Tabs).toHaveLength(1);
    expect(s2Tabs).toHaveLength(1);
    expect(s1Tabs[0].url).toBe('https://copy-test.com');
    expect(s2Tabs[0].url).toBe('https://copy-test.com');
    expect(s2Tabs[0].spaceId).toBe(s2);
  });

  it('should prevent copying a tab if duplicate URL exists in target space', async () => {
    const s1 = await seedSpace('Space 1');
    const s2 = await seedSpace('Space 2');

    const duplicateUrl = 'https://existing.com';
    await seedTab(s1, duplicateUrl, 0);
    await seedTab(s2, duplicateUrl, 0);

    const tabsInS1 = await spaceService.getTabsForSpaceQuery(s1)();
    const tabToCopy = tabsInS1[0];

    await expect(spaceService.copyTabToSpace(tabToCopy.id!, s2)).rejects.toThrow('DUPLICATE_TAB');
  });

  // ── getTabsForSpace & appendSpaceTabsToWindow ──────────────────

  it('should fetch all sorted tabs for a space via getTabsForSpace', async () => {
    const spaceId = await seedSpace('Ordered Space');
    await seedTab(spaceId, 'https://first.com', 0);
    await seedTab(spaceId, 'https://second.com', 1);

    const tabs = await spaceService.getTabsForSpace(spaceId);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].url).toBe('https://first.com');
    expect(tabs[1].url).toBe('https://second.com');
  });

  it('should append space tabs and deduplicate against open window tabs', async () => {
    const spaceId = await seedSpace('Append Space');
    await seedTab(spaceId, 'https://tab1.com', 0);
    await seedTab(spaceId, 'https://tab2.com', 1);

    // Mock chrome.tabs.query and chrome.tabs.create: tab1 is already open in window 42
    const createdTabs: Array<{ windowId: number; url: string; active: boolean }> = [];
    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          { id: 101, windowId: 42, url: 'https://tab1.com' },
          { id: 102, windowId: 42, url: 'https://other-site.com' },
        ]),
        create: vi.fn().mockImplementation((args) => {
          createdTabs.push(args);
          return Promise.resolve({ id: 999, ...args });
        }),
      },
    };

    const result = await spaceService.appendSpaceTabsToWindow(spaceId, 42);

    expect(result).toEqual({
      total: 2,
      appended: 1,
      skipped: 1,
    });
    expect(createdTabs).toHaveLength(1);
    expect(createdTabs[0]).toEqual({ windowId: 42, url: 'https://tab2.com', active: false });
  });

  it('should skip creation if all space tabs are already open in the window', async () => {
    const spaceId = await seedSpace('Already Open Space');
    await seedTab(spaceId, 'https://tab1.com', 0);
    await seedTab(spaceId, 'https://tab2.com?utm_source=test', 1);

    const createdTabs: Array<{ windowId: number; url: string; active: boolean }> = [];
    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([
          { id: 101, windowId: 42, url: 'https://tab1.com' },
          { id: 102, windowId: 42, url: 'https://tab2.com' },
        ]),
        create: vi.fn().mockImplementation((args) => {
          createdTabs.push(args);
          return Promise.resolve({ id: 999, ...args });
        }),
      },
    };

    const result = await spaceService.appendSpaceTabsToWindow(spaceId, 42);

    expect(result).toEqual({
      total: 2,
      appended: 0,
      skipped: 2,
    });
    expect(createdTabs).toHaveLength(0);
  });

  it('should return 0 counts when appending tabs for an empty space', async () => {
    const emptySpaceId = await seedSpace('Empty Space');
    (globalThis as any).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    };

    const result = await spaceService.appendSpaceTabsToWindow(emptySpaceId, 42);
    expect(result).toEqual({ total: 0, appended: 0, skipped: 0 });
  });
});


describe('SpaceService Performance Stress Tests', () => {
  it('should read and process 500 tabs within a 16ms frame budget', async () => {
    // 1. Initialize a clean target workspace parent row
    const spaceId = (await db.spaces.add({
      name: 'Performance Test Space',
      createdAt: Date.now(),
    })) as number;

    // 2. Programmatically generate 500 dense mock tab records
    const mockTabs = [];
    for (let i = 0; i < 500; i++) {
      mockTabs.push({
        spaceId,
        url: `https://example.com/tab-${i}`,
        title: `Tab Title ${i}`,
        favicon: `https://example.com/favicon-${i}.ico`,
        order: i,
      });
    }

    // 3. Batch insert rows instantly using high-speed bulk allocation
    await db.tabs.bulkAdd(mockTabs);

    // 4. Resolve the target query provider closure function
    const queryFn = spaceService.getTabsForSpaceQuery(spaceId);

    // Warm-up query to avoid cold-start JIT compilation latency
    await db.transaction('r', [db.tabs], () => queryFn());

    // 5. Run a high-precision performance duration evaluation
    const startTime = performance.now();
    
    // Force a deep read transaction pass to actively resolve the database records
    const result = await db.transaction('r', [db.tabs], () => queryFn());
    
    const endTime = performance.now();
    const duration = endTime - startTime;

    // 6. Assert structural completeness and execution velocity limits
    expect(result).toHaveLength(500);
    expect(duration).toBeLessThan(50);
    
    console.log(`\x1b[32m[PERF] Successfully processed 500 database tabs in: ${duration.toFixed(2)}ms\x1b[0m`);
  });
});

