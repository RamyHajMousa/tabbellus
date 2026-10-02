/**
 * Background Sync Client (Side Panel / Extension Page SyncProvider)
 *
 * Implements the `SyncProvider` contract by communicating with the background
 * service worker via typed `chrome.runtime.sendMessage` calls and reactive
 * status observation from `chrome.storage.session` ('tabbellus_sync_live_status').
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact strictly via `SyncProvider` from `@/core/contracts/sync`.
 * - Does NOT import `SyncEngine` or any background reconciliation logic.
 * - Interactive OAuth consent stays in the side panel under user gesture.
 * - OAuth tokens are NEVER transmitted in message payloads.
 */

import type {
  SyncProvider,
  SyncStatus,
  SyncResult,
  SyncOptions,
} from '@/core/contracts/sync';
import { googleAuthClient } from '../api/googleAuthClient';
import type { SyncMessage, SyncResponse } from '../protocol';
import { SYNC_LIVE_STATUS_SESSION_KEY } from '../protocol';

export class BackgroundSyncClient implements SyncProvider {
  private listeners = new Set<(status: SyncStatus) => void>();
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) | null = null;
  private currentStatus: SyncStatus | null = null;

  constructor() {
    // Lazy attachment on subscribe()
  }

  private attachStorageListener(): void {
    if (this.storageListener) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      this.storageListener = (changes, areaName) => {
        if (areaName === 'session' && changes[SYNC_LIVE_STATUS_SESSION_KEY]) {
          const newStatus = changes[SYNC_LIVE_STATUS_SESSION_KEY].newValue as SyncStatus | undefined;
          if (newStatus) {
            this.currentStatus = newStatus;
            this.notifyListeners(newStatus);
          }
        }
      };
      chrome.storage.onChanged.addListener(this.storageListener);
    }
  }

  private detachStorageListener(): void {
    if (this.storageListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }
  }

  private notifyListeners(status: SyncStatus): void {
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // Prevent listener error from breaking notification loop
      }
    });
  }

  /**
   * Sends a typed message to the background sync dispatcher and awaits response.
   * Rethrows an Error carrying `code` on failure.
   */
  private async sendMessage<T = unknown>(message: SyncMessage): Promise<SyncResponse<T>> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('Chrome runtime messaging is not available');
    }

    const response = (await chrome.runtime.sendMessage(message)) as SyncResponse<T> | undefined;

    if (!response) {
      const lastError = chrome.runtime.lastError?.message;
      throw new Error(lastError ?? 'No response received from background service worker');
    }

    if (!response.success && response.error) {
      const err = new Error(response.error.message);
      if (response.error.code) {
        (err as any).code = response.error.code;
      }
      throw err;
    }

    return response;
  }

  // -------------------------------------------------------------------------
  // SyncProvider Contract Implementation
  // -------------------------------------------------------------------------

  async getStatus(): Promise<SyncStatus> {
    // 1. Try reading directly from session storage mirror
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const res = await chrome.storage.session.get(SYNC_LIVE_STATUS_SESSION_KEY);
        const live = res[SYNC_LIVE_STATUS_SESSION_KEY] as SyncStatus | undefined;
        if (live && typeof live === 'object') {
          this.currentStatus = live;
          return live;
        }
      } catch {
        // Fallback to message
      }
    }

    // 2. Fallback: query background service worker
    try {
      const response = await this.sendMessage<SyncStatus>({
        type: 'TABBELLUS_SYNC_GET_STATUS',
      });
      if (response.data) {
        this.currentStatus = response.data;
        return response.data;
      }
    } catch {
      // Fall through to default
    }

    return (
      this.currentStatus ?? {
        state: 'idle',
        isConnected: false,
        telemetry: { pendingMutations: 0, encrypted: false },
      }
    );
  }

  /**
   * B6 Connect flow:
   * 1. Performs interactive OAuth consent in side panel under user gesture.
   * 2. Sends TABBELLUS_SYNC_CONNECT to service worker WITHOUT token.
   * 3. Service worker connects non-interactively using Chrome's cached token.
   */
  async connect(): Promise<{ success: boolean; error?: string }> {
    // 1. Interactive OAuth in side panel (must run under user click gesture)
    const authResult = await googleAuthClient.getAuthToken(true);
    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error ?? 'Authentication was cancelled or rejected.',
      };
    }

    // 2. Dispatch CONNECT message to service worker (NEVER send the token!)
    try {
      await this.sendMessage<void>({
        type: 'TABBELLUS_SYNC_CONNECT',
      });
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect Google Drive.';
      return { success: false, error: message };
    }
  }

  async disconnect(): Promise<void> {
    await this.sendMessage<void>({
      type: 'TABBELLUS_SYNC_DISCONNECT',
    });
  }

  async syncNow(options?: SyncOptions): Promise<SyncResult> {
    const response = await this.sendMessage<SyncResult>({
      type: 'TABBELLUS_SYNC_SYNC_NOW',
      options,
    });
    return response.data ?? { success: true, timestamp: Date.now() };
  }

  async setupEncryption(passphrase: string): Promise<void> {
    await this.sendMessage<void>({
      type: 'TABBELLUS_SYNC_SETUP_ENCRYPTION',
      passphrase,
    });
  }

  async disableEncryption(): Promise<void> {
    await this.sendMessage<void>({
      type: 'TABBELLUS_SYNC_DISABLE_ENCRYPTION',
    });
  }

  async unlockVault(passphrase: string): Promise<boolean> {
    const response = await this.sendMessage<boolean>({
      type: 'TABBELLUS_SYNC_UNLOCK_VAULT',
      passphrase,
    });
    return Boolean(response.data);
  }

  async lockVault(): Promise<void> {
    await this.sendMessage<void>({
      type: 'TABBELLUS_SYNC_LOCK_VAULT',
    });
  }

  async resetCloudVault(): Promise<void> {
    await this.sendMessage<void>({
      type: 'TABBELLUS_SYNC_RESET_CLOUD_VAULT',
    });
  }

  async notifyMutation(): Promise<void> {
    try {
      await this.sendMessage<void>({
        type: 'TABBELLUS_SYNC_MUTATION',
      });
    } catch {
      // Fire-and-forget
    }
  }

  subscribe(callback: (status: SyncStatus) => void): () => void {
    if (this.listeners.size === 0) {
      this.attachStorageListener();
    }
    this.listeners.add(callback);

    // Immediately provide current or cached status
    if (this.currentStatus) {
      callback(this.currentStatus);
    } else {
      this.getStatus()
        .then((status) => {
          callback(status);
        })
        .catch(() => {});
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.detachStorageListener();
      }
    };
  }

  dispose(): void {
    this.detachStorageListener();
    this.listeners.clear();
  }
}

export const backgroundSyncClient = new BackgroundSyncClient();
