/**
 * DiffEngine Unit Tests
 *
 * Tests:
 * - Null remote snapshot fast-path (initial sync)
 * - Record-level LWW comparison (local newer vs. remote newer)
 * - Soft-deletion tombstone propagation and anti-resurrection
 * - Space ID remapping and Tab foreign key preservation
 * - Read Later status convergence toward 'archived'
 */

import { describe, it, expect } from 'vitest';
import { DiffEngine, normalizeTabUrl, toEpochMs } from '../diffEngine';
import type { SyncVaultSnapshot } from '../types';
import type { Tab } from '@/lib/db';

describe('DiffEngine', () => {
  const localDeviceId = 'local-device-001';
  const remoteDeviceId = 'remote-device-002';

  describe('initial sync (null/empty remote)', () => {
    it('returns local snapshot as merged snapshot with hasChanges: true', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Local Space', createdAt: 1000 }],
        tabs: [{ id: 1, spaceId: 1, url: 'https://example.com', order: 0 }],
        readLater: [
          { id: 1, url: 'https://example.org', addedAt: 1000, status: 'unread' },
        ],
      };

      const result = DiffEngine.reconcile(local, null, localDeviceId);

      expect(result.hasChanges).toBe(true);
      expect(result.localUpdates.spaces).toHaveLength(0);
      expect(result.localUpdates.tabs).toHaveLength(0);
      expect(result.localUpdates.readLater).toHaveLength(0);
      expect(result.mergedSnapshot.spaces).toHaveLength(1);
      expect(result.mergedSnapshot.spaces[0].name).toBe('Local Space');
    });
  });

  describe('Spaces reconciliation', () => {
    it('applies remote updates when remote space is newer', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'My Space', createdAt, color: 'blue' }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000, // newer snapshot
        deviceId: remoteDeviceId,
        spaces: [{ id: 10, name: 'My Space', createdAt, color: 'red' }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.spaces).toHaveLength(1);
      expect(result.localUpdates.spaces[0].id).toBe(1); // Preserves local ID
      expect(result.localUpdates.spaces[0].color).toBe('red');
      expect(result.mergedSnapshot.spaces[0].color).toBe('red');
    });

    it('preserves soft-deletion tombstone from remote to prevent resurrection', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Active Locally', createdAt }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 10, name: 'Active Locally', createdAt, deletedAt: 2500 }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Local should receive the soft deletion tombstone
      expect(result.localUpdates.spaces).toHaveLength(1);
      expect(result.localUpdates.spaces[0].id).toBe(1);
      expect(result.localUpdates.spaces[0].deletedAt).toBe(2500);
      expect(result.mergedSnapshot.spaces[0].deletedAt).toBe(2500);
    });

    it('preserves local soft-deletion tombstone when remote does not have it', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Deleted Locally', createdAt, deletedAt: 2500 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 10, name: 'Deleted Locally', createdAt }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Merged snapshot should preserve tombstone
      expect(result.mergedSnapshot.spaces[0].deletedAt).toBe(2500);
      expect(result.localUpdates.spaces).toHaveLength(0); // Local already deleted
    });

    it('assigns unique local IDs for incoming remote-only spaces', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Existing Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [
          { id: 1, name: 'Brand New Remote Space', createdAt: 1500 }, // Remote ID 1 clashes with local ID 1
        ],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.spaces).toHaveLength(1);
      expect(result.localUpdates.spaces[0].id).toBe(2); // Assigned maxLocalId + 1 = 2
      expect(result.localUpdates.spaces[0].name).toBe('Brand New Remote Space');
      expect(result.mergedSnapshot.spaces).toHaveLength(2);
    });
  });

  describe('Tabs reconciliation', () => {
    it('remaps remote tab spaceId to match reconciled local space ID', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 5, name: 'Shared Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 99, name: 'Shared Space', createdAt: 1000 }], // Remote space ID 99
        tabs: [
          {
            id: 100,
            spaceId: 99, // Linked to remote space 99
            url: 'https://example.com',
            title: 'Example',
            order: 0,
          },
        ],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.tabs).toHaveLength(1);
      expect(result.localUpdates.tabs[0].spaceId).toBe(5); // Remapped to local space ID 5!
      expect(result.localUpdates.tabs[0].url).toBe('https://example.com');
      expect(result.mergedSnapshot.tabs[0].spaceId).toBe(5);
    });

    it('updates tab order when remote tab is newer', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Space', createdAt: 1000 }],
        tabs: [{ id: 1, spaceId: 1, url: 'https://example.com', order: 0 }],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000, // newer snapshot
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Space', createdAt: 1000 }],
        tabs: [{ id: 1, spaceId: 1, url: 'https://example.com', order: 5 }],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.tabs).toHaveLength(1);
      expect(result.localUpdates.tabs[0].order).toBe(5);
      expect(result.mergedSnapshot.tabs[0].order).toBe(5);
    });
  });

  describe('Read Later reconciliation', () => {
    it('converges to archived status when one device has archived', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          { id: 1, url: 'https://article.com', addedAt: 1000, status: 'unread' },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          { id: 10, url: 'https://article.com', addedAt: 1000, status: 'archived' },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.readLater).toHaveLength(1);
      expect(result.localUpdates.readLater[0].id).toBe(1);
      expect(result.localUpdates.readLater[0].status).toBe('archived');
      expect(result.mergedSnapshot.readLater[0].status).toBe('archived');
    });

    it('adds new remote-only Read Later items with new local IDs', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [{ id: 1, url: 'https://local.com', addedAt: 1000, status: 'unread' }],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [{ id: 1, url: 'https://remote.com', addedAt: 1500, status: 'unread' }],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.readLater).toHaveLength(1);
      expect(result.localUpdates.readLater[0].id).toBe(2);
      expect(result.localUpdates.readLater[0].url).toBe('https://remote.com');
      expect(result.mergedSnapshot.readLater).toHaveLength(2);
    });
  });

  describe('Empty Placeholder Adoption', () => {
    it('Adopts empty local space with matching name instead of duplicating', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 5, name: 'Test', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 99, name: 'Test', createdAt: 2000, color: 'blue' }],
        tabs: [
          { id: 101, spaceId: 99, url: 'https://example.com/a', order: 0 },
          { id: 102, spaceId: 99, url: 'https://example.com/b', order: 1 },
        ],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Should have adopted local space id 5 without creating a duplicate space
      expect(result.mergedSnapshot.spaces).toHaveLength(1);
      expect(result.mergedSnapshot.spaces[0].id).toBe(5);
      expect(result.mergedSnapshot.spaces[0].name).toBe('Test');
      expect(result.mergedSnapshot.spaces[0].createdAt).toBe(2000);
      expect(result.mergedSnapshot.spaces[0].color).toBe('blue');

      expect(result.localUpdates.spaces).toHaveLength(1);
      expect(result.localUpdates.spaces[0].id).toBe(5);
      expect(result.localUpdates.spaces[0].color).toBe('blue');

      // Tabs should be remapped to local space ID 5
      expect(result.mergedSnapshot.tabs).toHaveLength(2);
      expect(result.mergedSnapshot.tabs[0].spaceId).toBe(5);
      expect(result.mergedSnapshot.tabs[1].spaceId).toBe(5);
      expect(result.localUpdates.tabs).toHaveLength(2);
      expect(result.localUpdates.tabs[0].spaceId).toBe(5);
    });
  });

  describe('Idempotency & Tab Pruning', () => {
    it('Idempotent multi-cycle sync does not duplicate tabs', () => {
      const remoteTabs = [
        { id: 101, spaceId: 10, url: 'https://example.com/page1', title: 'Page 1', order: 0 },
        { id: 102, spaceId: 10, url: 'https://example.com/page2', title: 'Page 2', order: 1 },
        { id: 103, spaceId: 10, url: 'https://example.com/page3', title: 'Page 3', order: 2 },
      ];
      const N = remoteTabs.length;

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 10, name: 'Workspace', createdAt: 1000 }],
        tabs: remoteTabs,
        readLater: [],
      };

      let localState: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Workspace', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      // Simulates Dexie applying local updates
      let autoIncrementTabId = 1;
      const applySimulatedLocalUpdates = (
        currentLocal: SyncVaultSnapshot,
        updates: ReturnType<typeof DiffEngine.reconcile>['localUpdates'],
      ): SyncVaultSnapshot => {
        const toDelete = new Set(updates.tabIdsToDelete ?? []);
        let tabs = currentLocal.tabs.filter((t) => t.id === undefined || !toDelete.has(t.id));

        for (const tab of updates.tabs) {
          if (tab.id !== undefined) {
            const index = tabs.findIndex((t) => t.id === tab.id);
            if (index !== -1) {
              tabs[index] = { ...tab };
            } else {
              tabs.push({ ...tab });
            }
          } else {
            tabs.push({ ...tab, id: autoIncrementTabId++ });
          }
        }

        return {
          ...currentLocal,
          tabs,
        };
      };

      // Cycle 1: First sync imports N tabs
      const res1 = DiffEngine.reconcile(localState, remote, localDeviceId);
      expect(res1.mergedSnapshot.tabs).toHaveLength(N);
      expect(res1.localUpdates.tabs).toHaveLength(N);
      localState = applySimulatedLocalUpdates(localState, res1.localUpdates);
      expect(localState.tabs).toHaveLength(N);

      // Cycle 2: Second sync with identical state
      const res2 = DiffEngine.reconcile(localState, remote, localDeviceId, 3000);
      expect(res2.mergedSnapshot.tabs).toHaveLength(N);
      expect(res2.localUpdates.tabs).toHaveLength(0);
      localState = applySimulatedLocalUpdates(localState, res2.localUpdates);
      expect(localState.tabs).toHaveLength(N);

      // Cycle 3: Third sync with identical state
      const res3 = DiffEngine.reconcile(localState, remote, localDeviceId, 3000);
      expect(res3.mergedSnapshot.tabs).toHaveLength(N);
      expect(res3.localUpdates.tabs).toHaveLength(0);
      localState = applySimulatedLocalUpdates(localState, res3.localUpdates);
      expect(localState.tabs).toHaveLength(N);

      // Cycle 4: Fourth sync with identical state
      const res4 = DiffEngine.reconcile(localState, remote, localDeviceId, 3000);
      expect(res4.mergedSnapshot.tabs).toHaveLength(N);
      expect(res4.localUpdates.tabs).toHaveLength(0);
      localState = applySimulatedLocalUpdates(localState, res4.localUpdates);
      expect(localState.tabs).toHaveLength(N);
    });

    it('Prunes deleted tabs when remote snapshot has fewer tabs', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Dev Space', createdAt: 1000 }],
        tabs: [
          { id: 10, spaceId: 1, url: 'https://example.com/keep', title: 'Keep', order: 0 },
          { id: 11, spaceId: 1, url: 'https://example.com/delete', title: 'Delete', order: 1 },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000, // Newer remote sync (3000 > localLastSyncedAt 2000)
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Dev Space', createdAt: 1000 }],
        tabs: [
          { id: 10, spaceId: 1, url: 'https://example.com/keep', title: 'Keep', order: 0 },
        ],
        readLater: [],
      };

      // localLastSyncedAt is 2000; remoteClientTimestamp is 3000 -> remoteClientTimestamp > localLastSyncedAt
      const result = DiffEngine.reconcile(local, remote, localDeviceId, 2000);

      expect(result.localUpdates.tabIdsToDelete).toBeDefined();
      expect(result.localUpdates.tabIdsToDelete).toEqual([11]);
      expect(result.mergedSnapshot.tabs).toHaveLength(1);
      expect(result.mergedSnapshot.tabs[0].url).toBe('https://example.com/keep');
    });

    it('Does not prune local tabs when localLastSyncedAt is more recent than remote snapshot', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 4000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Dev Space', createdAt: 1000 }],
        tabs: [
          { id: 10, spaceId: 1, url: 'https://example.com/keep', title: 'Keep', order: 0 },
          { id: 11, spaceId: 1, url: 'https://example.com/local-only-tab', title: 'Local Tab', order: 1 },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000, // Older remote snapshot
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Dev Space', createdAt: 1000 }],
        tabs: [
          { id: 10, spaceId: 1, url: 'https://example.com/keep', title: 'Keep', order: 0 },
        ],
        readLater: [],
      };

      // localLastSyncedAt is 3500; remoteClientTimestamp is 2000 -> 2000 <= 3500, no pruning
      const result = DiffEngine.reconcile(local, remote, localDeviceId, 3500);

      expect(result.localUpdates.tabIdsToDelete).toHaveLength(0);
      expect(result.mergedSnapshot.tabs).toHaveLength(2);
    });

    it('cleanses duplicate remote tabs within space by keeping lowest order index', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Space', createdAt: 1000 }],
        tabs: [
          { id: 50, spaceId: 1, url: 'https://example.com/', title: 'First', order: 5 },
          { id: 51, spaceId: 1, url: 'https://example.com', title: 'Duplicate Lowest Order', order: 1 },
          { id: 52, spaceId: 1, url: 'https://example.com#hash', title: 'Third', order: 8 },
        ],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // All 3 remote tabs normalize to 'https://example.com' -> only lowest order (order 1) survives
      expect(result.mergedSnapshot.tabs).toHaveLength(1);
      expect(result.mergedSnapshot.tabs[0].order).toBe(1);
      expect(result.mergedSnapshot.tabs[0].title).toBe('Duplicate Lowest Order');
      expect(result.localUpdates.tabs).toHaveLength(1);
      expect(result.localUpdates.tabs[0].order).toBe(1);
    });
    it('preserves local tab tombstone when localTab.deletedAt > remoteClientTimestamp without resurrecting locally', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Project Space', createdAt }],
        tabs: [
          {
            id: 10,
            spaceId: 1,
            url: 'https://deleted-locally.com',
            order: 0,
            deletedAt: 2500, // deleted locally after remote snapshot was taken
          },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000, // older remote snapshot where tab was still active
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Project Space', createdAt }],
        tabs: [
          {
            id: 100,
            spaceId: 1,
            url: 'https://deleted-locally.com',
            order: 0,
            // active on remote
          },
        ],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 1500);

      // Local tab must NOT be revived in localUpdates
      expect(result.localUpdates.tabs).toHaveLength(0);

      // Merged snapshot preserves tombstone for cloud upload
      expect(result.mergedSnapshot.tabs).toHaveLength(1);
      expect(result.mergedSnapshot.tabs[0].deletedAt).toBe(2500);
      expect(result.mergedSnapshot.tabs[0].id).toBe(10);
    });

    it('propagates remote soft-deleted tab when remoteTab.deletedAt > localLastSyncedAt', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Project Space', createdAt }],
        tabs: [
          {
            id: 10,
            spaceId: 1,
            url: 'https://deleted-remotely.com',
            order: 0,
            // currently active on local
          },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Project Space', createdAt }],
        tabs: [
          {
            id: 100,
            spaceId: 1,
            url: 'https://deleted-remotely.com',
            order: 0,
            deletedAt: 2500, // remote deleted it after localLastSyncedAt
          },
        ],
        readLater: [],
      };

      const localLastSyncedAt = 1800; // remote deletion (2500) > localLastSyncedAt (1800)
      const result = DiffEngine.reconcile(local, remote, localDeviceId, localLastSyncedAt);

      // Local tab must be soft-deleted in localUpdates with remote deletedAt
      expect(result.localUpdates.tabs).toHaveLength(1);
      expect(result.localUpdates.tabs[0].id).toBe(10);
      expect(result.localUpdates.tabs[0].deletedAt).toBe(2500);

      // Merged snapshot preserves tombstone
      expect(result.mergedSnapshot.tabs).toHaveLength(1);
      expect(result.mergedSnapshot.tabs[0].deletedAt).toBe(2500);
    });

    it('preserves local Read Later tombstone when localItem.deletedAt > remoteClientTimestamp', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          {
            id: 5,
            url: 'https://readlater-tombstone.com',
            title: 'Article',
            addedAt: 1000,
            status: 'archived',
            deletedAt: 2600, // deleted locally after remote snapshot
          },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000, // older remote snapshot where it was active
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          {
            id: 50,
            url: 'https://readlater-tombstone.com',
            title: 'Article',
            addedAt: 1000,
            status: 'unread',
          },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 1500);

      // Must NOT be resurrected into localUpdates
      expect(result.localUpdates.readLater).toHaveLength(0);

      // Merged snapshot keeps tombstone
      expect(result.mergedSnapshot.readLater).toHaveLength(1);
      expect(result.mergedSnapshot.readLater[0].deletedAt).toBe(2600);
      expect(result.mergedSnapshot.readLater[0].id).toBe(5);
    });

    it("preserves local 'unread' status when localItem.updatedAt > remoteClientTimestamp despite remote being 'archived'", () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          {
            id: 10,
            url: 'https://readlater-lww.com',
            title: 'Article',
            addedAt: 1000,
            status: 'unread',
            updatedAt: 2500, // User moved to unread locally at 2500
          },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000, // Older remote snapshot where status was archived
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          {
            id: 100,
            url: 'https://readlater-lww.com',
            title: 'Article',
            addedAt: 1000,
            status: 'archived',
            updatedAt: 1500, // Archived remotely at 1500
          },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 1500);

      // Local unread status must NOT be reversed to archived
      expect(result.localUpdates.readLater).toHaveLength(0);
      expect(result.mergedSnapshot.readLater).toHaveLength(1);
      expect(result.mergedSnapshot.readLater[0].status).toBe('unread');
      expect(result.mergedSnapshot.readLater[0].updatedAt).toBe(2500);
      expect(result.hasRemoteChanges).toBe(true);
    });

    it('cleanses duplicate URLs in remote readLater snapshot and prefers archived status', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [
          { id: 101, url: 'https://dup-readlater.com/', title: 'First Unread', addedAt: 1000, status: 'unread' },
          { id: 102, url: 'https://dup-readlater.com', title: 'Second Archived', addedAt: 1200, status: 'archived' },
          { id: 103, url: 'https://dup-readlater.com#hash', title: 'Third Unread', addedAt: 1500, status: 'unread' },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Pre-deduplication should collapse the 3 duplicates into 1 item
      expect(result.mergedSnapshot.readLater).toHaveLength(1);
      expect(result.mergedSnapshot.readLater[0].url).toBe('https://dup-readlater.com');
      // Archived status wins
      expect(result.mergedSnapshot.readLater[0].status).toBe('archived');
      expect(result.localUpdates.readLater).toHaveLength(1);
      expect(result.localUpdates.readLater[0].status).toBe('archived');
    });
  });

  describe('normalizeTabUrl', () => {
    it('strips hash fragments and trailing slash on root path', () => {
      expect(normalizeTabUrl('https://example.com/')).toBe('https://example.com');
      expect(normalizeTabUrl('https://example.com/#section')).toBe('https://example.com');
      expect(normalizeTabUrl('https://example.com/path#section')).toBe('https://example.com/path');
      expect(normalizeTabUrl('https://example.com/path/')).toBe('https://example.com/path/');
      expect(normalizeTabUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('safely handles non-standard URLs', () => {
      expect(normalizeTabUrl('chrome://newtab/')).toBe('chrome://newtab');
      expect(normalizeTabUrl('about:blank')).toBe('about:blank');
      expect(normalizeTabUrl('invalid-url')).toBe('invalid-url');
    });
  });

  describe('toEpochMs', () => {
    it('returns numeric epoch directly when input is a number', () => {
      expect(toEpochMs(1725370000000)).toBe(1725370000000);
      expect(toEpochMs(0)).toBe(0);
    });

    it('converts ISO string representation to epoch in milliseconds', () => {
      const iso = '2026-09-03T14:30:00.000Z';
      const expected = new Date(iso).getTime();
      expect(toEpochMs(iso)).toBe(expected);
    });

    it('correctly compares numeric Date.now() with ISO string new Date().toISOString()', () => {
      const nowMs = Date.now();
      const pastIso = new Date(nowMs - 5000).toISOString();
      const futureIso = new Date(nowMs + 5000).toISOString();

      expect(toEpochMs(nowMs)).toBeGreaterThan(toEpochMs(pastIso));
      expect(toEpochMs(nowMs)).toBeLessThan(toEpochMs(futureIso));
    });

    it('returns 0 for null, undefined, empty string, or invalid date format', () => {
      expect(toEpochMs(null)).toBe(0);
      expect(toEpochMs(undefined)).toBe(0);
      expect(toEpochMs('')).toBe(0);
      expect(toEpochMs('not-a-date')).toBe(0);
    });
  });

  describe('Dual Change Detection (hasLocalChanges, hasRemoteChanges, hasChanges)', () => {
    it('sets hasRemoteChanges: true even when hasLocalChanges: false upon local tab deletion', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Work', createdAt }],
        tabs: [
          {
            id: 10,
            spaceId: 1,
            url: 'https://deleted-locally.com',
            order: 0,
            deletedAt: 2500, // Tombstoned locally after remote snapshot was created
          },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000, // Older snapshot on remote, tab is still active
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Work', createdAt }],
        tabs: [
          {
            id: 100,
            spaceId: 1,
            url: 'https://deleted-locally.com',
            order: 0,
          },
        ],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 1500);

      // Local Dexie already has the tombstone, so no local updates are needed
      expect(result.hasLocalChanges).toBe(false);
      expect(result.localUpdates.tabs).toHaveLength(0);

      // Google Drive must receive the tombstoned merged snapshot
      expect(result.hasRemoteChanges).toBe(true);
      expect(result.hasChanges).toBe(true);
      expect(result.mergedSnapshot.tabs[0].deletedAt).toBe(2500);
    });

    it('sets hasLocalChanges: false, hasRemoteChanges: false, and hasChanges: false when local and remote are identical', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Identical Space', createdAt }],
        tabs: [{ id: 10, spaceId: 1, url: 'https://example.com', order: 0, title: 'Example' }],
        readLater: [{ id: 20, url: 'https://readlater.com', title: 'Article', addedAt: 1000, status: 'unread' }],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Identical Space', createdAt }],
        tabs: [{ id: 10, spaceId: 1, url: 'https://example.com', order: 0, title: 'Example' }],
        readLater: [{ id: 20, url: 'https://readlater.com', title: 'Article', addedAt: 1000, status: 'unread' }],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 2000);

      expect(result.hasLocalChanges).toBe(false);
      expect(result.hasRemoteChanges).toBe(false);
      expect(result.hasChanges).toBe(false);
    });

    it('seamlessly handles ISO string clientTimestamp on remote snapshot without comparison failure', () => {
      const createdAt = 1000;
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1725372000000, // numeric epoch
        deviceId: localDeviceId,
        spaces: [{ id: 1, name: 'Time Space', createdAt }],
        tabs: [
          {
            id: 10,
            spaceId: 1,
            url: 'https://example.com',
            order: 0,
            deletedAt: 1725371500000, // deleted before ISO remote snapshot
          },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: new Date(1725371900000).toISOString(), // Remote updated after local deletion
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, name: 'Time Space', createdAt }],
        tabs: [
          {
            id: 100,
            spaceId: 1,
            url: 'https://example.com',
            order: 0,
          },
        ],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 1725370000000);

      // Remote timestamp (1725371900000) > local deletion (1725371500000) -> Remote wins, revives tab
      expect(result.localUpdates.tabs).toHaveLength(1);
      expect(result.localUpdates.tabs[0].deletedAt).toBeUndefined();
      expect(result.hasLocalChanges).toBe(true);
    });
  });

  describe('Version 5: Immutable UUIDs & Universal LWW Timestamps', () => {
    it('matches spaces by uuid even when name and color have changed without duplicating spaces', () => {
      const uuid = 'space-uuid-001';
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, uuid, name: 'Local Space Name', color: 'blue', createdAt: 1000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 99, uuid, name: 'Remote Renamed Name', color: 'red', createdAt: 1000, updatedAt: 3000 }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Exactly 1 space in merged snapshot, no duplicates!
      expect(result.mergedSnapshot.spaces).toHaveLength(1);
      expect(result.mergedSnapshot.spaces[0].id).toBe(1);
      expect(result.mergedSnapshot.spaces[0].uuid).toBe(uuid);
      expect(result.mergedSnapshot.spaces[0].name).toBe('Remote Renamed Name');
      expect(result.mergedSnapshot.spaces[0].color).toBe('red');

      // Local Dexie receives the remote update
      expect(result.localUpdates.spaces).toHaveLength(1);
      expect(result.localUpdates.spaces[0].id).toBe(1);
      expect(result.localUpdates.spaces[0].name).toBe('Remote Renamed Name');
      expect(result.localUpdates.spaces[0].color).toBe('red');
    });

    it('falls back to fingerprint matching when remote space lacks a uuid and backfills uuid', () => {
      const localUuid = 'local-uuid-backfilled';
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, uuid: localUuid, name: 'Legacy Shared Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        // Legacy snapshot without uuid
        spaces: [{ id: 77, name: 'Legacy Shared Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.mergedSnapshot.spaces).toHaveLength(1);
      expect(result.mergedSnapshot.spaces[0].uuid).toBe(localUuid);
      expect(result.mergedSnapshot.spaces[0].id).toBe(1);
    });

    it('empty space adoption assigns remote space uuid to local space (Constraint 2)', () => {
      const remoteUuid = 'authoritative-remote-uuid';
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [{ id: 5, uuid: 'initial-local-uuid', name: 'Placeholder Space', createdAt: 2000 }],
        tabs: [], // 0 tabs -> empty placeholder candidate
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2500,
        deviceId: remoteDeviceId,
        spaces: [{ id: 42, uuid: remoteUuid, name: 'Placeholder Space', createdAt: 1500 }],
        tabs: [{ id: 101, spaceId: 42, url: 'https://remote-tab.com', order: 0 }],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Local space must adopt remote space's UUID so they match across devices
      expect(result.localUpdates.spaces).toHaveLength(1);
      expect(result.localUpdates.spaces[0].id).toBe(5);
      expect(result.localUpdates.spaces[0].uuid).toBe(remoteUuid);
      expect(result.mergedSnapshot.spaces[0].uuid).toBe(remoteUuid);
    });

    it('local space with newer updatedAt overrides remote color and triggers hasRemoteChanges (Constraint 3)', () => {
      const uuid = 'space-lww-uuid';
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, uuid, name: 'Project Alpha', color: 'green', createdAt: 1000, updatedAt: 5000 }],
        tabs: [],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 4000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, uuid, name: 'Project Alpha', color: 'purple', createdAt: 1000, updatedAt: 3000 }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      // Local newer updatedAt wins color
      expect(result.mergedSnapshot.spaces[0].color).toBe('green');
      expect(result.localUpdates.spaces).toHaveLength(0); // Local already has green

      // Google Drive must receive the update because remote had 'purple'
      expect(result.hasRemoteChanges).toBe(true);
      expect(result.hasChanges).toBe(true);
    });

    it('does NOT prune locally-added tab when tab.createdAt > remoteClientTimestamp (Absolute Pruning Guard)', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, uuid: 'matched-space', name: 'Work', createdAt: 1000 }],
        tabs: [
          {
            id: 10,
            spaceId: 1,
            url: 'https://recently-added-local.com',
            order: 0,
            createdAt: 4500, // Created locally AFTER remote snapshot was taken at 3000
            updatedAt: 4500,
          },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, uuid: 'matched-space', name: 'Work', createdAt: 1000 }],
        tabs: [], // Remote snapshot does not have this tab yet
        readLater: [],
      };

      // Baseline sync was at 2000
      const result = DiffEngine.reconcile(local, remote, localDeviceId, 2000);

      // Must NOT prune the recently added local tab!
      expect(result.localUpdates.tabIdsToDelete).toHaveLength(0);
      expect(result.mergedSnapshot.tabs).toHaveLength(1);
      expect(result.mergedSnapshot.tabs[0].url).toBe('https://recently-added-local.com');
    });

    it('does NOT prune locally-modified tab when tab.updatedAt > remoteClientTimestamp (Absolute Pruning Guard)', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, uuid: 'matched-space', name: 'Work', createdAt: 1000 }],
        tabs: [
          {
            id: 11,
            spaceId: 1,
            url: 'https://recently-modified-local.com',
            order: 0,
            createdAt: 1000,
            updatedAt: 4800, // Modified locally AFTER remote snapshot at 3000
          },
        ],
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 1, uuid: 'matched-space', name: 'Work', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 2000);

      // Must NOT prune the recently modified local tab!
      expect(result.localUpdates.tabIdsToDelete).toHaveLength(0);
      expect(result.mergedSnapshot.tabs).toHaveLength(1);
      expect(result.mergedSnapshot.tabs[0].url).toBe('https://recently-modified-local.com');
    });
  });

  describe('Milestone 6: E2EE Synchronization of Tab Rules & Behavioral Settings', () => {
    it('active rule updated locally with newer updatedAt overrides remote rule', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'rule-1',
            name: 'Local Dev Rule',
            enabled: true,
            priority: 0,
            matchAll: false,
            conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
            actions: [{ type: 'group', groupName: 'Dev Local', groupColor: 'blue' }],
            createdAt: 1000,
            updatedAt: 4000,
          },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'rule-1',
            name: 'Remote Dev Rule',
            enabled: true,
            priority: 0,
            matchAll: false,
            conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
            actions: [{ type: 'group', groupName: 'Dev Remote', groupColor: 'purple' }],
            createdAt: 1000,
            updatedAt: 2500,
          },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.mergedSnapshot.rules).toHaveLength(1);
      expect(result.mergedSnapshot.rules![0].name).toBe('Local Dev Rule');
      expect(result.mergedSnapshot.rules![0].actions[0].groupName).toBe('Dev Local');
      expect(result.localUpdates.rules).toBeUndefined(); // Local already has newer version
      expect(result.hasRemoteChanges).toBe(true);
    });

    it('soft-deleted local rule (deletedAt > remoteClientTimestamp) is not resurrected by older remote snapshot', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'rule-1',
            name: 'Deleted Rule',
            enabled: true,
            priority: 0,
            matchAll: false,
            conditions: [{ field: 'title', operator: 'contains', value: 'Test' }],
            actions: [{ type: 'pin' }],
            createdAt: 1000,
            updatedAt: 4500,
            deletedAt: 4500,
          },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'rule-1',
            name: 'Deleted Rule',
            enabled: true,
            priority: 0,
            matchAll: false,
            conditions: [{ field: 'title', operator: 'contains', value: 'Test' }],
            actions: [{ type: 'pin' }],
            createdAt: 1000,
            updatedAt: 2000,
          },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.mergedSnapshot.rules).toHaveLength(1);
      expect(result.mergedSnapshot.rules![0].deletedAt).toBe(4500);
      expect(result.localUpdates.rules).toBeUndefined();
      expect(result.hasRemoteChanges).toBe(true);
    });

    it('remote soft-deleted rule propagates tombstone to local rules', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'rule-1',
            name: 'To Be Deleted',
            enabled: true,
            priority: 0,
            matchAll: false,
            conditions: [],
            actions: [],
            createdAt: 1000,
            updatedAt: 1500,
          },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 4000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'rule-1',
            name: 'To Be Deleted',
            enabled: true,
            priority: 0,
            matchAll: false,
            conditions: [],
            actions: [],
            createdAt: 1000,
            updatedAt: 3500,
            deletedAt: 3500,
          },
        ],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId, 1000);

      expect(result.localUpdates.rules).toHaveLength(1);
      expect(result.localUpdates.rules![0].deletedAt).toBe(3500);
      expect(result.hasLocalChanges).toBe(true);
    });

    it('deterministic rule priority re-normalization maps sequential indices (Requirement 1)', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [
          {
            id: 'r1',
            name: 'Rule 1',
            enabled: true,
            priority: 5,
            matchAll: false,
            conditions: [],
            actions: [],
            createdAt: 1000,
            updatedAt: 1000,
          },
          {
            id: 'r2',
            name: 'Rule 2',
            enabled: true,
            priority: 2,
            matchAll: false,
            conditions: [],
            actions: [],
            createdAt: 1000,
            updatedAt: 2000,
          },
          {
            id: 'r3',
            name: 'Rule 3',
            enabled: true,
            priority: 2,
            matchAll: false,
            conditions: [],
            actions: [],
            createdAt: 1000,
            updatedAt: 3000, // Newer than r2 -> wins tie break for priority 2
          },
        ],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 5000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        rules: [],
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      const active = result.mergedSnapshot.rules!.filter((r) => !r.deletedAt);
      expect(active).toHaveLength(3);
      // r3 (priority 2, updatedAt 3000) -> index 0
      expect(active[0].id).toBe('r3');
      expect(active[0].priority).toBe(0);
      // r2 (priority 2, updatedAt 2000) -> index 1
      expect(active[1].id).toBe('r2');
      expect(active[1].priority).toBe(1);
      // r1 (priority 5, updatedAt 1000) -> index 2
      expect(active[2].id).toBe('r1');
      expect(active[2].priority).toBe(2);
    });

    it('synced behavioral settings update locally when remote updatedAt is newer', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        settings: {
          duplicateTabBehavior: 'focus-existing',
          spaceRestoreTrigger: 'single',
          readLaterOpenBehavior: 'foreground',
          readLaterAutoArchive: true,
          updatedAt: 1000,
        },
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        settings: {
          duplicateTabBehavior: 'allow',
          spaceRestoreTrigger: 'double',
          readLaterOpenBehavior: 'background',
          readLaterAutoArchive: false,
          updatedAt: 2500,
        },
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.settings).toEqual({
        duplicateTabBehavior: 'allow',
        spaceRestoreTrigger: 'double',
        readLaterOpenBehavior: 'background',
        readLaterAutoArchive: false,
        updatedAt: 2500,
      });
      expect(result.hasLocalChanges).toBe(true);
    });

    it('preserves local settings when remote snapshot lacks settings (backward compatibility)', () => {
      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: localDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        settings: {
          duplicateTabBehavior: 'focus-existing',
          spaceRestoreTrigger: 'single',
          readLaterOpenBehavior: 'foreground',
          readLaterAutoArchive: true,
          updatedAt: 1000,
        },
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: remoteDeviceId,
        spaces: [],
        tabs: [],
        readLater: [],
        // legacy snapshot: no settings
      };

      const result = DiffEngine.reconcile(local, remote, localDeviceId);

      expect(result.localUpdates.settings).toBeUndefined();
      expect(result.mergedSnapshot.settings).toEqual(local.settings);
      expect(result.hasRemoteChanges).toBe(true); // Remote needs to receive the settings
    });

    it('reconciles large tab sets with O(N) linear map indexing without performance regressions', () => {
      const spaceUuid = 'test-perf-space-uuid';
      const localTabs: Tab[] = [];
      const remoteTabs: Tab[] = [];

      for (let i = 0; i < 500; i++) {
        localTabs.push({
          id: i + 1,
          spaceId: 1,
          url: `https://example.com/page-${i}`,
          title: `Local Page ${i}`,
          order: i,
          createdAt: 1000,
          updatedAt: 1000,
        });
        remoteTabs.push({
          spaceId: 100,
          url: `https://example.com/page-${i}`,
          title: `Remote Page ${i}`,
          order: i,
          createdAt: 1000,
          updatedAt: 2000,
        });
      }

      const local: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: localDeviceId,
        spaces: [{ id: 1, uuid: spaceUuid, name: 'Perf Space', createdAt: 1000 }],
        tabs: localTabs,
        readLater: [],
      };

      const remote: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 3000,
        deviceId: remoteDeviceId,
        spaces: [{ id: 100, uuid: spaceUuid, name: 'Perf Space', createdAt: 1000 }],
        tabs: remoteTabs,
        readLater: [],
      };

      const start = performance.now();
      const result = DiffEngine.reconcile(local, remote, localDeviceId);
      const elapsed = performance.now() - start;

      expect(result.mergedSnapshot.tabs).toHaveLength(500);
      expect(result.localUpdates.tabs).toHaveLength(500);
      expect(result.localUpdates.tabs[0].title).toBe('Remote Page 0');
      expect(elapsed).toBeLessThan(500);
    });
  });
});
