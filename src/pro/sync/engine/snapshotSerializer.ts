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
import { loadRules } from '@/pro/rules/storage/ruleStorage';
import { rulesEngine } from '@/pro/rules/engine/rulesEngine';
import { useAppStore } from '@/store/appStore';
import type { SyncVaultSnapshot, ReconciliationResult, SyncedSettings } from './types';

export class SnapshotSerializer {
  /**
   * Reads all spaces, tabs, readLater items, rules, and synced settings in a
   * single normalized snapshot.
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

    let rules: SyncVaultSnapshot['rules'];
    try {
      rules = await loadRules();
    } catch {
      rules = [];
    }

    const appSettings = useAppStore.getState().settings;
    const settings: SyncedSettings = {
      duplicateTabBehavior: appSettings.duplicateTabBehavior,
      spaceRestoreTrigger: appSettings.spaceRestoreTrigger,
      readLaterOpenBehavior: appSettings.readLaterOpenBehavior,
      readLaterAutoArchive: appSettings.readLaterAutoArchive,
      updatedAt: appSettings.settingsUpdatedAt || Date.now(),
    };

    return {
      version: 1,
      clientTimestamp: Date.now(),
      deviceId,
      spaces,
      tabs,
      readLater,
      rules,
      settings,
    };
  }

  /**
   * Applies reconciled local updates to the Dexie database and local state.
   * Enforces Anti-Echo Guards on rules and settings to prevent mutation loops.
   *
   * @param updates - Reconciled entities to upsert into Dexie, rules, and settings.
   */
  static async applyRemoteUpdates(
    updates: ReconciliationResult['localUpdates'],
  ): Promise<void> {
    const { spaces, tabs, readLater, tabIdsToDelete, rules, settings } = updates;

    const hasDeletes = Boolean(tabIdsToDelete && tabIdsToDelete.length > 0);
    if (spaces.length > 0 || tabs.length > 0 || readLater.length > 0 || hasDeletes) {
      await db.transaction('rw', [db.spaces, db.tabs, db.readLater], async () => {
        if (tabIdsToDelete && tabIdsToDelete.length > 0) {
          await db.tabs.bulkDelete(tabIdsToDelete);
        }
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

    if (rules && rules.length > 0) {
      // Anti-echo guard: bypass notifyLocalMutation()
      await rulesEngine.saveRules(rules, { skipMutationNotification: true });
    }

    if (settings) {
      // Anti-echo guard: bypass notifyLocalMutation()
      useAppStore.getState().updateSettings(
        {
          duplicateTabBehavior: settings.duplicateTabBehavior,
          spaceRestoreTrigger: settings.spaceRestoreTrigger,
          readLaterOpenBehavior: settings.readLaterOpenBehavior,
          readLaterAutoArchive: settings.readLaterAutoArchive,
          settingsUpdatedAt: settings.updatedAt,
        },
        { skipMutationNotification: true },
      );
    }
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

    const baseValid = (
      typeof candidate.version === 'number' &&
      (typeof candidate.clientTimestamp === 'number' || typeof candidate.clientTimestamp === 'string') &&
      typeof candidate.deviceId === 'string' &&
      Array.isArray(candidate.spaces) &&
      Array.isArray(candidate.tabs) &&
      Array.isArray(candidate.readLater)
    );

    if (!baseValid) return false;

    if (candidate.rules !== undefined && !Array.isArray(candidate.rules)) {
      return false;
    }

    if (
      candidate.settings !== undefined &&
      (typeof candidate.settings !== 'object' ||
        candidate.settings === null ||
        typeof (candidate.settings as SyncedSettings).updatedAt !== 'number')
    ) {
      return false;
    }

    return true;
  }
}
