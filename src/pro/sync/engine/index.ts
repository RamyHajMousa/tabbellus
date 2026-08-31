/**
 * TabBellus Pro Sync Engine Barrel Export
 *
 * Re-exports serializer, diff engine, and sync provider singleton.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core must not import from here.
 */

export type {
  SyncVaultSnapshot,
  ReconciliationResult,
  SyncStorageState,
} from './types';

export { SnapshotSerializer } from './snapshotSerializer';
export { DiffEngine } from './diffEngine';
export { SyncEngine, syncEngine } from './syncEngine';
