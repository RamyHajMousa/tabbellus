/**
 * SnapshotSerializer Unit Tests
 *
 * Tests:
 * - Extracting local domain entities from Dexie into normalized snapshot
 * - Validating valid and malformed snapshots
 * - Applying remote updates to Dexie within atomic transactions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { SnapshotSerializer } from '../snapshotSerializer';
import type { SyncVaultSnapshot } from '../types';

describe('SnapshotSerializer', () => {
  beforeEach(async () => {
    await db.spaces.clear();
    await db.tabs.clear();
    await db.readLater.clear();
  });

  describe('createLocalSnapshot', () => {
    it('creates a normalized snapshot containing all Dexie entities', async () => {
      const spaceId = await db.spaces.add({
        name: 'Work Space',
        createdAt: 1700000000000,
        color: 'blue',
      });

      await db.tabs.add({
        spaceId: Number(spaceId),
        url: 'https://github.com',
        title: 'GitHub',
        order: 0,
      });

      await db.readLater.add({
        url: 'https://news.ycombinator.com',
        title: 'Hacker News',
        addedAt: 1700000050000,
        status: 'unread',
      });

      const snapshot = await SnapshotSerializer.createLocalSnapshot('test-device-123');

      expect(snapshot.version).toBe(1);
      expect(snapshot.deviceId).toBe('test-device-123');
      expect(typeof snapshot.clientTimestamp).toBe('number');
      expect(snapshot.spaces).toHaveLength(1);
      expect(snapshot.spaces[0].name).toBe('Work Space');
      expect(snapshot.tabs).toHaveLength(1);
      expect(snapshot.tabs[0].url).toBe('https://github.com');
      expect(snapshot.readLater).toHaveLength(1);
      expect(snapshot.readLater[0].title).toBe('Hacker News');
    });

    it('includes soft-deleted spaces in snapshot for tombstone sync', async () => {
      await db.spaces.add({
        name: 'Deleted Space',
        createdAt: 1700000000000,
        deletedAt: 1700000100000,
      });

      const snapshot = await SnapshotSerializer.createLocalSnapshot('device-1');

      expect(snapshot.spaces).toHaveLength(1);
      expect(snapshot.spaces[0].deletedAt).toBe(1700000100000);
    });
  });

  describe('applyRemoteUpdates', () => {
    it('upserts spaces, tabs, and readLater items into Dexie', async () => {
      await SnapshotSerializer.applyRemoteUpdates({
        spaces: [
          {
            id: 10,
            name: 'Remote Space',
            createdAt: 1700000000000,
            color: 'green',
          },
        ],
        tabs: [
          {
            id: 20,
            spaceId: 10,
            url: 'https://example.com',
            title: 'Example',
            order: 0,
          },
        ],
        readLater: [
          {
            id: 30,
            url: 'https://example.org',
            title: 'Example Org',
            addedAt: 1700000000000,
            status: 'archived',
          },
        ],
      });

      const storedSpace = await db.spaces.get(10);
      expect(storedSpace).toBeDefined();
      expect(storedSpace?.name).toBe('Remote Space');

      const storedTab = await db.tabs.get(20);
      expect(storedTab).toBeDefined();
      expect(storedTab?.url).toBe('https://example.com');

      const storedItem = await db.readLater.get(30);
      expect(storedItem).toBeDefined();
      expect(storedItem?.status).toBe('archived');
    });

    it('handles empty update batches gracefully without database operations', async () => {
      await expect(
        SnapshotSerializer.applyRemoteUpdates({
          spaces: [],
          tabs: [],
          readLater: [],
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('validateSnapshot', () => {
    it('validates conforming snapshot objects', () => {
      const valid: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: Date.now(),
        deviceId: 'dev-1',
        spaces: [],
        tabs: [],
        readLater: [],
      };

      expect(SnapshotSerializer.validateSnapshot(valid)).toBe(true);
    });

    it('rejects null, non-objects, or missing array fields', () => {
      expect(SnapshotSerializer.validateSnapshot(null)).toBe(false);
      expect(SnapshotSerializer.validateSnapshot('string')).toBe(false);
      expect(SnapshotSerializer.validateSnapshot({})).toBe(false);
      expect(
        SnapshotSerializer.validateSnapshot({
          version: 1,
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: null,
          tabs: [],
          readLater: [],
        }),
      ).toBe(false);
      expect(
        SnapshotSerializer.validateSnapshot({
          version: '1', // string instead of number
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: [],
          tabs: [],
          readLater: [],
        }),
      ).toBe(false);
    });
  });
});
