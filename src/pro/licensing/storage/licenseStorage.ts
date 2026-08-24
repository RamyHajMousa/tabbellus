/**
 * License Storage Manager
 *
 * Persists validated license state to `chrome.storage.sync` with
 * automatic `chrome.storage.local` fallback on quota or permission errors.
 * Storage key: `tabbellus_license`
 */

const STORAGE_KEY = 'tabbellus_license';

export interface LicenseStorageData {
  licenseKey: string;
  instanceId: string;
  status: 'active' | 'inactive' | 'expired' | 'disabled';
  tier: 'pro' | 'enterprise';
  validatedAt: number;
  expiresAt: number | null;
}

/**
 * Saves license data to `chrome.storage.sync`, falling back to
 * `chrome.storage.local` on quota or permission errors.
 */
export async function saveLicenseData(data: LicenseStorageData): Promise<void> {
  const payload = { [STORAGE_KEY]: data };

  try {
    await chrome.storage.sync.set(payload);
  } catch {
    // Fallback to local storage on sync quota exceeded or permission error
    try {
      await chrome.storage.local.set(payload);
    } catch {
      // Silent failure — cached state will be lost but core app continues
    }
  }
}

/**
 * Loads license data from storage, checking `chrome.storage.sync` first
 * and falling back to `chrome.storage.local`.
 */
export async function loadLicenseData(): Promise<LicenseStorageData | null> {
  try {
    // Try sync first (preferred — syncs across devices)
    const syncResult = await chrome.storage.sync.get(STORAGE_KEY);
    if (syncResult[STORAGE_KEY] && typeof syncResult[STORAGE_KEY] === 'object') {
      return syncResult[STORAGE_KEY] as LicenseStorageData;
    }
  } catch {
    // Sync unavailable — fall through to local
  }

  try {
    // Fallback to local storage
    const localResult = await chrome.storage.local.get(STORAGE_KEY);
    if (localResult[STORAGE_KEY] && typeof localResult[STORAGE_KEY] === 'object') {
      return localResult[STORAGE_KEY] as LicenseStorageData;
    }
  } catch {
    // Storage completely unavailable
  }

  return null;
}

/**
 * Clears license data from both sync and local storage.
 */
export async function clearLicenseData(): Promise<void> {
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
