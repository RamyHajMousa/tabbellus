/**
 * Storage-Backed Settings Adapter for Pro Cloud Sync
 *
 * Decouples snapshot serialization and remote sync updates from Zustand and React.
 * Directly reads and writes persistent portable settings to `chrome.storage.local` ('tabbellus-settings').
 *
 * ZERO-REACT & ZERO-ZUSTAND GUARANTEE:
 * - Must never import React, JSX, document, window, or Zustand stores (@/store/*).
 * - Enforces Anti-Echo Guard: Never emits contractRegistry.notifyLocalMutation().
 * - Enforces Forward Compatibility: Strictly preserves schema version, top-level persisted keys,
 *   and unrecognized/unknown settings fields across writes.
 */

import { DEFAULT_SETTINGS, memoryStorageFallback } from '@/lib/settings';
import type { SyncedSettings } from './types';

export const SETTINGS_STORAGE_KEY = 'tabbellus-settings';

/**
 * Reads synced portable settings from `chrome.storage.local`.
 * Resiliently parses JSON strings or direct object payloads and extracts settings
 * from either Zustand `state.settings` or legacy storage shapes, falling back to `DEFAULT_SETTINGS`.
 */
export async function getStoredSyncedSettings(): Promise<SyncedSettings> {
  let raw: any = null;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    try {
      const res = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
      const val = res ? res[SETTINGS_STORAGE_KEY] : null;
      if (val) {
        raw = typeof val === 'string' ? JSON.parse(val) : val;
      }
    } catch (err) {
      console.warn('[SettingsAdapter] Failed to parse tabbellus-settings:', err);
    }
  } else {
    const val = memoryStorageFallback[SETTINGS_STORAGE_KEY];
    raw = typeof val === 'string' ? JSON.parse(val) : (val ?? null);
  }

  // Accept state.settings, legacy root settings, or raw object (mirroring syncDiscardAlarm)
  const source = raw?.state?.settings ?? raw?.settings ?? raw;
  const settingsObj = typeof source === 'object' && source !== null ? source : {};

  const {
    duplicateTabBehavior = DEFAULT_SETTINGS.duplicateTabBehavior,
    spaceRestoreTrigger = DEFAULT_SETTINGS.spaceRestoreTrigger,
    readLaterOpenBehavior = DEFAULT_SETTINGS.readLaterOpenBehavior,
    readLaterAutoArchive = DEFAULT_SETTINGS.readLaterAutoArchive,
    settingsUpdatedAt,
    updatedAt,
    ...unknownFields
  } = settingsObj;

  const resolvedUpdatedAt = typeof settingsUpdatedAt === 'number' && settingsUpdatedAt > 0
    ? settingsUpdatedAt
    : (typeof updatedAt === 'number' && updatedAt > 0 ? updatedAt : 0);

  return {
    ...unknownFields,
    duplicateTabBehavior,
    spaceRestoreTrigger,
    readLaterOpenBehavior,
    readLaterAutoArchive,
    updatedAt: resolvedUpdatedAt || Date.now(),
  };
}

/**
 * Writes incoming reconciled settings back to `chrome.storage.local` ('tabbellus-settings').
 *
 * Spreads the existing persisted blob to preserve:
 * - `version`
 * - Every other persisted key (e.g. `theme`, `activeView`, `recentSearches`, etc.)
 * - Unknown settings fields on both existing local settings and incoming remote settings
 *
 * ANTI-ECHO GUARD: Never notifies local mutation bus.
 */
export async function applyRemoteSyncedSettings(incoming: SyncedSettings): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    const rawVal = memoryStorageFallback[SETTINGS_STORAGE_KEY];
    let existingBlob: any = rawVal ? (typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal) : {};
    const existingState = existingBlob?.state?.settings ?? existingBlob?.settings ?? {};
    const { updatedAt, ...incomingWithoutUpdatedAt } = incoming;
    const mergedSettings = {
      ...existingState,
      ...incomingWithoutUpdatedAt,
      ...(incoming.duplicateTabBehavior !== undefined ? { duplicateTabBehavior: incoming.duplicateTabBehavior } : {}),
      ...(incoming.spaceRestoreTrigger !== undefined ? { spaceRestoreTrigger: incoming.spaceRestoreTrigger } : {}),
      ...(incoming.readLaterOpenBehavior !== undefined ? { readLaterOpenBehavior: incoming.readLaterOpenBehavior } : {}),
      ...(incoming.readLaterAutoArchive !== undefined ? { readLaterAutoArchive: incoming.readLaterAutoArchive } : {}),
      settingsUpdatedAt: incoming.updatedAt,
    };
    const updatedBlob = {
      ...existingBlob,
      state: {
        ...(existingBlob.state ?? {}),
        settings: mergedSettings,
      },
      version: existingBlob.version ?? 0,
    };
    memoryStorageFallback[SETTINGS_STORAGE_KEY] = JSON.stringify(updatedBlob);
    return;
  }

  let rawVal: any = null;
  try {
    const res = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    rawVal = res ? res[SETTINGS_STORAGE_KEY] : null;
  } catch (err) {
    console.warn('[SettingsAdapter] Failed to read tabbellus-settings:', err);
  }

  const wasString = typeof rawVal === 'string' || rawVal === null || rawVal === undefined;
  let existingBlob: any = {};
  if (rawVal) {
    try {
      existingBlob = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
    } catch {
      existingBlob = {};
    }
  }
  if (!existingBlob || typeof existingBlob !== 'object') {
    existingBlob = {};
  }

  const { updatedAt, ...incomingWithoutUpdatedAt } = incoming;

  let updatedBlob: any;

  if (existingBlob.state && typeof existingBlob.state === 'object') {
    const existingState = existingBlob.state;
    const existingSettings = (existingState.settings && typeof existingState.settings === 'object')
      ? existingState.settings
      : {};

    const mergedSettings = {
      ...existingSettings,
      ...incomingWithoutUpdatedAt,
      ...(incoming.duplicateTabBehavior !== undefined ? { duplicateTabBehavior: incoming.duplicateTabBehavior } : {}),
      ...(incoming.spaceRestoreTrigger !== undefined ? { spaceRestoreTrigger: incoming.spaceRestoreTrigger } : {}),
      ...(incoming.readLaterOpenBehavior !== undefined ? { readLaterOpenBehavior: incoming.readLaterOpenBehavior } : {}),
      ...(incoming.readLaterAutoArchive !== undefined ? { readLaterAutoArchive: incoming.readLaterAutoArchive } : {}),
      settingsUpdatedAt: incoming.updatedAt,
    };

    updatedBlob = {
      ...existingBlob,
      state: {
        ...existingState,
        settings: mergedSettings,
      },
    };
  } else if (existingBlob.settings && typeof existingBlob.settings === 'object') {
    const existingSettings = existingBlob.settings;
    const mergedSettings = {
      ...existingSettings,
      ...incomingWithoutUpdatedAt,
      ...(incoming.duplicateTabBehavior !== undefined ? { duplicateTabBehavior: incoming.duplicateTabBehavior } : {}),
      ...(incoming.spaceRestoreTrigger !== undefined ? { spaceRestoreTrigger: incoming.spaceRestoreTrigger } : {}),
      ...(incoming.readLaterOpenBehavior !== undefined ? { readLaterOpenBehavior: incoming.readLaterOpenBehavior } : {}),
      ...(incoming.readLaterAutoArchive !== undefined ? { readLaterAutoArchive: incoming.readLaterAutoArchive } : {}),
      settingsUpdatedAt: incoming.updatedAt,
    };

    updatedBlob = {
      ...existingBlob,
      settings: mergedSettings,
    };
  } else {
    // New/uninitialized storage structure
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...incomingWithoutUpdatedAt,
      ...(incoming.duplicateTabBehavior !== undefined ? { duplicateTabBehavior: incoming.duplicateTabBehavior } : {}),
      ...(incoming.spaceRestoreTrigger !== undefined ? { spaceRestoreTrigger: incoming.spaceRestoreTrigger } : {}),
      ...(incoming.readLaterOpenBehavior !== undefined ? { readLaterOpenBehavior: incoming.readLaterOpenBehavior } : {}),
      ...(incoming.readLaterAutoArchive !== undefined ? { readLaterAutoArchive: incoming.readLaterAutoArchive } : {}),
      settingsUpdatedAt: incoming.updatedAt,
    };

    updatedBlob = {
      ...existingBlob,
      state: {
        settings: mergedSettings,
      },
      version: existingBlob.version ?? 0,
    };
  }

  const payload = wasString ? JSON.stringify(updatedBlob) : updatedBlob;
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: payload });
}
