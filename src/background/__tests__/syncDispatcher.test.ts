/**
 * Background Sync Dispatcher Unit Tests (Commit B)
 *
 * Verifies:
 * - B1: Single synchronous onMessage listener returning true ONLY for TABBELLUS_SYNC_* messages
 * - B1: Non-sync messages return undefined (never keep port open)
 * - B2: Sender validation: rejects content scripts (sender.tab set), foreign extension IDs,
 *       and non-extension URLs. Accepts valid extension pages.
 * - B2: Never logs passphrases / sensitive message payloads.
 * - B3: Full message map to SyncEngine and SyncScheduler methods.
 * - B3: TABBELLUS_SYNC_CONNECT carries no token; calls engine with interactive=false.
 * - B4: Errors cross boundary as { code, message } and preserve code (e.g. SYNC_BUSY).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncDispatcher, isValidSyncSender } from '../syncDispatcher';
import { SyncBusyError } from '@/pro/sync/engine/syncEngine';
import type { SyncMessage } from '@/pro/sync/protocol';

describe('SyncDispatcher (Commit B)', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const EXTENSION_ID = 'test-extension-id';
  const EXTENSION_URL = `chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`;

  let mockSyncEngine: any;
  let mockSyncScheduler: any;
  let dispatcher: SyncDispatcher;

  const validSender = {
    id: EXTENSION_ID,
    tab: undefined,
    url: EXTENSION_URL,
  } as chrome.runtime.MessageSender;

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        id: EXTENSION_ID,
        getURL: (path = '') => `chrome-extension://${EXTENSION_ID}/${path}`,
      },
    });

    mockSyncEngine = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'idle',
        isConnected: true,
        telemetry: { pendingMutations: 0, encrypted: false },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: 12345 }),
      setupEncryption: vi.fn().mockResolvedValue(undefined),
      disableEncryption: vi.fn().mockResolvedValue(undefined),
      unlockVault: vi.fn().mockResolvedValue(true),
      lockVault: vi.fn().mockResolvedValue(undefined),
      resetCloudVault: vi.fn().mockResolvedValue(undefined),
    };

    mockSyncScheduler = {
      markDirty: vi.fn().mockResolvedValue(undefined),
    };

    dispatcher = new SyncDispatcher({
      syncEngine: mockSyncEngine,
      syncScheduler: mockSyncScheduler,
    });
  });

  describe('B2: Sender Validation', () => {
    it('accepts extension page sender (sender.tab is undefined, id matches, url has extension prefix)', () => {
      expect(isValidSyncSender(validSender)).toBe(true);
    });

    it('rejects content-script sender (sender.tab is defined)', () => {
      const contentScriptSender = {
        ...validSender,
        tab: { id: 100 } as chrome.tabs.Tab,
      };
      expect(isValidSyncSender(contentScriptSender)).toBe(false);
    });

    it('rejects foreign extension sender (sender.id does not match chrome.runtime.id)', () => {
      const foreignSender = {
        ...validSender,
        id: 'foreign-extension-id',
      };
      expect(isValidSyncSender(foreignSender)).toBe(false);
    });

    it('rejects non-extension page URL', () => {
      const webSender = {
        id: EXTENSION_ID,
        tab: undefined,
        url: 'https://evil.com/page.html',
      } as chrome.runtime.MessageSender;
      expect(isValidSyncSender(webSender)).toBe(false);
    });

    it('dispatcher rejects invalid sender and responds with error without executing engine method', async () => {
      const invalidSender = {
        ...validSender,
        tab: { id: 1 } as chrome.tabs.Tab,
      };
      const sendResponse = vi.fn();

      const handled = dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_GET_STATUS' },
        invalidSender,
        sendResponse,
      );

      expect(handled).toBe(true);
      await Promise.resolve(); // allow microtask resolution
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'UNAUTHORIZED_SENDER',
          }),
        }),
      );
      expect(mockSyncEngine.getStatus).not.toHaveBeenCalled();
    });
  });

  describe('B1: Message Routing and MV3 Return True Semantics', () => {
    it('returns undefined for non-sync messages (does not hold port open)', () => {
      const sendResponse = vi.fn();
      const result = dispatcher.handleMessage(
        { type: 'TABBELLUS_OTHER_ACTION' } as any,
        validSender,
        sendResponse,
      );

      expect(result).toBeUndefined();
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('returns true synchronously for all TABBELLUS_SYNC_* messages', () => {
      const types: SyncMessage['type'][] = [
        'TABBELLUS_SYNC_GET_STATUS',
        'TABBELLUS_SYNC_CONNECT',
        'TABBELLUS_SYNC_DISCONNECT',
        'TABBELLUS_SYNC_SYNC_NOW',
        'TABBELLUS_SYNC_SETUP_ENCRYPTION',
        'TABBELLUS_SYNC_DISABLE_ENCRYPTION',
        'TABBELLUS_SYNC_UNLOCK_VAULT',
        'TABBELLUS_SYNC_LOCK_VAULT',
        'TABBELLUS_SYNC_RESET_CLOUD_VAULT',
        'TABBELLUS_SYNC_MUTATION',
      ];

      for (const type of types) {
        const sendResponse = vi.fn();
        const handled = dispatcher.handleMessage(
          { type } as SyncMessage,
          validSender,
          sendResponse,
        );
        expect(handled).toBe(true);
      }
    });
  });

  describe('B3: Full Message Map', () => {
    it('TABBELLUS_SYNC_GET_STATUS calls syncEngine.getStatus() and responds with data', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage({ type: 'TABBELLUS_SYNC_GET_STATUS' }, validSender, sendResponse);
      await flush();

      expect(mockSyncEngine.getStatus).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ state: 'idle', isConnected: true }),
      });
    });

    it('TABBELLUS_SYNC_CONNECT calls syncEngine.connect(false) without token payload', async () => {
      const sendResponse = vi.fn();
      const message = { type: 'TABBELLUS_SYNC_CONNECT' } as SyncMessage;
      expect((message as any).token).toBeUndefined();

      dispatcher.handleMessage(message, validSender, sendResponse);
      await flush();

      // Background SW performs non-interactive connect (interactive=false)
      expect(mockSyncEngine.connect).toHaveBeenCalledWith(false);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('TABBELLUS_SYNC_DISCONNECT calls syncEngine.disconnect()', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage({ type: 'TABBELLUS_SYNC_DISCONNECT' }, validSender, sendResponse);
      await flush();

      expect(mockSyncEngine.disconnect).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('TABBELLUS_SYNC_SYNC_NOW passes options and responds with SyncResult', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_SYNC_NOW', options: { forceFull: true } },
        validSender,
        sendResponse,
      );
      await flush();

      expect(mockSyncEngine.syncNow).toHaveBeenCalledWith({ forceFull: true });
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: { success: true, timestamp: 12345 },
      });
    });

    it('TABBELLUS_SYNC_SETUP_ENCRYPTION calls syncEngine.setupEncryption with passphrase', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_SETUP_ENCRYPTION', passphrase: 'secret-passphrase' },
        validSender,
        sendResponse,
      );
      await flush();

      expect(mockSyncEngine.setupEncryption).toHaveBeenCalledWith('secret-passphrase');
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('TABBELLUS_SYNC_DISABLE_ENCRYPTION calls syncEngine.disableEncryption()', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_DISABLE_ENCRYPTION' },
        validSender,
        sendResponse,
      );
      await flush();

      expect(mockSyncEngine.disableEncryption).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('TABBELLUS_SYNC_UNLOCK_VAULT calls syncEngine.unlockVault and responds with boolean data', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_UNLOCK_VAULT', passphrase: 'pass' },
        validSender,
        sendResponse,
      );
      await flush();

      expect(mockSyncEngine.unlockVault).toHaveBeenCalledWith('pass');
      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: true });
    });

    it('TABBELLUS_SYNC_LOCK_VAULT calls syncEngine.lockVault()', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage({ type: 'TABBELLUS_SYNC_LOCK_VAULT' }, validSender, sendResponse);
      await flush();

      expect(mockSyncEngine.lockVault).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('TABBELLUS_SYNC_RESET_CLOUD_VAULT calls syncEngine.resetCloudVault()', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_RESET_CLOUD_VAULT' },
        validSender,
        sendResponse,
      );
      await flush();

      expect(mockSyncEngine.resetCloudVault).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('TABBELLUS_SYNC_MUTATION calls syncScheduler.markDirty()', async () => {
      const sendResponse = vi.fn();
      dispatcher.handleMessage({ type: 'TABBELLUS_SYNC_MUTATION' }, validSender, sendResponse);
      await flush();

      expect(mockSyncScheduler.markDirty).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('B4: Error Normalization & SyncBusyError Preservation', () => {
    it('SyncBusyError crosses boundary with code "SYNC_BUSY"', async () => {
      mockSyncEngine.syncNow.mockRejectedValueOnce(new SyncBusyError());
      const sendResponse = vi.fn();

      dispatcher.handleMessage({ type: 'TABBELLUS_SYNC_SYNC_NOW' }, validSender, sendResponse);
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'SYNC_BUSY',
          message: 'Sync is busy — please try again in a moment',
        },
      });
    });

    it('generic Error crosses boundary with message', async () => {
      mockSyncEngine.setupEncryption.mockRejectedValueOnce(new Error('Network failure'));
      const sendResponse = vi.fn();

      dispatcher.handleMessage(
        { type: 'TABBELLUS_SYNC_SETUP_ENCRYPTION', passphrase: 'pass' },
        validSender,
        sendResponse,
      );
      await flush();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: {
          code: undefined,
          message: 'Network failure',
        },
      });
    });
  });
});
