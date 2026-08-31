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
import { DiffEngine } from '../diffEngine';
import type { SyncVaultSnapshot } from '../types';

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
});
