import { describe, it, expect } from 'vitest';
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
});

describe('SpaceService Performance Stress Tests', () => {
  it('should read and process 500 tabs within a 16ms frame budget', async () => {
    const spaceId = (await db.spaces.add({
      name: 'Performance Test Space',
      createdAt: Date.now(),
    })) as number;

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

    await db.tabs.bulkAdd(mockTabs);

    const queryFn = spaceService.getTabsForSpaceQuery(spaceId);

    const startTime = performance.now();
    const result = await queryFn();
    const endTime = performance.now();

    const duration = endTime - startTime;

    expect(result).toHaveLength(500);
    expect(duration).toBeLessThan(16);
  });
});

