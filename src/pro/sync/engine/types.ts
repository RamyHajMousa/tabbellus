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

export const CURRENT_SCHEMA_MAJOR = 1;
export const CURRENT_SCHEMA_MINOR = 0;
export const SNAPSHOT_SCHEMA_VERSION = `${CURRENT_SCHEMA_MAJOR}.${CURRENT_SCHEMA_MINOR}`;

/**
 * Parses a semver-like schema version (e.g., "1.2", "1.5.0", 1) into numeric major and minor components.
 */
export function parseSchemaVersion(version?: string | number): { major: number; minor: number } {
  if (typeof version === 'string') {
    const parts = version.trim().split('.');
    const major = parseInt(parts[0], 10);
    const minor = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    if (!isNaN(major)) {
      return { major, minor: isNaN(minor) ? 0 : minor };
    }
  } else if (typeof version === 'number' && !isNaN(version)) {
    return { major: Math.floor(version), minor: 0 };
  }
  return { major: CURRENT_SCHEMA_MAJOR, minor: CURRENT_SCHEMA_MINOR };
}

/**
 * Normalized snapshot of user domain data stored in the cloud vault.
 */
export interface SyncVaultSnapshot {
  version: number;
  schemaVersion?: string;
  clientTimestamp: number | string;
  deviceId: string;
  spaces: Space[];
  tabs: Tab[];
  readLater: ReadLaterItem[];
  rules?: TabRule[];
  settings?: SyncedSettings;
  [key: string]: unknown;
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
