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
});
