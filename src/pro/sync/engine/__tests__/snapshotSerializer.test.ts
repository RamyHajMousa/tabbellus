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
import { SnapshotSerializer, TOMBSTONE_TTL_MS } from '../snapshotSerializer';
import type { SyncVaultSnapshot } from '../types';
import { useAppStore } from '@/store/appStore';
import { contractRegistry } from '@/core/contracts/registry';
import { rulesEngine } from '@/pro/rules/engine/rulesEngine';
import type { TabRule } from '@/core/contracts/rules';

const localStore: Record<string, unknown> = {};
const syncStore: Record<string, unknown> = {};

describe('SnapshotSerializer', () => {
  beforeEach(async () => {
    Object.keys(localStore).forEach((k) => delete localStore[k]);
    Object.keys(syncStore).forEach((k) => delete syncStore[k]);

    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: localStore[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(localStore, items);
          }),
          remove: vi.fn(async (key: string) => {
            delete localStore[key];
          }),
        },
        sync: {
          get: vi.fn(async (key: string) => ({ [key]: syncStore[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(syncStore, items);
          }),
          remove: vi.fn(async (key: string) => {
            delete syncStore[key];
          }),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    });

    await db.spaces.clear();
    await db.tabs.clear();
    await db.readLater.clear();
    await rulesEngine.saveRules([], { skipMutationNotification: true });
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
      const recentTombstone = Date.now() - 5000;
      await db.spaces.add({
        name: 'Deleted Space',
        createdAt: 1700000000000,
        deletedAt: recentTombstone,
      });

      const snapshot = await SnapshotSerializer.createLocalSnapshot('device-1');

      expect(snapshot.spaces).toHaveLength(1);
      expect(snapshot.spaces[0].deletedAt).toBe(recentTombstone);
    });

    it('filters out tombstones older than 30 days during createLocalSnapshot', async () => {
      const now = Date.now();
      const expiredTombstone = now - TOMBSTONE_TTL_MS - 60000;
      const recentTombstone = now - 5000;

      await db.spaces.add({
        name: 'Expired Deleted Space',
        createdAt: now - TOMBSTONE_TTL_MS - 100000,
        deletedAt: expiredTombstone,
      });
      await db.spaces.add({
        name: 'Recent Deleted Space',
        createdAt: now - 10000,
        deletedAt: recentTombstone,
      });
      await db.tabs.add({
        spaceId: 1,
        url: 'https://expired.com',
        order: 0,
        deletedAt: expiredTombstone,
      });
      await db.readLater.add({
        url: 'https://expired-readlater.com',
        addedAt: now - TOMBSTONE_TTL_MS - 100000,
        status: 'archived',
        deletedAt: expiredTombstone,
      });

      const snapshot = await SnapshotSerializer.createLocalSnapshot('device-1');

      expect(snapshot.spaces.some((s) => s.name === 'Expired Deleted Space')).toBe(false);
      expect(snapshot.spaces.some((s) => s.name === 'Recent Deleted Space')).toBe(true);
      expect(snapshot.tabs.some((t) => t.url === 'https://expired.com')).toBe(false);
      expect(snapshot.readLater.some((r) => r.url === 'https://expired-readlater.com')).toBe(false);
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

    it('vacuums expired tombstones from IndexedDB during applyRemoteUpdates', async () => {
      const now = Date.now();
      const expiredTombstone = now - TOMBSTONE_TTL_MS - 60000;
      const recentTombstone = now - 5000;

      const expiredSpaceId = await db.spaces.add({
        name: 'Old Deleted Space',
        createdAt: now - TOMBSTONE_TTL_MS - 100000,
        deletedAt: expiredTombstone,
      });
      const recentSpaceId = await db.spaces.add({
        name: 'Recent Deleted Space',
        createdAt: now - 10000,
        deletedAt: recentTombstone,
      });
      const expiredTabId = await db.tabs.add({
        spaceId: 1,
        url: 'https://old-tab.com',
        order: 0,
        deletedAt: expiredTombstone,
      });
      const expiredReadLaterId = await db.readLater.add({
        url: 'https://old-readlater.com',
        addedAt: now - TOMBSTONE_TTL_MS - 100000,
        status: 'archived',
        deletedAt: expiredTombstone,
      });

      await SnapshotSerializer.applyRemoteUpdates({
        spaces: [],
        tabs: [],
        readLater: [],
      });

      expect(await db.spaces.get(Number(expiredSpaceId))).toBeUndefined();
      expect(await db.spaces.get(Number(recentSpaceId))).toBeDefined();
      expect(await db.tabs.get(Number(expiredTabId))).toBeUndefined();
      expect(await db.readLater.get(Number(expiredReadLaterId))).toBeUndefined();
    });

    it('applyRemoteUpdates preserves existing local rules when incoming rule updates arrive', async () => {
      // Seed existing local rules in ruleStorage
      const localRule: TabRule = {
        id: 'existing-local-rule',
        name: 'Existing Rule',
        enabled: true,
        priority: 0,
        matchAll: false,
        conditions: [{ field: 'domain', operator: 'contains', value: 'existing.com' }],
        actions: [{ type: 'pin' }],
        createdAt: 1000,
        updatedAt: 1000,
      };
      await rulesEngine.saveRules([localRule]);

      // Incoming partial or new rule update
      const incomingRule: TabRule = {
        id: 'new-incoming-rule',
        name: 'Incoming Cloud Rule',
        enabled: true,
        priority: 1,
        matchAll: false,
        conditions: [{ field: 'domain', operator: 'contains', value: 'cloud.com' }],
        actions: [{ type: 'mute' }],
        createdAt: 2000,
        updatedAt: 2000,
      };

      // Call applyRemoteUpdates with incoming rule
      await SnapshotSerializer.applyRemoteUpdates({
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [incomingRule],
      });

      // Verify that defensive ingestion preserved 'existing-local-rule' alongside 'new-incoming-rule'
      const storedRules = await rulesEngine.getRules();
      expect(storedRules).toHaveLength(2);
      const storedIds = storedRules.map((r) => r.id);
      expect(storedIds).toContain('existing-local-rule');
      expect(storedIds).toContain('new-incoming-rule');
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

    it('filters malformed entities in-place rather than failing entire snapshot', () => {
      const candidate: any = {
        version: 1,
        clientTimestamp: Date.now(),
        deviceId: 'dev-1',
        spaces: [
          { id: 1, name: 'Valid Space', createdAt: Date.now() },
          { id: 2, name: '', createdAt: Date.now() }, // Malformed: empty name
          { id: 3, createdAt: Date.now() }, // Malformed: missing name
        ],
        tabs: [
          { id: 1, spaceId: 1, url: 'https://valid.com' },
          { id: 2, spaceId: 1, url: '' }, // Malformed: empty url
          { id: 3, spaceId: 1 }, // Malformed: missing url
          { id: 4, url: 'https://notab.com' }, // Malformed: missing spaceId
        ],
        readLater: [
          { id: 1, url: 'https://valid-readlater.com' },
          { id: 2, url: '' }, // Malformed
        ],
      };

      expect(SnapshotSerializer.validateSnapshot(candidate)).toBe(true);
      expect(candidate.spaces).toHaveLength(1);
      expect(candidate.spaces[0].name).toBe('Valid Space');
      expect(candidate.tabs).toHaveLength(1);
      expect(candidate.tabs[0].url).toBe('https://valid.com');
      expect(candidate.readLater).toHaveLength(1);
      expect(candidate.readLater[0].url).toBe('https://valid-readlater.com');
    });

    it('rejects snapshots when spaces, tabs, or readLater are not arrays', () => {
      expect(
        SnapshotSerializer.validateSnapshot({
          version: 1,
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: 'not-an-array',
          tabs: [],
          readLater: [],
        }),
      ).toBe(false);

      expect(
        SnapshotSerializer.validateSnapshot({
          version: 1,
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: [],
          tabs: null,
          readLater: [],
        }),
      ).toBe(false);

      expect(
        SnapshotSerializer.validateSnapshot({
          version: 1,
          clientTimestamp: Date.now(),
          deviceId: 'dev-1',
          spaces: [],
          tabs: [],
          readLater: {},
        }),
      ).toBe(false);
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
