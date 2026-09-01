/**
 * Tab Rule Storage Manager
 *
 * Persists the tab automation rule set to `chrome.storage.sync` with
 * automatic `chrome.storage.local` fallback on quota or permission errors.
 * Storage key: `tabbellus_tab_rules`
 */

import type { TabRule } from '@/core/contracts/rules';

const STORAGE_KEY = 'tabbellus_tab_rules';

/**
 * Saves the rule set to `chrome.storage.sync`, falling back to
 * `chrome.storage.local` on quota exceeded or permission errors.
 */
export async function saveRules(rules: TabRule[]): Promise<void> {
  const payload = { [STORAGE_KEY]: rules };

  try {
    await chrome.storage.sync.set(payload);
  } catch {
    // Fallback to local storage on sync quota exceeded or permission error
    try {
      await chrome.storage.local.set(payload);
    } catch {
      // Silent failure — in-memory state will be lost but the app continues.
    }
  }
}

/**
 * Loads the rule set from storage, checking `chrome.storage.sync` first
 * and falling back to `chrome.storage.local`.
 */
export async function loadRules(): Promise<TabRule[]> {
  try {
    // Try sync first (preferred — syncs across devices)
    const syncResult = await chrome.storage.sync.get(STORAGE_KEY);
    if (Array.isArray(syncResult[STORAGE_KEY])) {
      return syncResult[STORAGE_KEY] as TabRule[];
    }
  } catch {
    // Sync unavailable — fall through to local
  }

  try {
    // Fallback to local storage
    const localResult = await chrome.storage.local.get(STORAGE_KEY);
    if (Array.isArray(localResult[STORAGE_KEY])) {
      return localResult[STORAGE_KEY] as TabRule[];
    }
  } catch {
    // Storage completely unavailable
  }

  return [];
}

/**
 * Clears the rule set from both sync and local storage.
 */
export async function clearRules(): Promise<void> {
  const clearPromises: Promise<void>[] = [];

  try {
    clearPromises.push(chrome.storage.sync.remove(STORAGE_KEY));
  } catch {
    // Ignore sync removal failures
  }

  try {
    clearPromises.push(chrome.storage.local.remove(STORAGE_KEY));
  } catch {
    // Ignore local removal failures
  }

  await Promise.allSettled(clearPromises);
}
