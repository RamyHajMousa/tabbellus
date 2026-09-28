# ADR-003: Google Drive Sync Reconciliation & Conflict Resolution

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** TabBellus Core Team

## Context

TabBellus Pro provides multi-device workspace synchronization without requiring a proprietary database backend. Synchronization is performed directly against the user's private Google Drive `appDataFolder`, upholding our zero-data-collection privacy policy.

However, synchronizing state directly across decentralized browser extensions via Google Drive presents several core distributed systems challenges:
1. Google Drive v3 lacks native atomic compare-and-swap (CAS) conditional writes.
2. Concurrent edits across multiple devices can lead to lost updates or overwritten spaces.
3. Rapid mutations in a local client could trigger infinite sync feedback loops (echo cycles) if not properly isolated.
4. Tab collections can span thousands of tabs across dozens of spaces; naive pairwise array scanning causes O(N^2) CPU spikes during synchronization.

## Decision

We designed a **Record-Level Last-Write-Wins (LWW) Diff Engine** coupled with an **Optimistic Concurrency Control (OCC) Jittered Retry Loop** and **Anti-Echo Guard**:

1. **Storage Destination & Auth:**
   Uses Chrome's native `chrome.identity.getAuthToken` with the `https://www.googleapis.com/auth/drive.appdata` scope. Files in `appDataFolder` are hidden from Google Drive UI and accessible only to TabBellus.
2. **Pre-flight Version Guard & OCC Retry Loop:**
   Because Drive v3 lacks conditional upload headers, `uploadVaultFile` accepts an `expectedVersion`. Before patching the file, it executes a lightweight pre-flight metadata check (`GET /drive/v3/files/{id}?fields=version`). If the remote version differs from the cycle's baseline, it aborts upload and returns `{ conflict: true }`. The sync engine pauses with randomized backoff jitter (`250ms + Math.random() * 500ms`), re-downloads the remote snapshot, re-reconciles, and retries up to `MAX_CONFLICT_RETRIES = 3`.
3. **Record-Level LWW & Soft-Delete Tombstones:**
   Entities (`spaces`, `tabs`, `readLater`) track `updatedAt` and `deletedAt`. Soft-delete tombstones propagate deletions across devices. Tombstone resolution follows strict rules: a newer tombstone deletes an older active record; a newer update revives a tombstoned record.
4. **O(N) Composite Map Indexing:**
   Local tabs are indexed by composite key `${spaceId}:::${normalizedUrl}` using hash maps, enabling linear O(N) tab diffing across thousands of tabs instead of quadratic O(N^2) pairwise searches.
5. **Anti-Echo Mutation Guard:**
   When remote snapshots are ingested into Dexie, the local mutation notification (`contractRegistry.notifyLocalMutation()`) is bypassed. This prevents remote sync writes from falsely triggering new local sync cycles.

## Key Mechanisms & Code Citations

- **Google Drive Client (`src/pro/sync/api/googleDriveClient.ts`):**
  - `findVaultFile`: Queries `fields=files(id,name,mimeType,modifiedTime,version,appProperties)` in `appDataFolder`.
  - `uploadVaultFile`: Pre-flight check verifies `remoteVersion === expectedVersion` before issuing PATCH, avoiding blind overwrites.
- **Snapshot Serialization (`src/pro/sync/engine/snapshotSerializer.ts`):**
  Extracts `spaces`, `tabs`, and `readLater` from Dexie in a single read transaction, validating schema integrity and formatting payload envelopes.
- **Diff Engine Reconciliation (`src/pro/sync/engine/diffEngine.ts`):**
  - Winner Spreading (`lines 246-262`):
    ```typescript
    const winner = remoteWins ? remoteSpace : localSpace;
    const mergedSpace: Space = {
      ...winner,
      id: localSpaceId,
      uuid: resolvedUuid,
      // Reconciled LWW timestamps and tombstones
    };
    ```
  - O(N) Composite Indexing (`lines 436-452`):
    Maps tabs to composite `${spaceId}:::${normUrl}` keys, eliminating nested loop bottlenecks during multi-device tab reconciliation.
  - Foreign Key Remapping: Maps remote space IDs to local space IDs based on stable cross-device UUIDs (`&uuid` index in Dexie).
- **Sync Engine Orchestration (`src/pro/sync/engine/syncEngine.ts`):**
  - Executes the 8-step `syncNow` pipeline.
  - Implements the jittered conflict retry loop (`MAX_CONFLICT_RETRIES = 3`).
  - Guards against echo loops by suppressing local mutation event dispatch during remote merge transactions.

## Consequences & Invariants

- **No Remote Backend Required:** Users retain complete ownership of their data within their own Google account.
- **Safe Concurrent Merging:** Simultaneous edits from multiple devices merge deterministically based on timestamps; concurrent uploads fail open with OCC retries rather than silently wiping data.
- **Linear CPU Budget:** Tab reconciliation operates in O(N) time and constant memory overhead, maintaining smooth UI responsiveness during background sync flushes.
