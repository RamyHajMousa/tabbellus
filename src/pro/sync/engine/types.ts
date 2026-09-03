/**
 * TabBellus Pro Sync Engine Types
 *
 * Types for the snapshot serializer, LWW reconciliation diff engine,
 * and stateful sync orchestration provider.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - These types are internal to the Pro sync subsystem.
 * - Free Core only interacts with `@/core/contracts/sync.ts`.
 */

import type { Space, Tab, ReadLaterItem } from '@/lib/db';
import type { TabRule } from '@/core/contracts/rules';

/**
 * Portable user behavioral settings synchronized across devices.
 */
export interface SyncedSettings {
  duplicateTabBehavior: 'allow' | 'focus-existing';
  spaceRestoreTrigger: 'single' | 'double';
  readLaterOpenBehavior: 'foreground' | 'background';
  readLaterAutoArchive: boolean;
  updatedAt: number;
}

/**
 * Normalized snapshot of user domain data stored in the cloud vault.
 */
export interface SyncVaultSnapshot {
  version: number;
  clientTimestamp: number | string;
  deviceId: string;
  spaces: Space[];
  tabs: Tab[];
  readLater: ReadLaterItem[];
  rules?: TabRule[];
  settings?: SyncedSettings;
}

/**
 * Result produced by the Record-Level LWW Diff Engine.
 */
export interface ReconciliationResult {
  /** Entities that must be applied to the local Dexie database */
  localUpdates: {
    spaces: Space[];
    tabs: Tab[];
    readLater: ReadLaterItem[];
    tabIdsToDelete?: number[]; // Explicit list of local tab IDs to prune
    rules?: TabRule[];
    settings?: SyncedSettings;
  };
  /** Fully reconciled snapshot to upload to Google Drive */
  mergedSnapshot: SyncVaultSnapshot;
  /** Whether local Dexie needs to apply incoming cloud updates */
  hasLocalChanges: boolean;
  /** Whether Google Drive needs to receive the updated merged snapshot */
  hasRemoteChanges: boolean;
  /** Whether any local or remote mutations occurred during reconciliation */
  hasChanges: boolean;
}

/**
 * Local persistent sync state stored in `chrome.storage.local`.
 */
export interface SyncStorageState {
  lastSyncedAt?: number;
  lastVaultFileId?: string;
  syncEnabled: boolean;
  lastError?: string;
  isEncrypted?: boolean;
  vaultSalt?: string;
}
