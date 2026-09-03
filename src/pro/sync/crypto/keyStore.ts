/**
 * TabBellus Ephemeral Session Key Store
 *
 * Manages the in-memory and session-storage lifecycle of the active vault encryption key.
 * Uses `chrome.storage.session` so that unlocked vaults persist across sidepanel reopens
 * within the active browser session, but are purged automatically when the browser closes.
 *
 * Security Architecture:
 * - Never written to disk or `chrome.storage.local/sync`.
 * - Keys are exported as raw bytes, Base64-encoded, and stored in `chrome.storage.session`.
 * - In-memory cache provides synchronous-like low latency access during active operations.
 * - Graceful degradation to in-memory-only storage if `chrome.storage.session` is unavailable.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Owned exclusively by `src/pro/sync/crypto/`.
 * - Free Core interacts with sync status only via `@/core/contracts/sync.ts`.
 */

import { KeyStoreRecord } from './types';
import { uint8ArrayToBase64, base64ToUint8Array } from './webCrypto';

export const VAULT_SESSION_STORAGE_KEY = 'tabbellus_vault_session';

export class SessionKeyStore {
  private cachedKey: CryptoKey | null = null;
  private cachedSalt: string | null = null;

  /**
   * Helper to check whether chrome.storage.session is accessible in the current environment.
   */
  private hasSessionStorage(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.storage !== 'undefined' &&
      typeof chrome.storage.session !== 'undefined' &&
      typeof chrome.storage.session.get === 'function'
    );
  }

  /**
   * Saves an unlocked encryption key and its salt to the active session.
   * Caches in memory and persists to `chrome.storage.session`.
   */
  public async saveSession(key: CryptoKey, salt: string): Promise<void> {
    this.cachedKey = key;
    this.cachedSalt = salt;

    if (!this.hasSessionStorage()) {
      return;
    }

    try {
      const exportedRawBuffer = await crypto.subtle.exportKey('raw', key);
      const rawKeyBase64 = uint8ArrayToBase64(new Uint8Array(exportedRawBuffer));

      const record: KeyStoreRecord = {
        rawKey: rawKeyBase64,
        salt,
        unlockedAt: Date.now(),
      };

      await chrome.storage.session.set({ [VAULT_SESSION_STORAGE_KEY]: record });
    } catch {
      // Fail-open: gracefully degrade to in-memory storage without throwing
    }
  }

  /**
   * Loads the active encryption key and salt.
   * Returns from memory cache if populated, otherwise attempts to re-import from `chrome.storage.session`.
   * Returns null if the vault is locked.
   */
  public async loadSession(): Promise<{ key: CryptoKey; salt: string } | null> {
    if (this.cachedKey !== null && this.cachedSalt !== null) {
      return { key: this.cachedKey, salt: this.cachedSalt };
    }

    if (!this.hasSessionStorage()) {
      return null;
    }

    try {
      const result = await chrome.storage.session.get(VAULT_SESSION_STORAGE_KEY);
      const record = result?.[VAULT_SESSION_STORAGE_KEY] as KeyStoreRecord | undefined;

      if (!record || typeof record.rawKey !== 'string' || typeof record.salt !== 'string') {
        return null;
      }

      const rawKeyBytes = base64ToUint8Array(record.rawKey);
      if (rawKeyBytes.byteLength === 0) {
        return null;
      }

      const importedKey = await crypto.subtle.importKey(
        'raw',
        rawKeyBytes as unknown as BufferSource,
        'AES-GCM',
        true,
        ['encrypt', 'decrypt']
      );

      this.cachedKey = importedKey;
      this.cachedSalt = record.salt;

      return { key: importedKey, salt: record.salt };
    } catch {
      // In case of corrupt storage or deserialization error, treat as locked
      return null;
    }
  }

  /**
   * Clears the active session key from both memory and `chrome.storage.session`.
   */
  public async clearSession(): Promise<void> {
    this.cachedKey = null;
    this.cachedSalt = null;

    if (!this.hasSessionStorage()) {
      return;
    }

    try {
      await chrome.storage.session.remove(VAULT_SESSION_STORAGE_KEY);
    } catch {
      // Fail-open: silently swallow cleanup errors
    }
  }

  /**
   * Checks whether an active valid encryption key exists in memory or session storage.
   */
  public async isUnlocked(): Promise<boolean> {
    if (this.cachedKey !== null && this.cachedSalt !== null) {
      return true;
    }

    const session = await this.loadSession();
    return session !== null;
  }
}

/**
 * Singleton instance of SessionKeyStore for application-wide session unlock management.
 */
export const sessionKeyStore = new SessionKeyStore();
