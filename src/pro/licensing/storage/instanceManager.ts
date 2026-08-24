/**
 * Device Instance Manager
 *
 * Generates and persists a stable UUID for this device installation.
 * The UUID is created once via `crypto.randomUUID()` and stored in
 * `chrome.storage.local` under `tabbellus_instance_id`.
 */

const STORAGE_KEY = 'tabbellus_instance_id';

/**
 * Returns the existing device instance ID, or generates and persists a new one.
 * This UUID uniquely identifies this browser installation for Lemon Squeezy
 * license activation and is stable across restarts.
 */
export async function getOrCreateInstanceId(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const existing = result[STORAGE_KEY];

    if (typeof existing === 'string' && existing.length > 0) {
      return existing;
    }

    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ [STORAGE_KEY]: newId });
    return newId;
  } catch {
    // Fallback: generate a non-persistent UUID if storage is unavailable.
    // This is safe because activation will simply create a new instance
    // on each session, which Lemon Squeezy handles gracefully.
    return crypto.randomUUID();
  }
}

/**
 * Returns the current device instance ID without creating one.
 * Returns `null` if no instance ID has been generated yet.
 */
export async function getInstanceId(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const existing = result[STORAGE_KEY];
    return typeof existing === 'string' && existing.length > 0 ? existing : null;
  } catch {
    return null;
  }
}
