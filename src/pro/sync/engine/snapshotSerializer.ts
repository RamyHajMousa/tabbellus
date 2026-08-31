/**
 * Snapshot Serializer
 *
 * Reads domain entities from Dexie to create normalized snapshots,
 * writes reconciled entity updates back to Dexie within atomic transactions,
 * and validates vault payload schemas.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Lives entirely within `src/pro/sync/engine/`.
 * - Interacts with Dexie via `@/lib/db`.
 */

import { db } from '@/lib/db';
import type { SyncVaultSnapshot, ReconciliationResult } from './types';

export class SnapshotSerializer {
  /**
   * Reads all spaces, tabs, and readLater items from Dexie in a single
   * atomic read transaction and packages them into a normalized snapshot.
   *
   * @param deviceId - The stable device instance UUID.
   */
  static async createLocalSnapshot(deviceId: string): Promise<SyncVaultSnapshot> {
    const [spaces, tabs, readLater] = await db.transaction(
      'r',
      [db.spaces, db.tabs, db.readLater],
      async () => {
        return Promise.all([
          db.spaces.toArray(),
          db.tabs.toArray(),
          db.readLater.toArray(),
        ]);
      },
    );

    return {
      version: 1,
      clientTimestamp: Date.now(),
      deviceId,
      spaces,
      tabs,
      readLater,
    };
  }

  /**
   * Applies reconciled local updates to the Dexie database inside an
   * atomic read-write transaction.
   *
   * @param updates - Reconciled entities to upsert into Dexie.
   */
  static async applyRemoteUpdates(
    updates: ReconciliationResult['localUpdates'],
  ): Promise<void> {
    const { spaces, tabs, readLater } = updates;

    if (spaces.length === 0 && tabs.length === 0 && readLater.length === 0) {
      return;
    }

    await db.transaction('rw', [db.spaces, db.tabs, db.readLater], async () => {
      if (spaces.length > 0) {
        await db.spaces.bulkPut(spaces);
      }
      if (tabs.length > 0) {
        await db.tabs.bulkPut(tabs);
      }
      if (readLater.length > 0) {
        await db.readLater.bulkPut(readLater);
      }
    });
  }

  /**
   * Validates whether an unknown object conforms to the `SyncVaultSnapshot` schema.
   *
   * @param data - The deserialized JSON object to validate.
   */
  static validateSnapshot(data: unknown): data is SyncVaultSnapshot {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const candidate = data as Partial<SyncVaultSnapshot>;

    return (
      typeof candidate.version === 'number' &&
      typeof candidate.clientTimestamp === 'number' &&
      typeof candidate.deviceId === 'string' &&
      Array.isArray(candidate.spaces) &&
      Array.isArray(candidate.tabs) &&
      Array.isArray(candidate.readLater)
    );
  }
}
