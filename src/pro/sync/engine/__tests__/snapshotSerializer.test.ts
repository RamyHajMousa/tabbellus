/**
 * SnapshotSerializer Unit Tests
 *
 * Tests:
 * - Extracting local domain entities from Dexie into normalized snapshot
 * - Validating valid and malformed snapshots
 * - Applying remote updates to Dexie within atomic transactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { SnapshotSerializer } from '../snapshotSerializer';
import type { SyncVaultSnapshot } from '../types';
import { useAppStore } from '@/store/appStore';
import { contractRegistry } from '@/core/contracts/registry';

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

    it('atomically deletes pruned tabs via bulkDelete', async () => {
      const tab1Id = await db.tabs.add({
        spaceId: 1,
        url: 'https://example.com/1',
        order: 0,
      });
      const tab2Id = await db.tabs.add({
        spaceId: 1,
        url: 'https://example.com/2',
        order: 1,
      });

      await SnapshotSerializer.applyRemoteUpdates({
        spaces: [],
        tabs: [],
        readLater: [],
        tabIdsToDelete: [Number(tab1Id)],
      });

      const remainingTab1 = await db.tabs.get(Number(tab1Id));
      const remainingTab2 = await db.tabs.get(Number(tab2Id));

      expect(remainingTab1).toBeUndefined();
      expect(remainingTab2).toBeDefined();
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

    it('validates conforming snapshot objects with optional rules and settings', () => {
      const valid: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: Date.now(),
        deviceId: 'dev-1',
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [],
        settings: {
          duplicateTabBehavior: 'allow',
          spaceRestoreTrigger: 'single',
          readLaterOpenBehavior: 'foreground',
          readLaterAutoArchive: true,
          updatedAt: Date.now(),
        },
      };

      expect(SnapshotSerializer.validateSnapshot(valid)).toBe(true);
    });

    it('rejects snapshots with malformed rules or settings', () => {
      expect(
        SnapshotSerializer.validateSnapshot({
          version: 1,
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: [],
          tabs: [],
          readLater: [],
          rules: 'invalid-not-an-array',
        }),
      ).toBe(false);

      expect(
        SnapshotSerializer.validateSnapshot({
          version: 1,
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: [],
          tabs: [],
          readLater: [],
          settings: { updatedAt: 'not-a-number' },
        }),
      ).toBe(false);
    });
  });

  describe('rules and settings synchronization', () => {
    it('packages current rules and synced settings in createLocalSnapshot', async () => {
      const snapshot = await SnapshotSerializer.createLocalSnapshot('device-settings-test');
      expect(snapshot.rules).toBeDefined();
      expect(Array.isArray(snapshot.rules)).toBe(true);
      expect(snapshot.settings).toBeDefined();
      expect(snapshot.settings!.duplicateTabBehavior).toBeDefined();
      expect(snapshot.settings!.spaceRestoreTrigger).toBeDefined();
      expect(snapshot.settings!.readLaterOpenBehavior).toBeDefined();
      expect(snapshot.settings!.readLaterAutoArchive).toBeDefined();
      expect(typeof snapshot.settings!.updatedAt).toBe('number');
    });

    it('applies remote rules and settings with Anti-Echo Guard (bypassing notifyLocalMutation)', async () => {
      const mutationListener = vi.fn();
      const unsub = contractRegistry.subscribeLocalMutation(mutationListener);

      try {
        await SnapshotSerializer.applyRemoteUpdates({
          spaces: [],
          tabs: [],
          readLater: [],
          rules: [
            {
              id: 'remote-test-rule',
              name: 'Remote Injected Rule',
              enabled: true,
              priority: 0,
              matchAll: false,
              conditions: [],
              actions: [],
              createdAt: 1000,
              updatedAt: 2000,
            },
          ],
          settings: {
            duplicateTabBehavior: 'allow',
            spaceRestoreTrigger: 'double',
            readLaterOpenBehavior: 'background',
            readLaterAutoArchive: false,
            updatedAt: 5555,
          },
        });

        // 1. Check settings applied to store
        const storeSettings = useAppStore.getState().settings;
        expect(storeSettings.duplicateTabBehavior).toBe('allow');
        expect(storeSettings.spaceRestoreTrigger).toBe('double');
        expect(storeSettings.readLaterOpenBehavior).toBe('background');
        expect(storeSettings.readLaterAutoArchive).toBe(false);
        expect(storeSettings.settingsUpdatedAt).toBe(5555);

        // 2. Anti-echo guard: mutationListener must NOT have been called!
        expect(mutationListener).not.toHaveBeenCalled();
      } finally {
        unsub();
      }
    });
  });
});
