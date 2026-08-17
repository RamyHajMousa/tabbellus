import { describe, it, expect } from 'vitest';
import { readLaterService, DuplicateReadLaterError } from '@/lib/readLaterService';
import { db } from '@/lib/db';

describe('ReadLaterService — Dexie Integration', () => {
  // ── Test Case 1: Creation ──────────────────────────────────────
  it('should successfully add a read later item from a tab', async () => {
    const mockTab = {
      url: 'https://example.com/article-1',
      title: 'Great Article 1',
      favIconUrl: 'https://example.com/favicon-1.ico',
    };

    const id = await readLaterService.addFromTab(mockTab);
    const item = await readLaterService.getItemById(id);

    expect(item).toBeDefined();
    expect(item!.id).toBe(id);
    expect(item!.url).toBe('https://example.com/article-1');
    expect(item!.title).toBe('Great Article 1');
    expect(item!.favicon).toBe('https://example.com/favicon-1.ico');
    expect(item!.status).toBe('unread');
    expect(item!.addedAt).toBeLessThanOrEqual(Date.now());
  });

  // ── Test Case 2: Deduplication ──────────────────────────────────
  it('should throw DuplicateReadLaterError when adding a duplicate non-archived URL', async () => {
    const mockTab = {
      url: 'https://example.com/duplicate',
      title: 'Original Title',
      favIconUrl: 'https://example.com/favicon.ico',
    };

    // First addition succeeds
    await readLaterService.addFromTab(mockTab);

    // Second addition with same URL should throw DuplicateReadLaterError
    await expect(readLaterService.addFromTab(mockTab)).rejects.toThrow(
      DuplicateReadLaterError
    );
  });

  // ── Test Case 3: Status Mutations ──────────────────────────────
  it('should transition an item status correctly inside Dexie', async () => {
    const mockTab = {
      url: 'https://example.com/mutable-status',
      title: 'Status Test',
      favIconUrl: 'https://example.com/favicon.ico',
    };

    const id = await readLaterService.addFromTab(mockTab);
    
    // Mutate to 'read'
    await readLaterService.updateStatus(id, 'read');
    let item = await readLaterService.getItemById(id);
    expect(item!.status).toBe('read');

    // Mutate to 'archived'
    await readLaterService.updateStatus(id, 'archived');
    item = await readLaterService.getItemById(id);
    expect(item!.status).toBe('archived');
  });

  // ── Test Case 4: Live Query Filtering ───────────────────────────
  it('should retrieve items by status sorted newest first', async () => {
    const now = Date.now();

    // Seed mixed-status entries directly using the db table
    await db.readLater.add({
      url: 'https://example.com/unread-old',
      title: 'Unread Old',
      addedAt: now - 5000,
      status: 'unread',
    });
    await db.readLater.add({
      url: 'https://example.com/unread-new',
      title: 'Unread New',
      addedAt: now - 1000,
      status: 'unread',
    });
    await db.readLater.add({
      url: 'https://example.com/read-item',
      title: 'Read Item',
      addedAt: now - 3000,
      status: 'read',
    });
    await db.readLater.add({
      url: 'https://example.com/archived-item',
      title: 'Archived Item',
      addedAt: now,
      status: 'archived',
    });

    const queryFn = readLaterService.getItemsByStatusQuery('unread');
    const unreadItems = await queryFn();

    expect(unreadItems).toHaveLength(2);
    expect(unreadItems.every((item) => item.status === 'unread')).toBe(true);

    // Verify ordering: reverse sorted by addedAt (newest first)
    expect(unreadItems[0].title).toBe('Unread New');
    expect(unreadItems[1].title).toBe('Unread Old');
  });

  // ── Test Case 5: Unread Counter Live Badge ──────────────────────
  it('should calculate the unread count and decrease it when an item is read', async () => {
    const countQueryFn = readLaterService.getUnreadCountQuery();

    const initialCount = await countQueryFn();

    // Add unread items
    const id1 = await db.readLater.add({
      url: 'https://example.com/badge-1',
      title: 'Badge 1',
      addedAt: Date.now(),
      status: 'unread',
    });
    const id2 = await db.readLater.add({
      url: 'https://example.com/badge-2',
      title: 'Badge 2',
      addedAt: Date.now(),
      status: 'unread',
    });

    expect(await countQueryFn()).toBe(initialCount + 2);

    // Transition one to 'read'
    await readLaterService.updateStatus(id1 as number, 'read');
    expect(await countQueryFn()).toBe(initialCount + 1);

    // Transition the other to 'archived'
    await readLaterService.updateStatus(id2 as number, 'archived');
    expect(await countQueryFn()).toBe(initialCount);
  });

  // ── Test Case 6: Distinct Domains ───────────────────────────────
  it('should return sorted unique hostnames for items matching a status', async () => {
    await db.readLater.bulkAdd([
      { url: 'https://github.com/repo-1', title: 'Repo 1', addedAt: Date.now(), status: 'unread' },
      { url: 'https://github.com/repo-2', title: 'Repo 2', addedAt: Date.now(), status: 'unread' },
      { url: 'https://youtube.com/watch?v=abc', title: 'Video', addedAt: Date.now(), status: 'unread' },
      { url: 'https://docs.google.com/doc', title: 'Doc', addedAt: Date.now(), status: 'read' },
    ]);

    const domains = await readLaterService.getDistinctDomains('unread');
    expect(domains).toContain('github.com');
    expect(domains).toContain('youtube.com');
    expect(domains).not.toContain('docs.google.com'); // different status
    // Verify sorted
    expect(domains).toEqual([...domains].sort());
  });

  // ── Test Case 7: Distinct Domains with Malformed URLs ───────────
  it('should skip malformed URLs gracefully in getDistinctDomains', async () => {
    await db.readLater.bulkAdd([
      { url: 'https://valid.com/page', title: 'Valid', addedAt: Date.now(), status: 'unread' },
      { url: 'not-a-url', title: 'Invalid', addedAt: Date.now(), status: 'unread' },
      { url: '', title: 'Empty', addedAt: Date.now(), status: 'unread' },
    ]);

    const domains = await readLaterService.getDistinctDomains('unread');
    expect(domains).toContain('valid.com');
    expect(domains).toHaveLength(1); // only valid.com, others skipped
  });

  // ── Test Case 8: Archive All Unread (unread → archived) ────────
  it('should transition all unread items to archived status atomically', async () => {
    await db.readLater.bulkAdd([
      { url: 'https://a.com/1', title: 'A1', addedAt: Date.now(), status: 'unread' },
      { url: 'https://b.com/2', title: 'B2', addedAt: Date.now(), status: 'unread' },
      { url: 'https://c.com/3', title: 'C3', addedAt: Date.now(), status: 'archived' },
    ]);

    const count = await readLaterService.archiveAllUnread();
    expect(count).toBe(2);

    // Verify transitions
    const allItems = await db.readLater.toArray();
    const archivedItems = allItems.filter(i => i.status === 'archived');
    expect(archivedItems.length).toBeGreaterThanOrEqual(3);
    expect(archivedItems.some(i => i.url === 'https://a.com/1')).toBe(true);
    expect(archivedItems.some(i => i.url === 'https://b.com/2')).toBe(true);
    expect(archivedItems.some(i => i.url === 'https://c.com/3')).toBe(true);
  });

  // ── Test Case 9: Clear All Archived ──────────────────────────────
  it('should delete all items with archived status and return snapshot for undo', async () => {
    const id1 = await db.readLater.add({ url: 'https://archived1.com', title: 'A1', addedAt: Date.now(), status: 'archived' });
    const id2 = await db.readLater.add({ url: 'https://archived2.com', title: 'A2', addedAt: Date.now(), status: 'archived' });
    await db.readLater.add({ url: 'https://unread1.com', title: 'U1', addedAt: Date.now(), status: 'unread' });

    const deleted = await readLaterService.clearAllArchived();
    expect(deleted).toHaveLength(2);
    expect(deleted.some(i => i.id === id1)).toBe(true);
    expect(deleted.some(i => i.id === id2)).toBe(true);

    // Verify deletions
    expect(await db.readLater.get(id1 as number)).toBeUndefined();
    expect(await db.readLater.get(id2 as number)).toBeUndefined();

    // Unread item should survive
    const remaining = await db.readLater.toArray();
    expect(remaining.some(i => i.url === 'https://unread1.com')).toBe(true);
  });

  // ── Test Case 10: Archive All Unread (empty set) ────────────────
  it('should return 0 when no unread items exist for archiveAllUnread', async () => {
    // Only add non-unread items
    await db.readLater.add({ url: 'https://archived.com', title: 'Archived', addedAt: Date.now(), status: 'archived' });

    const count = await readLaterService.archiveAllUnread();
    expect(count).toBe(0);
  });

  // ── Test Case 11: Bulk Restore (Undo Recovery) ──────────────────
  it('should restore a batch of archived items atomically during undo', async () => {
    const itemsToRestore = [
      { id: 201, url: 'https://undo1.com', title: 'Undo 1', addedAt: Date.now(), status: 'archived' as const },
      { id: 202, url: 'https://undo2.com', title: 'Undo 2', addedAt: Date.now(), status: 'archived' as const },
    ];

    await readLaterService.restoreItems(itemsToRestore);

    const u1 = await readLaterService.getItemById(201);
    const u2 = await readLaterService.getItemById(202);

    expect(u1).toBeDefined();
    expect(u1!.title).toBe('Undo 1');
    expect(u1!.status).toBe('archived');
    expect(u2).toBeDefined();
    expect(u2!.title).toBe('Undo 2');
    expect(u2!.status).toBe('archived');
  });
});
