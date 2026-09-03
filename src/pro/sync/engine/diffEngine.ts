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
 * 4. Empty Space Placeholder Adoption: Unmatched incoming remote spaces adopt
 *    existing active local spaces with identical name and 0 local tabs.
 * 5. Self-Healing Tab Deduplication: Cleanses duplicate URLs within remote spaces.
 * 6. Local Primary Key Binding: Preserves local tab `id` on upsert for in-place
 *    updates, preventing multi-cycle tab duplication.
 * 7. Pruning Timestamp Ground Truth: Prunes local tabs absent from remote only when
 *    remoteClientTimestamp > localLastSyncedAt for spaces known to both devices.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Pure algorithmic engine with zero side effects.
 * - Lives entirely within `src/pro/sync/engine/`.
 */

import type { Space, Tab, ReadLaterItem } from '@/lib/db';
import { normalizeTabUrl } from '@/lib/tabService';
import type { SyncVaultSnapshot, ReconciliationResult } from './types';

export { normalizeTabUrl };

/**
 * Normalizes any timestamp (epoch number, ISO string, null, undefined) into a numeric epoch in milliseconds.
 * Prevents silent comparison failures in JavaScript when comparing numbers against strings.
 */
export function toEpochMs(timestamp: string | number | undefined | null): number {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  const parsed = new Date(timestamp).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Computes a stable fingerprint for a Space based on immutable creation metadata.
 */
function getSpaceFingerprint(space: Space): string {
  return `${toEpochMs(space.createdAt)}_${space.name.trim()}`;
}

export class DiffEngine {
  /**
   * Reconciles spaces between local and remote snapshots.
   * Uses fingerprint (createdAt_name) as primary key, with fallback to empty placeholder adoption.
   */
  static reconcileSpaces(
    local: SyncVaultSnapshot,
    remote: SyncVaultSnapshot,
  ): {
    mergedSpaces: Space[];
    localSpaceUpdates: Space[];
    remoteToLocalSpaceId: Map<number, number>;
    matchedSpacePairs: Map<number, { localSpace: Space; remoteSpace: Space }>;
  } {
    let maxLocalSpaceId = local.spaces.reduce(
      (max, s) => Math.max(max, s.id ?? 0),
      0,
    );

    const localTabCountBySpaceId = new Map<number, number>();
    for (const tab of local.tabs) {
      localTabCountBySpaceId.set(
        tab.spaceId,
        (localTabCountBySpaceId.get(tab.spaceId) ?? 0) + 1,
      );
    }

    const localSpacesByUuid = new Map<string, Space>();
    const localSpacesByFingerprint = new Map<string, Space>();
    for (const space of local.spaces) {
      if (space.uuid) {
        localSpacesByUuid.set(space.uuid, space);
      }
      localSpacesByFingerprint.set(getSpaceFingerprint(space), space);
    }

    const mergedSpaces: Space[] = [];
    const localSpaceUpdates: Space[] = [];
    const remoteToLocalSpaceId = new Map<number, number>();
    const matchedSpacePairs = new Map<number, { localSpace: Space; remoteSpace: Space }>();
    const matchedLocalSpaceIds = new Set<number>();
    const processedSpaceFps = new Set<string>();

    // 1. Match remote spaces against local spaces: UUID first, then fingerprint fallback
    for (const remoteSpace of remote.spaces) {
      const remoteFp = getSpaceFingerprint(remoteSpace);
      processedSpaceFps.add(remoteFp);

      let localSpace: Space | undefined;
      // Primary matching: Match by immutable UUID when present
      if (remoteSpace.uuid) {
        localSpace = localSpacesByUuid.get(remoteSpace.uuid);
      }
      // Backward-Compatibility Fallback: If remote lacks UUID or no UUID match, match by fingerprint
      if (!localSpace) {
        const fpCandidate = localSpacesByFingerprint.get(remoteFp);
        if (fpCandidate && (fpCandidate.id === undefined || !matchedLocalSpaceIds.has(fpCandidate.id))) {
          localSpace = fpCandidate;
        }
      }

      if (localSpace) {
        if (localSpace.id !== undefined) {
          matchedLocalSpaceIds.add(localSpace.id);
        }

        const localSpaceId = localSpace.id ?? ++maxLocalSpaceId;
        if (remoteSpace.id !== undefined) {
          remoteToLocalSpaceId.set(remoteSpace.id, localSpaceId);
        }
        matchedSpacePairs.set(localSpaceId, { localSpace, remoteSpace });

        const resolvedUuid = remoteSpace.uuid || localSpace.uuid || crypto.randomUUID();

        const localCreatedMs = toEpochMs(localSpace.createdAt);
        const remoteCreatedMs = toEpochMs(remoteSpace.createdAt);
        const localHasUpdated = localSpace.updatedAt !== undefined;
        const remoteHasUpdated = remoteSpace.updatedAt !== undefined;
        const localUpdatedMs = toEpochMs(localSpace.updatedAt);
        const remoteUpdatedMs = toEpochMs(remoteSpace.updatedAt);

        const localDelMs = toEpochMs(localSpace.deletedAt);
        const remoteDelMs = toEpochMs(remoteSpace.deletedAt);

        const localMutationTime = Math.max(localDelMs, localUpdatedMs, localCreatedMs);
        const remoteMutationTime = Math.max(remoteDelMs, remoteUpdatedMs, remoteCreatedMs);

        const localClientTs = toEpochMs(local.clientTimestamp);
        const remoteClientTs = toEpochMs(remote.clientTimestamp);

        // LWW determination for metadata (name, color, isPinned):
        // If both sides have explicit updatedAt timestamps, compare them directly.
        // Otherwise, fall back to mutation time comparison (and clientTimestamp on tie).
        const remoteWins =
          localHasUpdated && remoteHasUpdated
            ? remoteUpdatedMs > localUpdatedMs ||
              (remoteUpdatedMs === localUpdatedMs && remoteClientTs >= localClientTs)
            : remoteMutationTime > localMutationTime ||
              (remoteMutationTime === localMutationTime && remoteClientTs >= localClientTs);

        const mergedUpdatedAt =
          localHasUpdated && remoteHasUpdated
            ? Math.max(localUpdatedMs, remoteUpdatedMs)
            : localHasUpdated
              ? localUpdatedMs
              : remoteHasUpdated
                ? remoteUpdatedMs
                : (remoteWins ? remoteMutationTime : localMutationTime);

        // Soft deletion tombstone rule: if either side is deleted after creation, tombstone wins
        const mergedDeletedAt =
          localSpace.deletedAt !== undefined && remoteSpace.deletedAt !== undefined
            ? Math.max(localDelMs, remoteDelMs)
            : remoteSpace.deletedAt !== undefined && (remoteDelMs >= localMutationTime || remoteWins)
              ? remoteSpace.deletedAt
              : localSpace.deletedAt !== undefined && (localDelMs >= remoteMutationTime || !remoteWins)
                ? localSpace.deletedAt
                : undefined;

        const mergedSpace: Space = {
          id: localSpaceId,
          uuid: resolvedUuid,
          name: remoteWins ? remoteSpace.name : localSpace.name,
          createdAt: Math.min(localCreatedMs, remoteCreatedMs),
          updatedAt: mergedUpdatedAt,
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
          localSpace.isPinned !== mergedSpace.isPinned ||
          localSpace.createdAt !== mergedSpace.createdAt ||
          (localSpace.updatedAt !== undefined && toEpochMs(localSpace.updatedAt) !== toEpochMs(mergedSpace.updatedAt)) ||
          (localSpace.uuid !== undefined && localSpace.uuid !== mergedSpace.uuid)
        ) {
          localSpaceUpdates.push(mergedSpace);
        }

        mergedSpaces.push(mergedSpace);
      } else {
        // Empty Placeholder Adoption Fallback:
        // If an incoming remote space does not match any local space by UUID or fingerprint,
        // check if there is an active (non-deleted) local space with the exact same name
        // and 0 associated local tabs.
        const emptyPlaceholder = local.spaces.find(
          (ls) =>
            ls.deletedAt === undefined &&
            ls.name.trim() === remoteSpace.name.trim() &&
            (localTabCountBySpaceId.get(ls.id!) ?? 0) === 0 &&
            (ls.id === undefined || !matchedLocalSpaceIds.has(ls.id)),
        );

        if (emptyPlaceholder) {
          if (emptyPlaceholder.id !== undefined) {
            matchedLocalSpaceIds.add(emptyPlaceholder.id);
          }
          const localSpaceId = emptyPlaceholder.id ?? ++maxLocalSpaceId;
          if (remoteSpace.id !== undefined) {
            remoteToLocalSpaceId.set(remoteSpace.id, localSpaceId);
          }
          matchedSpacePairs.set(localSpaceId, {
            localSpace: emptyPlaceholder,
            remoteSpace,
          });

          // Constraint 2: Assign remote space's UUID to local space so UUIDs match across devices
          const adoptedUuid = remoteSpace.uuid || emptyPlaceholder.uuid || crypto.randomUUID();

          const adoptedSpace: Space = {
            id: localSpaceId,
            uuid: adoptedUuid,
            name: remoteSpace.name,
            createdAt: remoteSpace.createdAt,
            updatedAt: Math.max(toEpochMs(emptyPlaceholder.updatedAt ?? 0), toEpochMs(remoteSpace.updatedAt ?? remote.clientTimestamp)),
            color: remoteSpace.color,
            deletedAt: remoteSpace.deletedAt,
            isPinned: remoteSpace.isPinned ?? emptyPlaceholder.isPinned,
          };

          localSpaceUpdates.push(adoptedSpace);
          mergedSpaces.push(adoptedSpace);
        } else {
          // Remote-only space: Assign new local ID and add to local updates
          const newLocalSpaceId = ++maxLocalSpaceId;
          if (remoteSpace.id !== undefined) {
            remoteToLocalSpaceId.set(remoteSpace.id, newLocalSpaceId);
          }

          const incomingSpace: Space = {
            ...remoteSpace,
            id: newLocalSpaceId,
            uuid: remoteSpace.uuid || crypto.randomUUID(),
            updatedAt: toEpochMs(remoteSpace.updatedAt ?? remote.clientTimestamp),
          };

          localSpaceUpdates.push(incomingSpace);
          mergedSpaces.push(incomingSpace);
        }
      }
    }

    // Add remaining local-only spaces
    for (const localSpace of local.spaces) {
      if (localSpace.id !== undefined && matchedLocalSpaceIds.has(localSpace.id)) {
        continue;
      }
      const fp = getSpaceFingerprint(localSpace);
      if (!processedSpaceFps.has(fp)) {
        mergedSpaces.push({
          ...localSpace,
          uuid: localSpace.uuid || crypto.randomUUID(),
          updatedAt: toEpochMs(localSpace.updatedAt ?? localSpace.createdAt),
        });
      }
    }

    return {
      mergedSpaces,
      localSpaceUpdates,
      remoteToLocalSpaceId,
      matchedSpacePairs,
    };
  }

  /**
   * Reconciles tabs between local and remote snapshots with URL normalization,
   * self-healing deduplication, local primary key binding, and timestamp-based pruning.
   */
  static reconcileTabs(
    localTabs: Tab[],
    remoteTabs: Tab[],
    spaceIdMap: Map<number, number>,
    matchedSpacePairs: Map<number, { localSpace: Space; remoteSpace: Space }>,
    localClientTimestamp: number | string,
    remoteClientTimestamp: number | string,
    localLastSyncedAt: number | string = 0,
  ): {
    mergedTabs: Tab[];
    localTabUpdates: Tab[];
    tabIdsToDelete: number[];
  } {
    const normLocalClientTs = toEpochMs(localClientTimestamp);
    const normRemoteClientTs = toEpochMs(remoteClientTimestamp);
    const normLocalLastSyncedAt = toEpochMs(localLastSyncedAt);

    // 1. Self-Healing Remote Tab Deduplication:
    // Within each remote space, deduplicate remoteTabs by normalizeTabUrl(tab.url).
    // If remote snapshot contains multiple tabs with identical normalized URL, keep only the lowest order.
    const dedupedRemoteTabsBySpace = new Map<number, Map<string, Tab>>();
    for (const rTab of remoteTabs) {
      let spaceTabsMap = dedupedRemoteTabsBySpace.get(rTab.spaceId);
      if (!spaceTabsMap) {
        spaceTabsMap = new Map<string, Tab>();
        dedupedRemoteTabsBySpace.set(rTab.spaceId, spaceTabsMap);
      }
      const normUrl = normalizeTabUrl(rTab.url);
      const existing = spaceTabsMap.get(normUrl);
      if (!existing || rTab.order < existing.order) {
        spaceTabsMap.set(normUrl, rTab);
      }
    }

    const cleansedRemoteTabs: Tab[] = [];
    for (const spaceTabsMap of dedupedRemoteTabsBySpace.values()) {
      for (const tab of spaceTabsMap.values()) {
        cleansedRemoteTabs.push(tab);
      }
    }

    // 2. Group local tabs by local spaceId
    const localTabsBySpaceId = new Map<number, Tab[]>();
    for (const tab of localTabs) {
      const list = localTabsBySpaceId.get(tab.spaceId) ?? [];
      list.push(tab);
      localTabsBySpaceId.set(tab.spaceId, list);
    }

    // 3. Group cleansed remote tabs by resolved local spaceId & collect normalized URLs
    const remoteTabsByResolvedSpaceId = new Map<number, Tab[]>();
    const remoteNormalizedUrlsByResolvedSpaceId = new Map<number, Set<string>>();

    for (const remoteTab of cleansedRemoteTabs) {
      const resolvedSpaceId = spaceIdMap.get(remoteTab.spaceId) ?? remoteTab.spaceId;

      const rList = remoteTabsByResolvedSpaceId.get(resolvedSpaceId) ?? [];
      rList.push(remoteTab);
      remoteTabsByResolvedSpaceId.set(resolvedSpaceId, rList);

      const urlSet =
        remoteNormalizedUrlsByResolvedSpaceId.get(resolvedSpaceId) ??
        new Set<string>();
      urlSet.add(normalizeTabUrl(remoteTab.url));
      remoteNormalizedUrlsByResolvedSpaceId.set(resolvedSpaceId, urlSet);
    }

    // 4. Pruning Timestamp Ground Truth:
    // For spaces already known to both devices:
    // Only prune local tabs absent from remote if remoteClientTimestamp > localLastSyncedAt
    const tabIdsToDelete: number[] = [];
    const prunedLocalTabIds = new Set<number>();

    if (normRemoteClientTs > normLocalLastSyncedAt) {
      for (const [resolvedLocalSpaceId] of matchedSpacePairs) {
        const localTabsInSpace = localTabsBySpaceId.get(resolvedLocalSpaceId) ?? [];
        const remoteUrls =
          remoteNormalizedUrlsByResolvedSpaceId.get(resolvedLocalSpaceId) ??
          new Set<string>();

        for (const localTab of localTabsInSpace) {
          const normLocalUrl = normalizeTabUrl(localTab.url);
          if (!remoteUrls.has(normLocalUrl)) {
            // Absolute Pruning Guard:
            // Compute local tab birth/edit activity time
            const localTabActivity = Math.max(
              toEpochMs(localTab.updatedAt),
              toEpochMs(localTab.createdAt),
            );
            // If localTab was created or modified locally after the remote snapshot was taken, DO NOT PRUNE!
            if (localTabActivity > normRemoteClientTs) {
              continue;
            }

            // If localTab is already tombstoned and localTab.deletedAt > remoteClientTimestamp,
            // local deletion happened after remote snapshot; preserve local tombstone!
            if (localTab.deletedAt !== undefined && toEpochMs(localTab.deletedAt) > normRemoteClientTs) {
              continue;
            }
            if (localTab.id !== undefined) {
              tabIdsToDelete.push(localTab.id);
              prunedLocalTabIds.add(localTab.id);
            }
          }
        }
      }
    }

    // 5. Reconcile remote tabs against local tabs
    const mergedTabs: Tab[] = [];
    const localTabUpdates: Tab[] = [];
    const matchedLocalTabIds = new Set<number>();

    for (const remoteTab of cleansedRemoteTabs) {
      const resolvedSpaceId = spaceIdMap.get(remoteTab.spaceId) ?? remoteTab.spaceId;
      const normRemoteUrl = normalizeTabUrl(remoteTab.url);

      const localTabsInSpace = localTabsBySpaceId.get(resolvedSpaceId) ?? [];
      const existingLocalTab = localTabsInSpace.find(
        (lt) =>
          lt.id !== undefined &&
          !matchedLocalTabIds.has(lt.id) &&
          !prunedLocalTabIds.has(lt.id) &&
          normalizeTabUrl(lt.url) === normRemoteUrl,
      );

      if (existingLocalTab) {
        matchedLocalTabIds.add(existingLocalTab.id!);

        const localIsDeleted = existingLocalTab.deletedAt !== undefined;
        const remoteIsDeleted = remoteTab.deletedAt !== undefined;
        const localDelMs = toEpochMs(existingLocalTab.deletedAt);
        const remoteDelMs = toEpochMs(remoteTab.deletedAt);

        let resolvedDeletedAt: number | undefined;

        if (localIsDeleted && !remoteIsDeleted) {
          // Case 1: Local is soft-deleted, Remote is active
          if (localDelMs > normRemoteClientTs) {
            // Local deletion occurred after remote snapshot was taken. Local tombstone wins.
            resolvedDeletedAt = existingLocalTab.deletedAt;
          } else {
            // Remote device added/edited tab after local deletion. Remote wins, revive locally.
            resolvedDeletedAt = undefined;
          }
        } else if (!localIsDeleted && remoteIsDeleted) {
          // Case 2: Remote is soft-deleted, Local is active
          if (remoteDelMs > normLocalLastSyncedAt) {
            // Remote deletion occurred after baseline sync. Remote tombstone wins.
            resolvedDeletedAt = remoteTab.deletedAt;
          } else {
            // Local activity is newer. Local wins, keep active.
            resolvedDeletedAt = undefined;
          }
        } else if (localIsDeleted && remoteIsDeleted) {
          // Case 4: Both are soft-deleted -> preserve latest tombstone
          resolvedDeletedAt = Math.max(localDelMs, remoteDelMs);
        } else {
          // Case 3: Both are active
          resolvedDeletedAt = undefined;
        }

        const localHasTabUpdated = existingLocalTab.updatedAt !== undefined;
        const remoteHasTabUpdated = remoteTab.updatedAt !== undefined;
        const localTabUpdatedMs = toEpochMs(existingLocalTab.updatedAt);
        const remoteTabUpdatedMs = toEpochMs(remoteTab.updatedAt);

        const localTabDelMs = toEpochMs(existingLocalTab.deletedAt);
        const remoteTabDelMs = toEpochMs(remoteTab.deletedAt);

        const localTabMutation = Math.max(localTabDelMs, localTabUpdatedMs, toEpochMs(existingLocalTab.createdAt));
        const remoteTabMutation = Math.max(remoteTabDelMs, remoteTabUpdatedMs, toEpochMs(remoteTab.createdAt));

        const remoteWins =
          localHasTabUpdated && remoteHasTabUpdated
            ? remoteTabUpdatedMs > localTabUpdatedMs ||
              (remoteTabUpdatedMs === localTabUpdatedMs && normRemoteClientTs >= normLocalClientTs)
            : remoteTabMutation > localTabMutation ||
              (remoteTabMutation === localTabMutation && normRemoteClientTs >= normLocalClientTs);

        const tabCreatedAt = existingLocalTab.createdAt ?? remoteTab.createdAt;
        const tabUpdatedAt =
          localHasTabUpdated && remoteHasTabUpdated
            ? Math.max(localTabUpdatedMs, remoteTabUpdatedMs)
            : localHasTabUpdated
              ? localTabUpdatedMs
              : remoteHasTabUpdated
                ? remoteTabUpdatedMs
                : (remoteWins ? remoteTabMutation : localTabMutation);

        // Set tabToUpsert.id = existingLocalTab.id to preserve Dexie primary key
        const tabToUpsert: Tab = {
          id: existingLocalTab.id,
          spaceId: resolvedSpaceId,
          url: remoteWins ? remoteTab.url : existingLocalTab.url,
          title: remoteWins
            ? (remoteTab.title ?? existingLocalTab.title)
            : (existingLocalTab.title ?? remoteTab.title),
          favicon: remoteWins
            ? (remoteTab.favicon ?? existingLocalTab.favicon)
            : (existingLocalTab.favicon ?? remoteTab.favicon),
          order: remoteWins ? remoteTab.order : existingLocalTab.order,
          ...(tabCreatedAt !== undefined ? { createdAt: tabCreatedAt } : {}),
          ...(tabUpdatedAt > 0 ? { updatedAt: tabUpdatedAt } : {}),
          ...(resolvedDeletedAt !== undefined ? { deletedAt: resolvedDeletedAt } : {}),
        };

        if (
          existingLocalTab.title !== tabToUpsert.title ||
          existingLocalTab.favicon !== tabToUpsert.favicon ||
          existingLocalTab.order !== tabToUpsert.order ||
          existingLocalTab.url !== tabToUpsert.url ||
          existingLocalTab.deletedAt !== tabToUpsert.deletedAt ||
          (existingLocalTab.updatedAt !== undefined && toEpochMs(existingLocalTab.updatedAt) !== toEpochMs(tabToUpsert.updatedAt))
        ) {
          localTabUpdates.push(tabToUpsert);
        }

        mergedTabs.push(tabToUpsert);
      } else {
        if (remoteTab.deletedAt !== undefined) {
          // Remote tab is already deleted and does not exist locally.
          // Do NOT insert into local Dexie (omit from localTabUpdates).
          // Retain in mergedTabs for tombstone propagation.
          const remoteTombstone: Tab = {
            spaceId: resolvedSpaceId,
            url: remoteTab.url,
            title: remoteTab.title,
            favicon: remoteTab.favicon,
            order: remoteTab.order,
            createdAt: remoteTab.createdAt ?? toEpochMs(remoteClientTimestamp),
            updatedAt: toEpochMs(remoteTab.updatedAt ?? remoteTab.createdAt ?? remoteClientTimestamp),
            deletedAt: remoteTab.deletedAt,
          };
          mergedTabs.push(remoteTombstone);
        } else {
          // Active remote tab: insert into local Dexie (omit id for auto-increment)
          const incomingTab: Tab = {
            spaceId: resolvedSpaceId,
            url: remoteTab.url,
            title: remoteTab.title,
            favicon: remoteTab.favicon,
            order: remoteTab.order,
            createdAt: remoteTab.createdAt ?? toEpochMs(remoteClientTimestamp),
            updatedAt: toEpochMs(remoteTab.updatedAt ?? remoteTab.createdAt ?? remoteClientTimestamp),
          };
          localTabUpdates.push(incomingTab);
          mergedTabs.push(incomingTab);
        }
      }
    }

    // 6. Add remaining local-only tabs
    for (const localTab of localTabs) {
      if (localTab.id !== undefined) {
        if (matchedLocalTabIds.has(localTab.id) || prunedLocalTabIds.has(localTab.id)) {
          continue;
        }
      }
      mergedTabs.push({
        ...localTab,
        createdAt: localTab.createdAt ?? toEpochMs(localClientTimestamp),
        updatedAt: toEpochMs(localTab.updatedAt ?? localTab.createdAt ?? localClientTimestamp),
      });
    }

    return {
      mergedTabs,
      localTabUpdates,
      tabIdsToDelete,
    };
  }

  /**
   * Reconciles Read Later items between local and remote snapshots.
   * Applies pre-deduplication, symmetric 4-case tombstone LWW resolution,
   * and 'archived' status convergence.
   */
  static reconcileReadLater(
    localReadLater: ReadLaterItem[],
    remoteReadLater: ReadLaterItem[],
    _localClientTimestamp: number | string,
    remoteClientTimestamp: number | string,
    localLastSyncedAt: number | string = 0,
  ): {
    mergedReadLater: ReadLaterItem[];
    localReadLaterUpdates: ReadLaterItem[];
  } {
    const normRemoteClientTs = toEpochMs(remoteClientTimestamp);
    const normLocalLastSyncedAt = toEpochMs(localLastSyncedAt);

    // 1. Pre-Deduplicate incoming remote readLater items by normalizeTabUrl(item.url)
    const dedupedRemoteMap = new Map<string, ReadLaterItem>();
    for (const rItem of remoteReadLater) {
      const normUrl = normalizeTabUrl(rItem.url);
      const existing = dedupedRemoteMap.get(normUrl);
      if (!existing) {
        dedupedRemoteMap.set(normUrl, rItem);
      } else {
        let pick = existing;
        const rTime = toEpochMs(rItem.deletedAt ?? rItem.addedAt);
        const eTime = toEpochMs(existing.deletedAt ?? existing.addedAt);

        if (rItem.status === 'archived' && existing.status !== 'archived' && !rItem.deletedAt && !existing.deletedAt) {
          pick = rItem;
        } else if (existing.status === 'archived' && rItem.status !== 'archived' && !rItem.deletedAt && !existing.deletedAt) {
          pick = existing;
        } else if (rTime > eTime) {
          pick = rItem;
        }
        dedupedRemoteMap.set(normUrl, pick);
      }
    }

    let maxLocalReadLaterId = localReadLater.reduce(
      (max, r) => Math.max(max, r.id ?? 0),
      0,
    );

    const localReadLaterByNormUrl = new Map<string, ReadLaterItem>();
    for (const item of localReadLater) {
      localReadLaterByNormUrl.set(normalizeTabUrl(item.url), item);
    }

    const mergedReadLater: ReadLaterItem[] = [];
    const localReadLaterUpdates: ReadLaterItem[] = [];
    const matchedLocalUrls = new Set<string>();

    for (const [normUrl, remoteItem] of dedupedRemoteMap.entries()) {
      matchedLocalUrls.add(normUrl);
      const localItem = localReadLaterByNormUrl.get(normUrl);

      if (localItem) {
        const localItemId = localItem.id ?? ++maxLocalReadLaterId;

        const localIsDeleted = localItem.deletedAt !== undefined;
        const remoteIsDeleted = remoteItem.deletedAt !== undefined;
        const localDelMs = toEpochMs(localItem.deletedAt);
        const remoteDelMs = toEpochMs(remoteItem.deletedAt);

        let resolvedDeletedAt: number | undefined;

        if (localIsDeleted && !remoteIsDeleted) {
          // Case 1: Local is soft-deleted, Remote is active
          if (localDelMs > normRemoteClientTs) {
            // Local deletion is newer than remote snapshot -> local tombstone wins
            resolvedDeletedAt = localItem.deletedAt;
          } else {
            // Remote activity is newer -> remote wins, revive locally
            resolvedDeletedAt = undefined;
          }
        } else if (!localIsDeleted && remoteIsDeleted) {
          // Case 2: Remote is soft-deleted, Local is active
          if (remoteDelMs > normLocalLastSyncedAt) {
            // Remote deletion is newer than local baseline sync -> remote tombstone wins
            resolvedDeletedAt = remoteItem.deletedAt;
          } else {
            // Local activity is newer -> local wins, keep active
            resolvedDeletedAt = undefined;
          }
        } else if (localIsDeleted && remoteIsDeleted) {
          // Case 4: Both are soft-deleted -> preserve latest tombstone
          resolvedDeletedAt = Math.max(localDelMs, remoteDelMs);
        } else {
          // Case 3: Both are active
          resolvedDeletedAt = undefined;
        }

        const localAddedMs = toEpochMs(localItem.addedAt);
        const remoteAddedMs = toEpochMs(remoteItem.addedAt);

        // Symmetric Last-Write-Wins based on timestamps (eliminates one-way status ratchet)
        const localUpdated = toEpochMs(localItem.updatedAt ?? localItem.addedAt);
        const remoteUpdated = toEpochMs(remoteItem.updatedAt ?? remoteClientTimestamp);

        // Status resolution: Symmetric Last-Write-Wins (eliminates one-way status ratchet)
        let remoteWins = false;
        let mergedStatus: 'unread' | 'read' | 'archived';

        if (resolvedDeletedAt !== undefined) {
          if (localIsDeleted && !remoteIsDeleted && localDelMs > normRemoteClientTs) {
            // Local tombstone is newer than remote snapshot -> local status wins
            remoteWins = false;
            mergedStatus = localItem.status;
          } else if (!localIsDeleted && remoteIsDeleted && remoteDelMs > normLocalLastSyncedAt) {
            // Remote tombstone is newer -> remote status wins
            remoteWins = true;
            mergedStatus = remoteItem.status;
          } else if (localIsDeleted && remoteIsDeleted) {
            // Both soft-deleted -> latest tombstone timestamp wins
            remoteWins = remoteDelMs > localDelMs;
            mergedStatus = remoteWins ? remoteItem.status : localItem.status;
          } else {
            remoteWins = remoteUpdated > localUpdated;
            mergedStatus = remoteWins ? remoteItem.status : localItem.status;
          }
        } else {
          // Both active: newer timestamp wins, default to local on tie
          remoteWins = remoteUpdated > localUpdated;
          mergedStatus = remoteWins ? remoteItem.status : localItem.status;
        }

        const maxUpdatedAt = (localItem.updatedAt !== undefined || remoteItem.updatedAt !== undefined)
          ? Math.max(localUpdated, remoteUpdated)
          : undefined;

        const mergedItem: ReadLaterItem = {
          id: localItemId,
          url: remoteWins ? remoteItem.url : localItem.url,
          title: remoteWins ? (remoteItem.title ?? localItem.title) : (localItem.title ?? remoteItem.title),
          favicon: remoteWins ? (remoteItem.favicon ?? localItem.favicon) : (localItem.favicon ?? remoteItem.favicon),
          addedAt: Math.max(localAddedMs, remoteAddedMs),
          status: mergedStatus,
          ...(maxUpdatedAt !== undefined ? { updatedAt: maxUpdatedAt } : {}),
          ...(resolvedDeletedAt !== undefined ? { deletedAt: resolvedDeletedAt } : {}),
        };

        if (
          localItem.status !== mergedItem.status ||
          localItem.title !== mergedItem.title ||
          localItem.favicon !== mergedItem.favicon ||
          localItem.addedAt !== mergedItem.addedAt ||
          localItem.deletedAt !== mergedItem.deletedAt ||
          localItem.updatedAt !== mergedItem.updatedAt
        ) {
          localReadLaterUpdates.push(mergedItem);
        }

        mergedReadLater.push(mergedItem);
      } else {
        // No local match
        if (remoteItem.deletedAt !== undefined) {
          // Remote item already deleted and never existed locally.
          // Do NOT insert into local Dexie (keep in mergedReadLater for propagation).
          mergedReadLater.push({ ...remoteItem });
        } else {
          // Active remote item: insert into local Dexie
          const newLocalItemId = ++maxLocalReadLaterId;
          const incomingItem: ReadLaterItem = {
            ...remoteItem,
            id: newLocalItemId,
            updatedAt: toEpochMs(remoteItem.updatedAt ?? remoteClientTimestamp),
          };
          localReadLaterUpdates.push(incomingItem);
          mergedReadLater.push(incomingItem);
        }
      }
    }

    // Add remaining local-only read later items
    for (const localItem of localReadLater) {
      const normUrl = normalizeTabUrl(localItem.url);
      if (!matchedLocalUrls.has(normUrl)) {
        mergedReadLater.push({
          ...localItem,
          updatedAt: toEpochMs(localItem.updatedAt ?? localItem.addedAt),
        });
      }
    }

    return {
      mergedReadLater,
      localReadLaterUpdates,
    };
  }

  /**
   * Reconciles a local snapshot against an optional remote vault snapshot.
   *
   * @param local - The local client's snapshot of Dexie data.
   * @param remote - The remote cloud vault snapshot (or null if first sync).
   * @param deviceId - The stable device UUID performing reconciliation.
   * @param localLastSyncedAt - Timestamp of the last successful local sync.
   */
  static reconcile(
    local: SyncVaultSnapshot,
    remote: SyncVaultSnapshot | null,
    deviceId: string,
    localLastSyncedAt: number | string = 0,
  ): ReconciliationResult {
    const timestamp = Date.now();

    // Fast path: No remote snapshot exists yet (initial upload)
    if (!remote || !remote.spaces) {
      return {
        localUpdates: {
          spaces: [],
          tabs: [],
          readLater: [],
          tabIdsToDelete: [],
        },
        mergedSnapshot: {
          version: 1,
          clientTimestamp: timestamp,
          deviceId,
          spaces: [...local.spaces],
          tabs: [...local.tabs],
          readLater: [...local.readLater],
        },
        hasLocalChanges: false,
        hasRemoteChanges: true,
        hasChanges: true,
      };
    }

    const localUpdates: ReconciliationResult['localUpdates'] = {
      spaces: [],
      tabs: [],
      readLater: [],
      tabIdsToDelete: [],
    };

    // -----------------------------------------------------------------------
    // 1. Reconcile Spaces
    // -----------------------------------------------------------------------
    const spacesResult = DiffEngine.reconcileSpaces(local, remote);
    localUpdates.spaces = spacesResult.localSpaceUpdates;

    // -----------------------------------------------------------------------
    // 2. Reconcile Tabs
    // -----------------------------------------------------------------------
    const tabsResult = DiffEngine.reconcileTabs(
      local.tabs,
      remote.tabs,
      spacesResult.remoteToLocalSpaceId,
      spacesResult.matchedSpacePairs,
      local.clientTimestamp,
      remote.clientTimestamp,
      localLastSyncedAt,
    );
    localUpdates.tabs = tabsResult.localTabUpdates;
    if (tabsResult.tabIdsToDelete.length > 0) {
      localUpdates.tabIdsToDelete = tabsResult.tabIdsToDelete;
    }

    // -----------------------------------------------------------------------
    // 3. Reconcile Read Later
    // -----------------------------------------------------------------------
    const readLaterResult = DiffEngine.reconcileReadLater(
      local.readLater,
      remote.readLater,
      local.clientTimestamp,
      remote.clientTimestamp,
      localLastSyncedAt,
    );
    localUpdates.readLater = readLaterResult.localReadLaterUpdates;

    // -----------------------------------------------------------------------
    // 4. Dual Change Detection: HasLocalChanges & HasRemoteChanges Evaluation
    // -----------------------------------------------------------------------
    const hasLocalChanges =
      localUpdates.spaces.length > 0 ||
      localUpdates.tabs.length > 0 ||
      localUpdates.readLater.length > 0 ||
      (localUpdates.tabIdsToDelete !== undefined &&
        localUpdates.tabIdsToDelete.length > 0);

    // Check if merged spaces differ from remote spaces
    let spacesDiffer = spacesResult.mergedSpaces.length !== remote.spaces.length;
    if (!spacesDiffer) {
      const remoteSpaceMap = new Map<string, Space>();
      for (const s of remote.spaces) {
        if (s.uuid) {
          remoteSpaceMap.set(s.uuid, s);
        }
        remoteSpaceMap.set(getSpaceFingerprint(s), s);
      }
      for (const ms of spacesResult.mergedSpaces) {
        const rs = (ms.uuid ? remoteSpaceMap.get(ms.uuid) : undefined) ?? remoteSpaceMap.get(getSpaceFingerprint(ms));
        if (
          !rs ||
          ms.name !== rs.name ||
          ms.color !== rs.color ||
          ms.isPinned !== rs.isPinned ||
          ms.deletedAt !== rs.deletedAt ||
          (ms.updatedAt !== undefined && rs.updatedAt !== undefined && toEpochMs(ms.updatedAt) !== toEpochMs(rs.updatedAt)) ||
          (ms.uuid && rs.uuid && ms.uuid !== rs.uuid)
        ) {
          spacesDiffer = true;
          break;
        }
      }
    }

    // Check if merged tabs differ from remote tabs
    let tabsDiffer = tabsResult.mergedTabs.length !== remote.tabs.length;
    if (!tabsDiffer) {
      const remoteTabMap = new Map<string, Tab>();
      for (const rt of remote.tabs) {
        const resolvedSpaceId = spacesResult.remoteToLocalSpaceId.get(rt.spaceId) ?? rt.spaceId;
        const key = `${resolvedSpaceId}::${normalizeTabUrl(rt.url)}`;
        remoteTabMap.set(key, rt);
      }
      for (const mt of tabsResult.mergedTabs) {
        const key = `${mt.spaceId}::${normalizeTabUrl(mt.url)}`;
        const rt = remoteTabMap.get(key);
        if (
          !rt ||
          mt.order !== rt.order ||
          mt.title !== rt.title ||
          mt.favicon !== rt.favicon ||
          mt.deletedAt !== rt.deletedAt ||
          (mt.updatedAt !== undefined && rt.updatedAt !== undefined && toEpochMs(mt.updatedAt) !== toEpochMs(rt.updatedAt))
        ) {
          tabsDiffer = true;
          break;
        }
      }
    }

    // Check if merged read later items differ from remote read later items
    let readLaterDiffer = readLaterResult.mergedReadLater.length !== remote.readLater.length;
    if (!readLaterDiffer) {
      const remoteReadLaterMap = new Map<string, ReadLaterItem>();
      for (const r of remote.readLater) {
        remoteReadLaterMap.set(normalizeTabUrl(r.url), r);
      }
      for (const mr of readLaterResult.mergedReadLater) {
        const rr = remoteReadLaterMap.get(normalizeTabUrl(mr.url));
        if (
          !rr ||
          mr.status !== rr.status ||
          mr.title !== rr.title ||
          mr.favicon !== rr.favicon ||
          mr.deletedAt !== rr.deletedAt ||
          (mr.updatedAt !== undefined && rr.updatedAt !== undefined && toEpochMs(mr.updatedAt) !== toEpochMs(rr.updatedAt))
        ) {
          readLaterDiffer = true;
          break;
        }
      }
    }

    const hasRemoteChanges = spacesDiffer || tabsDiffer || readLaterDiffer;
    const hasChanges = hasLocalChanges || hasRemoteChanges;

    return {
      localUpdates,
      mergedSnapshot: {
        version: 1,
        clientTimestamp: timestamp,
        deviceId,
        spaces: spacesResult.mergedSpaces,
        tabs: tabsResult.mergedTabs,
        readLater: readLaterResult.mergedReadLater,
      },
      hasLocalChanges,
      hasRemoteChanges,
      hasChanges,
    };
  }
}
