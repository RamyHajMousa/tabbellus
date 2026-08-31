/**
 * Record-Level LWW Diff & Reconciliation Engine
 *
 * Implements deterministic Last-Write-Wins (LWW) multi-master reconciliation
 * for Spaces, Tabs, and Read Later items.
 *
 * KEY GUARANTEES:
 * 1. Tombstone Preservation: Soft-deleted spaces (`deletedAt`) are preserved
 *    across devices to prevent deletion resurrection.
 * 2. Foreign Key Integrity: Remote space IDs are remapped to local auto-increment
 *    IDs, and tab `spaceId` foreign keys are automatically updated.
 * 3. Status Convergence: Read Later items converge toward `'archived'` state.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Pure algorithmic engine with zero side effects.
 * - Lives entirely within `src/pro/sync/engine/`.
 */

import type { Space, Tab, ReadLaterItem } from '@/lib/db';
import type { SyncVaultSnapshot, ReconciliationResult } from './types';

/**
 * Computes a stable fingerprint for a Space based on immutable creation metadata.
 */
function getSpaceFingerprint(space: Space): string {
  return `${space.createdAt}_${space.name.trim()}`;
}

/**
 * Computes a stable key for a Tab within a space.
 */
function getTabKey(spaceId: number, url: string): string {
  return `${spaceId}_${url.trim()}`;
}

export class DiffEngine {
  /**
   * Reconciles a local snapshot against an optional remote vault snapshot.
   *
   * @param local - The local client's snapshot of Dexie data.
   * @param remote - The remote cloud vault snapshot (or null if first sync).
   * @param deviceId - The stable device UUID performing reconciliation.
   */
  static reconcile(
    local: SyncVaultSnapshot,
    remote: SyncVaultSnapshot | null,
    deviceId: string,
  ): ReconciliationResult {
    const timestamp = Date.now();

    // Fast path: No remote snapshot exists yet (initial upload)
    if (!remote || !remote.spaces) {
      return {
        localUpdates: {
          spaces: [],
          tabs: [],
          readLater: [],
        },
        mergedSnapshot: {
          version: 1,
          clientTimestamp: timestamp,
          deviceId,
          spaces: [...local.spaces],
          tabs: [...local.tabs],
          readLater: [...local.readLater],
        },
        hasChanges: true,
      };
    }

    const localUpdates: ReconciliationResult['localUpdates'] = {
      spaces: [],
      tabs: [],
      readLater: [],
    };

    // -----------------------------------------------------------------------
    // 1. Reconcile Spaces
    // -----------------------------------------------------------------------
    let maxLocalSpaceId = local.spaces.reduce(
      (max, s) => Math.max(max, s.id ?? 0),
      0,
    );

    const localSpacesByFp = new Map<string, Space>();
    for (const space of local.spaces) {
      localSpacesByFp.set(getSpaceFingerprint(space), space);
    }

    const remoteToLocalSpaceId = new Map<number, number>();
    const mergedSpaces: Space[] = [];
    const processedSpaceFps = new Set<string>();

    for (const remoteSpace of remote.spaces) {
      const fp = getSpaceFingerprint(remoteSpace);
      processedSpaceFps.add(fp);

      const localSpace = localSpacesByFp.get(fp);

      if (localSpace) {
        // Matched space on both local and remote
        const localSpaceId = localSpace.id ?? ++maxLocalSpaceId;
        if (remoteSpace.id !== undefined) {
          remoteToLocalSpaceId.set(remoteSpace.id, localSpaceId);
        }

        const localMutationTime = Math.max(
          localSpace.deletedAt ?? 0,
          localSpace.createdAt,
        );
        const remoteMutationTime = Math.max(
          remoteSpace.deletedAt ?? 0,
          remoteSpace.createdAt,
        );

        // Tombstone preservation & LWW determination
        const remoteWins =
          remoteMutationTime > localMutationTime ||
          (remoteMutationTime === localMutationTime &&
            remote.clientTimestamp > local.clientTimestamp);

        // Soft deletion tombstone rule: if either side is deleted after creation, tombstone wins
        const mergedDeletedAt =
          localSpace.deletedAt !== undefined && remoteSpace.deletedAt !== undefined
            ? Math.max(localSpace.deletedAt, remoteSpace.deletedAt)
            : remoteSpace.deletedAt !== undefined &&
                (remoteSpace.deletedAt >= localSpace.createdAt || remoteWins)
              ? remoteSpace.deletedAt
              : localSpace.deletedAt !== undefined &&
                  (localSpace.deletedAt >= remoteSpace.createdAt || !remoteWins)
                ? localSpace.deletedAt
                : undefined;

        const mergedSpace: Space = {
          id: localSpaceId,
          name: remoteWins ? remoteSpace.name : localSpace.name,
          createdAt: Math.min(localSpace.createdAt, remoteSpace.createdAt),
          deletedAt: mergedDeletedAt,
          isPinned: remoteWins
            ? (remoteSpace.isPinned ?? localSpace.isPinned)
            : (localSpace.isPinned ?? remoteSpace.isPinned),
          color: remoteWins
            ? (remoteSpace.color ?? localSpace.color)
            : (localSpace.color ?? remoteSpace.color),
        };

        // Check if local space needs database update
        if (
          localSpace.deletedAt !== mergedSpace.deletedAt ||
          localSpace.name !== mergedSpace.name ||
          localSpace.color !== mergedSpace.color ||
          localSpace.isPinned !== mergedSpace.isPinned
        ) {
          localUpdates.spaces.push(mergedSpace);
        }

        mergedSpaces.push(mergedSpace);
      } else {
        // Remote-only space: Assign new local ID and add to local updates
        const newLocalSpaceId = ++maxLocalSpaceId;
        if (remoteSpace.id !== undefined) {
          remoteToLocalSpaceId.set(remoteSpace.id, newLocalSpaceId);
        }

        const incomingSpace: Space = {
          ...remoteSpace,
          id: newLocalSpaceId,
        };

        localUpdates.spaces.push(incomingSpace);
        mergedSpaces.push(incomingSpace);
      }
    }

    // Add remaining local-only spaces
    for (const localSpace of local.spaces) {
      const fp = getSpaceFingerprint(localSpace);
      if (!processedSpaceFps.has(fp)) {
        mergedSpaces.push(localSpace);
      }
    }

    // -----------------------------------------------------------------------
    // 2. Reconcile Tabs
    // -----------------------------------------------------------------------
    let maxLocalTabId = local.tabs.reduce(
      (max, t) => Math.max(max, t.id ?? 0),
      0,
    );

    const localTabsByKey = new Map<string, Tab>();
    for (const tab of local.tabs) {
      localTabsByKey.set(getTabKey(tab.spaceId, tab.url), tab);
    }

    const mergedTabs: Tab[] = [];
    const processedTabKeys = new Set<string>();

    for (const remoteTab of remote.tabs) {
      // Remap remote tab's spaceId to the reconciled local space ID
      const resolvedSpaceId =
        remoteToLocalSpaceId.get(remoteTab.spaceId) ?? remoteTab.spaceId;
      const key = getTabKey(resolvedSpaceId, remoteTab.url);
      processedTabKeys.add(key);

      const localTab = localTabsByKey.get(key);

      if (localTab) {
        const localTabId = localTab.id ?? ++maxLocalTabId;
        const remoteWins = remote.clientTimestamp > local.clientTimestamp;

        const mergedTab: Tab = {
          id: localTabId,
          spaceId: resolvedSpaceId,
          url: remoteTab.url,
          title: remoteWins ? (remoteTab.title ?? localTab.title) : (localTab.title ?? remoteTab.title),
          favicon: remoteWins ? (remoteTab.favicon ?? localTab.favicon) : (localTab.favicon ?? remoteTab.favicon),
          order: remoteWins ? remoteTab.order : localTab.order,
        };

        if (
          localTab.title !== mergedTab.title ||
          localTab.favicon !== mergedTab.favicon ||
          localTab.order !== mergedTab.order
        ) {
          localUpdates.tabs.push(mergedTab);
        }

        mergedTabs.push(mergedTab);
      } else {
        // Remote-only tab: Assign new local ID and remapped spaceId
        const newLocalTabId = ++maxLocalTabId;
        const incomingTab: Tab = {
          ...remoteTab,
          id: newLocalTabId,
          spaceId: resolvedSpaceId,
        };

        localUpdates.tabs.push(incomingTab);
        mergedTabs.push(incomingTab);
      }
    }

    // Add remaining local-only tabs
    for (const localTab of local.tabs) {
      const key = getTabKey(localTab.spaceId, localTab.url);
      if (!processedTabKeys.has(key)) {
        mergedTabs.push(localTab);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Reconcile Read Later
    // -----------------------------------------------------------------------
    let maxLocalReadLaterId = local.readLater.reduce(
      (max, r) => Math.max(max, r.id ?? 0),
      0,
    );

    const localReadLaterByUrl = new Map<string, ReadLaterItem>();
    for (const item of local.readLater) {
      localReadLaterByUrl.set(item.url.trim(), item);
    }

    const mergedReadLater: ReadLaterItem[] = [];
    const processedReadLaterUrls = new Set<string>();

    for (const remoteItem of remote.readLater) {
      const urlKey = remoteItem.url.trim();
      processedReadLaterUrls.add(urlKey);

      const localItem = localReadLaterByUrl.get(urlKey);

      if (localItem) {
        const localItemId = localItem.id ?? ++maxLocalReadLaterId;

        // Status convergence: 'archived' state wins unless one is significantly newer
        let mergedStatus: 'unread' | 'read' | 'archived' = 'unread';
        let remoteWins = false;

        if (remoteItem.addedAt > localItem.addedAt) {
          remoteWins = true;
          mergedStatus = remoteItem.status;
        } else if (localItem.addedAt > remoteItem.addedAt) {
          remoteWins = false;
          mergedStatus = localItem.status;
        } else {
          // Same addedAt: 'archived' state wins over 'unread' / 'read'
          if (localItem.status === 'archived' || remoteItem.status === 'archived') {
            mergedStatus = 'archived';
          } else {
            remoteWins = remote.clientTimestamp > local.clientTimestamp;
            mergedStatus = remoteWins ? remoteItem.status : localItem.status;
          }
        }

        const mergedItem: ReadLaterItem = {
          id: localItemId,
          url: localItem.url,
          title: remoteWins ? (remoteItem.title ?? localItem.title) : (localItem.title ?? remoteItem.title),
          favicon: remoteWins ? (remoteItem.favicon ?? localItem.favicon) : (localItem.favicon ?? remoteItem.favicon),
          addedAt: Math.max(localItem.addedAt, remoteItem.addedAt),
          status: mergedStatus,
        };

        if (
          localItem.status !== mergedItem.status ||
          localItem.title !== mergedItem.title ||
          localItem.favicon !== mergedItem.favicon ||
          localItem.addedAt !== mergedItem.addedAt
        ) {
          localUpdates.readLater.push(mergedItem);
        }

        mergedReadLater.push(mergedItem);
      } else {
        // Remote-only read later item
        const newLocalItemId = ++maxLocalReadLaterId;
        const incomingItem: ReadLaterItem = {
          ...remoteItem,
          id: newLocalItemId,
        };

        localUpdates.readLater.push(incomingItem);
        mergedReadLater.push(incomingItem);
      }
    }

    // Add remaining local-only read later items
    for (const localItem of local.readLater) {
      const urlKey = localItem.url.trim();
      if (!processedReadLaterUrls.has(urlKey)) {
        mergedReadLater.push(localItem);
      }
    }

    // -----------------------------------------------------------------------
    // 4. HasChanges Evaluation
    // -----------------------------------------------------------------------
    const hasLocalUpdates =
      localUpdates.spaces.length > 0 ||
      localUpdates.tabs.length > 0 ||
      localUpdates.readLater.length > 0;

    const hasRemoteDiff =
      mergedSpaces.length !== remote.spaces.length ||
      mergedTabs.length !== remote.tabs.length ||
      mergedReadLater.length !== remote.readLater.length;

    const hasChanges = hasLocalUpdates || hasRemoteDiff;

    return {
      localUpdates,
      mergedSnapshot: {
        version: 1,
        clientTimestamp: timestamp,
        deviceId,
        spaces: mergedSpaces,
        tabs: mergedTabs,
        readLater: mergedReadLater,
      },
      hasChanges,
    };
  }
}
