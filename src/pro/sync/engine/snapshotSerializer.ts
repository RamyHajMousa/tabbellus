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

export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class SnapshotSerializer {
  /**
   * Reads all spaces, tabs, readLater items, rules, and synced settings in a
   * single normalized snapshot, filtering out tombstones older than 30 days.
   *
   * @param deviceId - The stable device instance UUID.
   */
  static async createLocalSnapshot(deviceId: string): Promise<SyncVaultSnapshot> {
    const now = Date.now();
    const cutoff = now - TOMBSTONE_TTL_MS;

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

    // 30-day tombstone compaction: prune expired tombstones from vault snapshot
    const compactedSpaces = spaces.filter((s) => !s.deletedAt || s.deletedAt >= cutoff);
    const compactedTabs = tabs.filter((t) => !t.deletedAt || t.deletedAt >= cutoff);
    const compactedReadLater = readLater.filter((r) => !r.deletedAt || r.deletedAt >= cutoff);

    let rules: SyncVaultSnapshot['rules'];
    try {
      const rawRules = await loadRules();
      rules = rawRules.filter((r) => !r.deletedAt || r.deletedAt >= cutoff);
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
      clientTimestamp: now,
      deviceId,
      spaces: compactedSpaces,
      tabs: compactedTabs,
      readLater: compactedReadLater,
      rules,
      settings,
    };
  }

  /**
   * Applies reconciled local updates to the Dexie database and local state.
   * Executes atomic 30-day tombstone deletion vacuum alongside entity upserts.
   * Enforces Anti-Echo Guards on rules and settings to prevent mutation loops.
   *
   * @param updates - Reconciled entities to upsert into Dexie, rules, and settings.
   */
  static async applyRemoteUpdates(
    updates: ReconciliationResult['localUpdates'],
  ): Promise<void> {
    const { spaces, tabs, readLater, tabIdsToDelete, rules, settings } = updates;
    const now = Date.now();
    const cutoff = now - TOMBSTONE_TTL_MS;

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

      // Atomic 30-Day Tombstone Storage Vacuum
      await db.spaces.where('deletedAt').below(cutoff).delete();
      await db.tabs.where('deletedAt').below(cutoff).delete();
      await db.readLater.where('deletedAt').below(cutoff).delete();
    });

    if (rules && rules.length > 0) {
      // Clean up expired rule tombstones before saving
      const compactedRules = rules.filter((r) => !r.deletedAt || r.deletedAt >= cutoff);
      // Anti-echo guard: bypass notifyLocalMutation()
      await rulesEngine.saveRules(compactedRules, { skipMutationNotification: true });
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
   * Performs resilient deep validation by filtering malformed elements with warnings
   * rather than discarding the entire snapshot.
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

    // Resilient deep validation: filter out malformed entities with warnings
    candidate.spaces = candidate.spaces!.filter((s) => {
      const isValid =
        Boolean(s) &&
        typeof s === 'object' &&
        typeof s.name === 'string' &&
        s.name.trim().length > 0 &&
        (typeof s.createdAt === 'number' || typeof s.createdAt === 'string');
      if (!isValid) {
        console.warn('[SnapshotSerializer] Filtered out malformed space record in snapshot:', s);
      }
      return isValid;
    });

    candidate.tabs = candidate.tabs!.filter((t) => {
      const isValid =
        Boolean(t) &&
        typeof t === 'object' &&
        typeof t.url === 'string' &&
        t.url.trim().length > 0 &&
        typeof t.spaceId === 'number';
      if (!isValid) {
        console.warn('[SnapshotSerializer] Filtered out malformed tab record in snapshot:', t);
      }
      return isValid;
    });

    candidate.readLater = candidate.readLater!.filter((r) => {
      const isValid =
        Boolean(r) &&
        typeof r === 'object' &&
        typeof r.url === 'string' &&
        r.url.trim().length > 0;
      if (!isValid) {
        console.warn('[SnapshotSerializer] Filtered out malformed readLater record in snapshot:', r);
      }
      return isValid;
    });

    if (candidate.rules !== undefined) {
      if (!Array.isArray(candidate.rules)) return false;
      candidate.rules = candidate.rules.filter((rule) => {
        const isValid =
          Boolean(rule) &&
          typeof rule === 'object' &&
          typeof rule.id === 'string' &&
          rule.id.trim().length > 0;
        if (!isValid) {
          console.warn('[SnapshotSerializer] Filtered out malformed rule record in snapshot:', rule);
        }
        return isValid;
      });
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
