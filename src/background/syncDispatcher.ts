/**
 * Background Sync Dispatcher (MV3 Messaging)
 *
 * Exposes a synchronous `chrome.runtime.onMessage` listener that routes UI requests
 * to the background `SyncEngine` and `SyncScheduler`.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact through `contractRegistry` and `BackgroundSyncClient`.
 * - Static imports from `@/pro/background` only.
 *
 * MV3 RULES:
 * - Synchronous listener returning `true` ONLY inside handled async branches.
 * - Unhandled message types return `undefined` immediately.
 * - Strict sender validation: rejects content scripts, foreign extensions, and external URLs.
 * - Never log message payloads (protects passphrases and tokens).
 */

import { syncEngine as defaultSyncEngine, syncScheduler as defaultSyncScheduler } from '@/pro/background';
import type { SyncEngine } from '@/pro/background';
import type { SyncScheduler } from '@/pro/background';
import type { SyncMessage, SyncResponse } from '@/pro/sync/protocol';

export interface SyncDispatcherOptions {
  syncEngine?: SyncEngine;
  syncScheduler?: SyncScheduler;
}

/**
 * Validates message sender according to strict MV3 security invariants:
 * 1. sender.id matches this extension ID (no cross-extension attacks).
 * 2. sender.tab is undefined (rejects all content scripts injected into web pages).
 * 3. sender.url starts with chrome.runtime.getURL('') (extension pages only: side panel, popup, options).
 */
export function isValidSyncSender(sender: chrome.runtime.MessageSender): boolean {
  if (!sender) return false;

  if (typeof chrome === 'undefined' || !chrome.runtime) {
    return false;
  }

  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (sender.tab !== undefined) {
    return false;
  }

  const extensionBaseUrl = chrome.runtime.getURL('');
  if (!sender.url || !sender.url.startsWith(extensionBaseUrl)) {
    return false;
  }

  return true;
}

export class SyncDispatcher {
  private syncEngine: SyncEngine;
  private syncScheduler: SyncScheduler;

  constructor(options: SyncDispatcherOptions = {}) {
    this.syncEngine = options.syncEngine ?? defaultSyncEngine;
    this.syncScheduler = options.syncScheduler ?? defaultSyncScheduler;
  }

  /**
   * Synchronous message handler. Returns true for handled TABBELLUS_SYNC_* messages,
   * undefined for all other message types.
   */
  handleMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: SyncResponse) => void,
  ): boolean | undefined {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return undefined;
    }

    const type = (message as { type: unknown }).type;
    if (typeof type !== 'string' || !type.startsWith('TABBELLUS_SYNC_')) {
      return undefined;
    }

    // Sender validation: mandatory security guard
    if (!isValidSyncSender(sender)) {
      sendResponse({
        success: false,
        error: {
          code: 'UNAUTHORIZED_SENDER',
          message: 'Sender rejected: only extension pages are permitted to perform sync operations.',
        },
      });
      return true;
    }

    const syncMsg = message as SyncMessage;

    // Asynchronous dispatch with error normalization
    this.dispatchAsync(syncMsg)
      .then((res) => {
        sendResponse(res);
      })
      .catch((err: unknown) => {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({
          success: false,
          error: { code, message },
        });
      });

    return true; // Keep channel open for async response
  }

  private async dispatchAsync(message: SyncMessage): Promise<SyncResponse> {
    switch (message.type) {
      case 'TABBELLUS_SYNC_GET_STATUS': {
        const status = await this.syncEngine.getStatus();
        return { success: true, data: status };
      }

      case 'TABBELLUS_SYNC_CONNECT': {
        // Connect non-interactively in background worker using cached credentials
        const res = await this.syncEngine.connect(false);
        if (!res.success) {
          return {
            success: false,
            error: { message: res.error ?? 'Failed to connect Google Drive.' },
          };
        }
        return { success: true };
      }

      case 'TABBELLUS_SYNC_DISCONNECT': {
        await this.syncEngine.disconnect();
        return { success: true };
      }

      case 'TABBELLUS_SYNC_SYNC_NOW': {
        const result = await this.syncEngine.syncNow(message.options);
        return { success: true, data: result };
      }

      case 'TABBELLUS_SYNC_SETUP_ENCRYPTION': {
        await this.syncEngine.setupEncryption(message.passphrase);
        return { success: true };
      }

      case 'TABBELLUS_SYNC_DISABLE_ENCRYPTION': {
        await this.syncEngine.disableEncryption();
        return { success: true };
      }

      case 'TABBELLUS_SYNC_UNLOCK_VAULT': {
        const unlocked = await this.syncEngine.unlockVault(message.passphrase);
        return { success: true, data: unlocked };
      }

      case 'TABBELLUS_SYNC_LOCK_VAULT': {
        await this.syncEngine.lockVault();
        return { success: true };
      }

      case 'TABBELLUS_SYNC_RESET_CLOUD_VAULT': {
        await this.syncEngine.resetCloudVault();
        return { success: true };
      }

      case 'TABBELLUS_SYNC_MUTATION': {
        await this.syncScheduler.markDirty();
        return { success: true };
      }

      default: {
        return {
          success: false,
          error: { message: 'Unknown sync message type' },
        };
      }
    }
  }

  /**
   * Registers the onMessage listener with chrome.runtime.
   */
  init(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(
        (message, sender, sendResponse) => this.handleMessage(message, sender, sendResponse),
      );
    }
  }
}

export const syncDispatcher = new SyncDispatcher();

export function initSyncDispatcher(): void {
  syncDispatcher.init();
}
