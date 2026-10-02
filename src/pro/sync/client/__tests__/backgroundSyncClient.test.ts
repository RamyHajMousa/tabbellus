/**
 * BackgroundSyncClient Unit Tests (Commit B)
 *
 * Verifies:
 * - B5: Implements the SyncProvider contract via chrome.runtime messaging.
 * - B5: Subscribes to status mirror in chrome.storage.session ('tabbellus_sync_live_status').
 * - B6: Connect flow performs interactive OAuth token acquisition in side panel context
 *       under user gesture, then sends TABBELLUS_SYNC_CONNECT without token payload.
 * - B4: Rethrows errors carrying `code` property so formatSyncErrorMessage and SyncBusyError
 *       handling continue to work seamlessly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackgroundSyncClient } from '../backgroundSyncClient';
import { googleAuthClient } from '@/pro/sync/api/googleAuthClient';
import type { SyncStatus } from '@/core/contracts/sync';

describe('BackgroundSyncClient (Commit B)', () => {
  let client: BackgroundSyncClient;
  let mockSendMessage: any;
  let mockSessionStorage: Record<string, unknown>;
  let storageChangedListeners: ((changes: Record<string, any>, areaName: string) => void)[];

  const sampleLiveStatus: SyncStatus = {
    state: 'synced',
    isConnected: true,
    telemetry: {
      lastSyncedAt: 1700000000000,
      pendingMutations: 0,
      encrypted: true,
    },
  };

  beforeEach(() => {
    mockSessionStorage = {
      tabbellus_sync_live_status: sampleLiveStatus,
    };
    storageChangedListeners = [];

    mockSendMessage = vi.fn().mockImplementation((message: any) => {
      if (message.type === 'TABBELLUS_SYNC_GET_STATUS') {
        return Promise.resolve({ success: true, data: sampleLiveStatus });
      }
      if (message.type === 'TABBELLUS_SYNC_CONNECT') {
        return Promise.resolve({ success: true });
      }
      if (message.type === 'TABBELLUS_SYNC_DISCONNECT') {
        return Promise.resolve({ success: true });
      }
      if (message.type === 'TABBELLUS_SYNC_SYNC_NOW') {
        return Promise.resolve({ success: true, data: { success: true, timestamp: 12345 } });
      }
      if (message.type === 'TABBELLUS_SYNC_UNLOCK_VAULT') {
        return Promise.resolve({ success: true, data: true });
      }
      return Promise.resolve({ success: true });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: mockSendMessage,
        lastError: null,
      },
      storage: {
        session: {
          get: vi.fn((key: string) => Promise.resolve({ [key]: mockSessionStorage[key] })),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(mockSessionStorage, items);
            return Promise.resolve();
          }),
        },
        onChanged: {
          addListener: vi.fn((fn) => storageChangedListeners.push(fn)),
          removeListener: vi.fn((fn) => {
            storageChangedListeners = storageChangedListeners.filter((l) => l !== fn);
          }),
        },
      },
    });

    client = new BackgroundSyncClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('SyncProvider Contract Implementation', () => {
    it('getStatus returns status from session mirror or message fallback', async () => {
      const status = await client.getStatus();
      expect(status.state).toBe('synced');
      expect(status.isConnected).toBe(true);
      expect(status.telemetry.encrypted).toBe(true);
    });

    it('syncNow sends TABBELLUS_SYNC_SYNC_NOW with options', async () => {
      const result = await client.syncNow({ forceFull: true });
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TABBELLUS_SYNC_SYNC_NOW',
        options: { forceFull: true },
      });
      expect(result.success).toBe(true);
      expect(result.timestamp).toBe(12345);
    });

    it('disconnect sends TABBELLUS_SYNC_DISCONNECT', async () => {
      await client.disconnect();
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TABBELLUS_SYNC_DISCONNECT',
      });
    });

    it('unlockVault sends TABBELLUS_SYNC_UNLOCK_VAULT and returns boolean', async () => {
      const res = await client.unlockVault('my-passphrase');
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TABBELLUS_SYNC_UNLOCK_VAULT',
        passphrase: 'my-passphrase',
      });
      expect(res).toBe(true);
    });

    it('notifyMutation sends TABBELLUS_SYNC_MUTATION', async () => {
      await client.notifyMutation();
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TABBELLUS_SYNC_MUTATION',
      });
    });
  });

  describe('B6: Connect Flow with Interactive OAuth in Side Panel', () => {
    it('performs interactive getAuthToken(true) in side panel, then sends CONNECT with NO token', async () => {
      const authSpy = vi.spyOn(googleAuthClient, 'getAuthToken').mockResolvedValueOnce({
        success: true,
        data: 'secret-oauth-token-12345',
      });

      const res = await client.connect();

      expect(authSpy).toHaveBeenCalledWith(true);
      // CONNECT message must NOT contain the token
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TABBELLUS_SYNC_CONNECT',
      });
      const sentMessage = mockSendMessage.mock.calls.find(
        (c: any[]) => c[0].type === 'TABBELLUS_SYNC_CONNECT',
      )?.[0];
      expect(sentMessage.token).toBeUndefined();
      expect(sentMessage.data).toBeUndefined();
      expect(res.success).toBe(true);

      authSpy.mockRestore();
    });

    it('returns error if interactive auth in side panel fails without sending CONNECT message', async () => {
      const authSpy = vi.spyOn(googleAuthClient, 'getAuthToken').mockResolvedValueOnce({
        success: false,
        error: 'User declined consent prompt',
      });

      const res = await client.connect();

      expect(res.success).toBe(false);
      expect(res.error).toBe('User declined consent prompt');
      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TABBELLUS_SYNC_CONNECT' }),
      );

      authSpy.mockRestore();
    });
  });

  describe('B4: Error Rethrowing with code Property', () => {
    it('rethrows error carrying code property (e.g. SYNC_BUSY)', async () => {
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: {
          code: 'SYNC_BUSY',
          message: 'Sync is busy — please try again in a moment',
        },
      });

      await expect(client.syncNow()).rejects.toMatchObject({
        name: 'Error',
        code: 'SYNC_BUSY',
        message: 'Sync is busy — please try again in a moment',
      });
    });
  });

  describe('B5: Reactive Status Subscription via chrome.storage.onChanged', () => {
    it('subscribes to changes on tabbellus_sync_live_status in session storage', () => {
      const listener = vi.fn();
      const unsubscribe = client.subscribe(listener);

      expect(storageChangedListeners.length).toBe(1);

      const updatedStatus: SyncStatus = {
        state: 'error',
        isConnected: false,
        telemetry: { pendingMutations: 1, encrypted: false, lastError: 'Network down' },
      };

      // Trigger onChanged for session storage
      storageChangedListeners[0](
        {
          tabbellus_sync_live_status: {
            newValue: updatedStatus,
            oldValue: sampleLiveStatus,
          },
        },
        'session',
      );

      expect(listener).toHaveBeenCalledWith(updatedStatus);

      unsubscribe();
      expect(storageChangedListeners.length).toBe(0);
    });
  });
});
