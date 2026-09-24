/**
 * SyncEngine Unit Tests
 *
 * Tests:
 * - Status queries and reactive subscriptions
 * - connect() requesting interactive OAuth2 token and storing syncEnabled
 * - disconnect() revoking token and resetting status
 * - syncNow() full reconciliation, Dexie update, and Drive upload orchestration
 * - Auth failure (401) and offline network error handling
 * - Concurrent sync invocation prevention
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine } from '../syncEngine';
import { contractRegistry } from '@/core/contracts/registry';
import { googleAuthClient } from '../../api/googleAuthClient';
import { googleDriveClient } from '../../api/googleDriveClient';
import { db } from '@/lib/db';
import {
  WebCryptoEngine,
  sessionKeyStore,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../../crypto';
import type { VaultPayload } from '../../api/types';
import type { SyncVaultSnapshot } from '../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../api/googleAuthClient', () => ({
  googleAuthClient: {
    getAuthToken: vi.fn(),
    invalidateToken: vi.fn(),
    revokeToken: vi.fn(),
  },
}));

vi.mock('../../api/googleDriveClient', () => ({
  googleDriveClient: {
    findVaultFile: vi.fn(),
    downloadVaultFile: vi.fn(),
    uploadVaultFile: vi.fn(),
  },
}));

// Mock chrome.storage.local and chrome.storage.session
const mockStorage: Record<string, unknown> = {};
const mockSessionStorage: Record<string, unknown> = {};
const mockChrome = {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
    session: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockSessionStorage[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockSessionStorage, items);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        delete mockSessionStorage[key];
        return Promise.resolve();
      }),
    },
  },
};
vi.stubGlobal('chrome', mockChrome);

const mockedAuth = vi.mocked(googleAuthClient);
const mockedDrive = vi.mocked(googleDriveClient);

describe('SyncEngine', () => {
  let engine: SyncEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', {});
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    Object.keys(mockSessionStorage).forEach((k) => delete mockSessionStorage[k]);
    await sessionKeyStore.clearSession();
    await db.spaces.clear();
    await db.tabs.clear();
    await db.readLater.clear();

    engine = new SyncEngine();
  });

  // =========================================================================
  // getStatus & subscribe
  // =========================================================================

  describe('getStatus & subscribe', () => {
    it('returns initial status snapshot', async () => {
      const status = await engine.getStatus();

      expect(status.state).toBe('idle');
      expect(status.isConnected).toBe(false);
      expect(status.telemetry.pendingMutations).toBe(0);
      expect(status.telemetry.encrypted).toBe(false);
    });

    it('immediately dispatches current status to new subscribers', () => {
      const subscriber = vi.fn();
      const unsubscribe = engine.subscribe(subscriber);

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'idle', isConnected: false }),
      );

      unsubscribe();
    });
  });

  // =========================================================================
  // connect & disconnect
  // =========================================================================

  describe('connect', () => {
    it('requests interactive OAuth2 token and sets isConnected: true', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'oauth2-token-123',
      });

      const result = await engine.connect();

      expect(result).toEqual({ success: true });
      expect(mockedAuth.getAuthToken).toHaveBeenCalledWith(true);

      const status = await engine.getStatus();
      expect(status.isConnected).toBe(true);
      expect(status.state).toBe('idle');
      expect(mockStorage['tabbellus_sync_state']).toMatchObject({ syncEnabled: true });
    });

    it('handles auth rejection and sets state to error', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: false,
        error: 'User cancelled consent',
      });

      const result = await engine.connect();

      expect(result).toEqual({
        success: false,
        error: 'User cancelled consent',
      });

      const status = await engine.getStatus();
      expect(status.isConnected).toBe(false);
      expect(status.state).toBe('error');
      expect(status.telemetry.lastError).toBe('User cancelled consent');
    });
  });

  describe('disconnect', () => {
    it('revokes OAuth2 token and resets isConnected to false', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'token-to-revoke',
      });
      mockedAuth.revokeToken.mockResolvedValue({
        success: true,
        data: undefined,
      });

      await engine.disconnect();

      expect(mockedAuth.revokeToken).toHaveBeenCalledWith('token-to-revoke');
      const status = await engine.getStatus();
      expect(status.isConnected).toBe(false);
      expect(mockStorage['tabbellus_sync_state']).toMatchObject({ syncEnabled: false });
    });
  });

  // =========================================================================
  // syncNow
  // =========================================================================

  describe('syncNow', () => {
    it('executes full sync cycle, updates Dexie, and uploads merged snapshot', async () => {
      // 1. Auth succeeds silently
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      // 2. Existing remote file found in appDataFolder
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [
            {
              id: 'vault-file-001',
              name: 'tabbellus_vault.json',
              mimeType: 'application/json',
            },
          ],
        },
      });

      // 3. Download remote snapshot
      const remoteSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'remote-dev-1',
        spaces: [{ id: 1, name: 'Remote Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        etag: 'vault-etag-v1',
        data: remoteSnapshot as unknown as { schemaVersion: string; clientTimestamp: string; payload: string },
      });

      // 4. Upload returns updated file
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: {
          id: 'vault-file-001',
          name: 'tabbellus_vault.json',
          mimeType: 'application/json',
          etag: 'vault-etag-v2',
        },
      });

      // Local has a space
      await db.spaces.add({
        name: 'Local Space',
        createdAt: 2000,
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(true);
      expect(typeof result.timestamp).toBe('number');

      // Verify Dexie received the remote space
      const allSpaces = await db.spaces.toArray();
      expect(allSpaces).toHaveLength(2);

      // Verify Drive upload called with merged content and currentVaultEtag
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledWith(
        expect.stringContaining('Remote Space'),
        'vault-file-001',
        'tabbellus_vault.json',
        'vault-etag-v1',
      );

      // Verify state transitioned to synced
      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.isConnected).toBe(true);
      expect(typeof status.telemetry.lastSyncedAt).toBe('number');
    });

    it('handles silent auth token failure and updates state to error', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: false,
        error: 'Authentication expired',
        authExpired: true,
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication expired');

      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.telemetry.lastError).toBe('Authentication expired');
    });

    it('normalizes network offline errors during Drive queries', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'token',
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: false,
        error: 'Network offline or unreachable.',
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network offline or unreachable.');

      const status = await engine.getStatus();
      expect(status.state).toBe('offline');
    });

    it('aborts sync cycle and preserves remote vault when remote file exists but download fails', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [{ id: 'existing-vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' }] },
      });
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: false,
        error: 'Connection error: Failed to fetch',
      });

      await db.spaces.add({
        name: 'Local Only Space',
        createdAt: Date.now(),
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch');

      // CRITICAL: uploadVaultFile must NEVER have been called
      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();

      const status = await engine.getStatus();
      expect(status.state).toBe('offline');
    });

    it('handles HTTP 429 rate limit on remote downloadVaultFile without setting status to offline and activates cooldown', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [{ id: 'vault-file-id-429', name: 'tabbellus_vault.json', mimeType: 'application/json' }] },
      });
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: false,
        statusCode: 429,
        rateLimited: true,
        retryAfterSeconds: 45,
        error: 'Google Drive rate limit exceeded. Backing off.',
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Drive rate limit exceeded. Backing off.');
      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();

      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.state).not.toBe('offline');
      expect(status.telemetry.lastError).toContain('rate limit');

      // Subsequent sync call is blocked by rate-limit cooldown
      const cooldownResult = await engine.syncNow();
      expect(cooldownResult.success).toBe(false);
      expect(cooldownResult.error).toContain('rate limit cooldown active');
    });

    it('handles HTTP 429 rate limit without setting status to offline', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: false,
        statusCode: 429,
        rateLimited: true,
        retryAfterSeconds: 30,
        error: 'Google Drive rate limit exceeded. Backing off.',
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('rate limit exceeded');

      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.telemetry.lastError).toContain('rate limit');

      // Subsequent syncNow within cooldown window is rejected with cooldown notice
      const cooldownResult = await engine.syncNow();
      expect(cooldownResult.success).toBe(false);
      expect(cooldownResult.error).toContain('rate limit cooldown active');
    });

    it('aborts sync cycle when downloaded remote vault is corrupt or invalid', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [{ id: 'corrupt-vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' }] },
      });
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: {
          schemaVersion: '1.0.0',
          clientTimestamp: new Date().toISOString(),
          payload: 'not-valid-json{{{',
          isEncrypted: false,
        },
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Remote vault payload is corrupt or invalid');

      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();

      const status = await engine.getStatus();
      expect(status.state).toBe('error');
    });

    it('prevents concurrent overlapping sync cycles', async () => {
      mockedAuth.getAuthToken.mockImplementation(
        () => new Promise((res) => setTimeout(() => res({ success: true, data: 'token' }), 50)),
      );
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [] },
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'new-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      const firstSync = engine.syncNow();
      const secondSync = engine.syncNow();

      const [res1, res2] = await Promise.all([firstSync, secondSync]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('already in progress');
    });

    describe('Cross-Context Web Lock Mutex', () => {
      it('requests lock "tabbellus_sync_vault" with { ifAvailable: true } and runs to completion when available', async () => {
        const lockRequestSpy = vi.fn(
          async (name: string, _options: unknown, callback: (lock: unknown) => Promise<unknown>) => {
            return await callback({ name });
          },
        );

        vi.stubGlobal('navigator', {
          locks: {
            request: lockRequestSpy,
          },
        });

        mockedAuth.getAuthToken.mockResolvedValue({
          success: true,
          data: 'valid-token',
        });
        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: { files: [] },
        });
        mockedDrive.uploadVaultFile.mockResolvedValue({
          success: true,
          data: { id: 'vault-1', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        });

        const result = await engine.syncNow();

        expect(lockRequestSpy).toHaveBeenCalledWith(
          'tabbellus_sync_vault',
          { ifAvailable: true },
          expect.any(Function),
        );
        expect(result.success).toBe(true);

        const status = await engine.getStatus();
        expect(status.state).toBe('synced');
      });

      it('skips sync execution when navigator.locks.request yields null (simulating concurrent context)', async () => {
        const lockRequestSpy = vi.fn(
          async (_name: string, _options: unknown, callback: (lock: unknown) => Promise<unknown>) => {
            return await callback(null); // lock unavailable: held by another tab or worker
          },
        );

        vi.stubGlobal('navigator', {
          locks: {
            request: lockRequestSpy,
          },
        });

        // Insert dummy tab in Dexie to verify it is NOT mutated or deleted
        await db.spaces.add({ id: 1, name: 'Local Space', createdAt: 1000 });
        await db.tabs.add({ id: 10, spaceId: 1, url: 'https://local.com', order: 0 });

        const result = await engine.syncNow();

        expect(lockRequestSpy).toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toContain('already in progress');

        // Google Drive client must not have been called
        expect(mockedDrive.findVaultFile).not.toHaveBeenCalled();
        expect(mockedDrive.downloadVaultFile).not.toHaveBeenCalled();
        expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();

        // Dexie database state must remain completely untouched
        const tabs = await db.tabs.toArray();
        expect(tabs).toHaveLength(1);
        expect(tabs[0].url).toBe('https://local.com');

        // Sync status remains idle without error mutation
        const status = await engine.getStatus();
        expect(status.state).toBe('idle');
      });

      it('falls back to in-memory mutex when navigator.locks is undefined to prevent re-entrant calls', async () => {
        vi.stubGlobal('navigator', {}); // navigator.locks is undefined

        mockedAuth.getAuthToken.mockImplementation(
          () => new Promise((res) => setTimeout(() => res({ success: true, data: 'token' }), 50)),
        );
        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: { files: [] },
        });
        mockedDrive.uploadVaultFile.mockResolvedValue({
          success: true,
          data: { id: 'new-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        });

        const firstSync = engine.syncNow();
        const secondSync = engine.syncNow();

        const [res1, res2] = await Promise.all([firstSync, secondSync]);

        expect(res1.success).toBe(true);
        expect(res2.success).toBe(false);
        expect(res2.error).toContain('already in progress');
      });
    });

    describe('Optimistic Concurrency Control (OCC) & Conflict Retries', () => {
      it('handles concurrent overwrite collision (HTTP 412), backs off with jitter, re-downloads fresh ETag, re-merges, and succeeds on retry', async () => {
        mockedAuth.getAuthToken.mockResolvedValue({
          success: true,
          data: 'valid-token',
        });

        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: {
            files: [
              {
                id: 'vault-occ-file-01',
                name: 'tabbellus_vault.json',
                mimeType: 'application/json',
                etag: 'etag-v1',
              },
            ],
          },
        });

        // 1st download returns initial remote state with etag-v1
        const initialRemoteSnapshot = {
          version: 1,
          clientTimestamp: 1000,
          deviceId: 'remote-device-1',
          spaces: [{ id: 1, name: 'Remote Space 1', createdAt: 1000 }],
          tabs: [],
          readLater: [],
        };

        // 2nd download (on conflict retry) returns updated remote state with etag-v2
        const updatedRemoteSnapshot = {
          version: 1,
          clientTimestamp: 2500,
          deviceId: 'remote-device-2',
          spaces: [
            { id: 1, name: 'Remote Space 1', createdAt: 1000 },
            { id: 2, name: 'Concurrently Added Remote Space', createdAt: 2500 },
          ],
          tabs: [],
          readLater: [],
        };

        mockedDrive.downloadVaultFile
          .mockResolvedValueOnce({
            success: true,
            etag: 'etag-v1',
            data: initialRemoteSnapshot as unknown as VaultPayload,
          })
          .mockResolvedValueOnce({
            success: true,
            etag: 'etag-v2',
            data: updatedRemoteSnapshot as unknown as VaultPayload,
          });

        // 1st upload fails with HTTP 412 conflict; 2nd upload succeeds with etag-v3
        mockedDrive.uploadVaultFile
          .mockResolvedValueOnce({
            success: false,
            error: 'Precondition Failed: Remote file has been modified concurrently.',
            statusCode: 412,
            conflict: true,
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              id: 'vault-occ-file-01',
              name: 'tabbellus_vault.json',
              mimeType: 'application/json',
              etag: 'etag-v3',
            },
          });

        // Local state has a distinct space
        await db.spaces.add({
          name: 'Local Unique Space',
          createdAt: 2000,
        });

        const result = await engine.syncNow();

        expect(result.success).toBe(true);
        expect(mockedDrive.downloadVaultFile).toHaveBeenCalledTimes(2);
        expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(2);

        // 1st upload used etag-v1
        expect(mockedDrive.uploadVaultFile.mock.calls[0][3]).toBe('etag-v1');
        // 2nd upload used fresh etag-v2 from re-download
        expect(mockedDrive.uploadVaultFile.mock.calls[1][3]).toBe('etag-v2');

        // Merged state in Dexie contains local space, initial remote space, and concurrently added space
        const localSpaces = await db.spaces.toArray();
        expect(localSpaces.some((s) => s.name === 'Local Unique Space')).toBe(true);
        expect(localSpaces.some((s) => s.name === 'Remote Space 1')).toBe(true);
        expect(localSpaces.some((s) => s.name === 'Concurrently Added Remote Space')).toBe(true);

        const status = await engine.getStatus();
        expect(status.state).toBe('synced');
        expect(status.telemetry.lastError).toBeUndefined();
      });

      it('exhausts MAX_CONFLICT_RETRIES (3 retries) and fails open safely without corrupting local Dexie state', async () => {
        mockedAuth.getAuthToken.mockResolvedValue({
          success: true,
          data: 'valid-token',
        });

        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: {
            files: [
              {
                id: 'vault-conflict-forever',
                name: 'tabbellus_vault.json',
                mimeType: 'application/json',
                etag: 'etag-start',
              },
            ],
          },
        });

        const remoteSnapshot = {
          version: 1,
          clientTimestamp: 1000,
          deviceId: 'remote-device',
          spaces: [{ id: 1, name: 'Remote Baseline Space', createdAt: 1000 }],
          tabs: [],
          readLater: [],
        };

        mockedDrive.downloadVaultFile.mockResolvedValue({
          success: true,
          etag: 'etag-repeat',
          data: remoteSnapshot as unknown as VaultPayload,
        });

        // uploadVaultFile constantly conflicts (412)
        mockedDrive.uploadVaultFile.mockResolvedValue({
          success: false,
          error: 'Precondition Failed: Remote file has been modified concurrently.',
          statusCode: 412,
          conflict: true,
        });

        // Set up critical local data
        await db.spaces.add({ id: 10, name: 'Critical Space Keep Safe', createdAt: 3000 });
        await db.tabs.add({ id: 100, spaceId: 10, url: 'https://vital-tab.com', order: 0 });

        const result = await engine.syncNow();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sync conflict');
        expect(result.error).toContain('Exceeded maximum retry attempts');

        // Total calls: 1 initial attempt + 3 retries = 4 uploadVaultFile invocations
        expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(4);

        // Verify local Dexie state was NOT destroyed or corrupted
        const allSpaces = await db.spaces.toArray();
        expect(allSpaces.find((s) => s.name === 'Critical Space Keep Safe')).toBeDefined();
        const allTabs = await db.tabs.toArray();
        expect(allTabs.find((t) => t.url === 'https://vital-tab.com')).toBeDefined();

        const status = await engine.getStatus();
        expect(status.state).toBe('error');
        expect(status.telemetry.lastError).toContain('Exceeded maximum retry attempts');
      });
    });
  });

  // =========================================================================
  // End-to-End Encryption (E2EE) Sync Integration
  // =========================================================================

  describe('End-to-End Encryption (E2EE) Sync Integration', () => {
    it('pauses sync and enters "locked" state when downloading encrypted remote vault without session key', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      const saltBytes = WebCryptoEngine.generateSalt();
      const key = await WebCryptoEngine.deriveKeyFromPassphrase('vault-pass-1', saltBytes);
      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'remote-dev-encrypted',
        spaces: [{ id: 1, name: 'Encrypted Remote Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const envelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify(remoteSnapshot),
        key,
        saltBytes,
      );

      const remoteVaultPayload: VaultPayload = {
        schemaVersion: '2.0.0-e2ee',
        clientTimestamp: new Date().toISOString(),
        payload: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        isEncrypted: true,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-enc-01', name: 'tabbellus_vault.json', mimeType: 'application/json' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: remoteVaultPayload,
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');

      const status = await engine.getStatus();
      expect(status.state).toBe('locked');
      expect(status.telemetry.encrypted).toBe(true);

      // Verify local database was not mutated
      expect(await db.spaces.count()).toBe(0);
    });

    it('unlocks session and completes reconciliation when valid passphrase is provided to unlockVault', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      const passphrase = 'correct-vault-password';
      const saltBytes = WebCryptoEngine.generateSalt();
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);
      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'remote-dev-2',
        spaces: [{ id: 10, name: 'Decrypted Remote Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const envelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify(remoteSnapshot),
        key,
        saltBytes,
      );

      const remoteVaultPayload: VaultPayload = {
        schemaVersion: '2.0.0-e2ee',
        clientTimestamp: new Date().toISOString(),
        payload: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        isEncrypted: true,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-enc-02', name: 'tabbellus_vault.json', mimeType: 'application/json' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: remoteVaultPayload,
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-enc-02', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      // First sync discovers remote is encrypted and enters locked state
      await engine.syncNow();
      expect((await engine.getStatus()).state).toBe('locked');

      // Unlock with valid passphrase
      const unlockSuccess = await engine.unlockVault(passphrase);
      expect(unlockSuccess).toBe(true);

      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.telemetry.encrypted).toBe(true);

      // Verify local Dexie space was imported
      const spaces = await db.spaces.toArray();
      expect(spaces.some((s) => s.name === 'Decrypted Remote Space')).toBe(true);
    });

    it('returns false on unlockVault with incorrect passphrase and leaves local Dexie intact', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      const correctPassphrase = 'real-password';
      const saltBytes = WebCryptoEngine.generateSalt();
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(correctPassphrase, saltBytes);
      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'remote-dev-3',
        spaces: [{ id: 11, name: 'Untouched Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const envelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify(remoteSnapshot),
        key,
        saltBytes,
      );

      const remoteVaultPayload: VaultPayload = {
        schemaVersion: '2.0.0-e2ee',
        clientTimestamp: new Date().toISOString(),
        payload: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        isEncrypted: true,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-enc-03', name: 'tabbellus_vault.json', mimeType: 'application/json' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: remoteVaultPayload,
      });

      await engine.syncNow();
      expect((await engine.getStatus()).state).toBe('locked');

      // Attempt unlock with wrong passphrase
      const unlockResult = await engine.unlockVault('wrong-passphrase');
      expect(unlockResult).toBe(false);

      // Verify Dexie remains clean
      expect(await db.spaces.count()).toBe(0);
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
    });

    it('converts unencrypted local state into encrypted upload payload with iv and salt via setupEncryption', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [] },
      });

      await db.spaces.add({
        name: 'Sensitive Workspace',
        createdAt: 1000,
      });

      let uploadedPayloadContent = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadedPayloadContent = content;
        return Promise.resolve({
          success: true,
          data: { id: 'created-enc-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        });
      });

      const passphrase = 'brand-new-vault-pass';
      await engine.setupEncryption(passphrase);

      expect(uploadedPayloadContent).toBeTruthy();
      const parsedVault = JSON.parse(uploadedPayloadContent) as VaultPayload;
      expect(parsedVault.schemaVersion).toBe('2.0.0-e2ee');
      expect(parsedVault.isEncrypted).toBe(true);
      expect(parsedVault.iv).toBeDefined();
      expect(parsedVault.salt).toBeDefined();

      // Verify payload can be decrypted with the passphrase
      const salt = base64ToUint8Array(parsedVault.salt!);
      const derivedKey = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, salt);
      const decryptedString = await WebCryptoEngine.decryptPayload(
        {
          version: 1,
          salt: parsedVault.salt!,
          iv: parsedVault.iv!,
          ciphertext: parsedVault.payload,
          iterations: 600_000,
        },
        derivedKey,
      );

      const decryptedSnapshot = JSON.parse(decryptedString) as SyncVaultSnapshot;
      expect(decryptedSnapshot.spaces.some((s) => s.name === 'Sensitive Workspace')).toBe(true);

      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.telemetry.encrypted).toBe(true);
    });

    it('downloads and reconciles legacy unencrypted VaultPayload without errors', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      const legacySnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'legacy-device',
        spaces: [{ id: 50, name: 'Legacy Unencrypted Space', createdAt: 2000 }],
        tabs: [],
        readLater: [],
      };

      const legacyPayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(legacySnapshot),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'legacy-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: legacyPayload,
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'legacy-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      const result = await engine.syncNow();
      expect(result.success).toBe(true);

      const spaces = await db.spaces.toArray();
      expect(spaces.some((s) => s.name === 'Legacy Unencrypted Space')).toBe(true);
      expect((await engine.getStatus()).telemetry.encrypted).toBe(false);
    });

    it('wipes active session on lockVault() and prevents background sync flushes until unlocked', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [] },
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'test-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      await engine.setupEncryption('session-lock-test-pass');
      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      expect((await engine.getStatus()).state).toBe('synced');

      // Lock the vault
      await engine.lockVault();

      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      expect((await engine.getStatus()).state).toBe('locked');

      // Attempting background syncNow should fail fast without uploading
      mockedDrive.uploadVaultFile.mockClear();
      const syncResult = await engine.syncNow();

      expect(syncResult.success).toBe(false);
      expect(syncResult.error).toContain('locked');
      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
    });

    it('disableEncryption downloads, decrypts, and merges remote data into local Dexie before uploading unencrypted snapshot', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      const passphrase = 'disable-e2ee-passphrase';
      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      // Populate local Dexie with Space A
      await db.spaces.add({
        name: 'Local Only Space',
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Prepare remote encrypted vault with Space B
      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'remote-device-x',
        spaces: [{ id: 99, name: 'Remote Encrypted Space', createdAt: 2000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };

      const envelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify(remoteSnapshot),
        key,
        saltBytes,
      );

      const remoteEncryptedPayload: VaultPayload = {
        schemaVersion: '2.0.0-e2ee',
        clientTimestamp: new Date().toISOString(),
        payload: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        isEncrypted: true,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [
            {
              id: 'vault-file-123',
              name: 'tabbellus_vault.json',
              modifiedTime: '2026-09-03T10:00:00Z',
              mimeType: 'application/json',
              etag: 'remote-etag-123',
            },
          ],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: remoteEncryptedPayload,
        etag: 'remote-etag-123',
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-file-123', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      // Connect and save session key
      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
        },
      });

      mockedDrive.uploadVaultFile.mockClear();
      mockedDrive.downloadVaultFile.mockClear();

      // Execute disableEncryption
      await engine.disableEncryption();

      // Verify remote vault was downloaded and decrypted
      expect(mockedDrive.downloadVaultFile).toHaveBeenCalledWith('vault-file-123');

      // Verify that items present only in remote encrypted vault (Space 99) and local (Local Only Space) are in local Dexie
      const localSpaces = await db.spaces.toArray();
      const localNames = localSpaces.map((s) => s.name);
      expect(localNames).toContain('Local Only Space');
      expect(localNames).toContain('Remote Encrypted Space');

      // Verify session key was purged and storage state is unencrypted
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.telemetry.encrypted).toBe(false);

      // Verify unencrypted upload took place and contains both spaces
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      const [uploadedRaw, fileId, fileName, ifMatchEtag] = mockedDrive.uploadVaultFile.mock.calls[0];
      expect(fileId).toBe('vault-file-123');
      expect(fileName).toBe('tabbellus_vault.json');
      expect(ifMatchEtag).toBe('remote-etag-123');

      const uploadedContent = JSON.parse(uploadedRaw) as VaultPayload;
      expect(uploadedContent.schemaVersion).toBe('1.0.0');
      expect(uploadedContent.isEncrypted).toBe(false);
      expect(uploadedContent.iv).toBeUndefined();
      expect(uploadedContent.salt).toBeUndefined();

      const mergedSnapshot = JSON.parse(uploadedContent.payload) as SyncVaultSnapshot;
      const uploadedNames = mergedSnapshot.spaces.map((s) => s.name);
      expect(uploadedNames).toContain('Local Only Space');
      expect(uploadedNames).toContain('Remote Encrypted Space');
    });

    it('disableEncryption throws descriptive error if called while vault is locked', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      await engine.connect();
      await sessionKeyStore.clearSession();
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
        },
      });

      mockedDrive.uploadVaultFile.mockClear();

      await expect(engine.disableEncryption()).rejects.toThrow(
        'Cannot disable encryption while vault is locked. Please unlock first.',
      );

      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
    });

    it('peer device auto-downgrades to unencrypted when discovering remote vault has isEncrypted === false', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      const passphrase = 'peer-device-pass';
      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      // Local Dexie has Device B's space
      await db.spaces.add({
        name: 'Device B Space',
        createdAt: 1500,
        updatedAt: 1500,
      });

      // Peer device has active encryption session
      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
        },
      });

      // Remote vault was downgraded to unencrypted by Device A
      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'device-a-id',
        spaces: [{ id: 50, name: 'Device A Plain Space', createdAt: 2000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };

      const unencryptedRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(remoteSnapshot),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [
            {
              id: 'remote-unencrypted-vault',
              name: 'tabbellus_vault.json',
              mimeType: 'application/json',
              etag: 'unenc-etag-1',
            },
          ],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
        etag: 'unenc-etag-1',
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'remote-unencrypted-vault', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      mockedDrive.uploadVaultFile.mockClear();

      // Trigger sync on Device B
      const result = await engine.syncNow();
      expect(result.success).toBe(true);

      // Verify Device B cleared its session keys and updated storage state to unencrypted
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.telemetry.encrypted).toBe(false);

      // Verify local Dexie has both spaces
      const localSpaces = await db.spaces.toArray();
      const localNames = localSpaces.map((s) => s.name);
      expect(localNames).toContain('Device B Space');
      expect(localNames).toContain('Device A Plain Space');

      // Verify that upload is unencrypted and NOT re-encrypted
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      const uploadedContent = JSON.parse(mockedDrive.uploadVaultFile.mock.calls[0][0]) as VaultPayload;
      expect(uploadedContent.schemaVersion).toBe('1.0.0');
      expect(uploadedContent.isEncrypted).toBe(false);
      expect(uploadedContent.iv).toBeUndefined();
      expect(uploadedContent.salt).toBeUndefined();

      // Subsequent sync also stays unencrypted
      mockedDrive.uploadVaultFile.mockClear();
      await engine.syncNow({ forceFull: true });
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      const secondUpload = JSON.parse(mockedDrive.uploadVaultFile.mock.calls[0][0]) as VaultPayload;
      expect(secondUpload.isEncrypted).toBe(false);
      expect(secondUpload.schemaVersion).toBe('1.0.0');
    });

    it('resetCloudVault() overwrites locked remote vault with unencrypted snapshot and returns to synced state', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [{ id: 'remote-locked-vault-id', name: 'tabbellus_vault.json', modifiedTime: '2026-09-03T10:00:00Z', mimeType: 'application/json' }] },
      });
      // Remote payload is encrypted with unknown key
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: {
          schemaVersion: '2.0.0-e2ee',
          clientTimestamp: '2026-09-03T09:00:00Z',
          payload: 'some-ciphertext-we-cannot-decrypt',
          iv: 'fake-iv',
          salt: 'fake-salt',
          isEncrypted: true,
        },
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'remote-locked-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      // Local state is currently locked
      await engine.connect();
      await sessionKeyStore.clearSession();
      mockedDrive.uploadVaultFile.mockClear();

      // Reset cloud vault (user lost passphrase)
      await engine.resetCloudVault();

      // Verify keys cleared and state is synced and unencrypted
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.telemetry.encrypted).toBe(false);

      // Verify upload was forced and uploaded unencrypted snapshot
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      const uploadedContent = JSON.parse(mockedDrive.uploadVaultFile.mock.calls[0][0]);
      expect(uploadedContent.schemaVersion).toBe('1.0.0');
      expect(uploadedContent.isEncrypted).toBe(false);
      expect(uploadedContent.iv).toBeUndefined();
      expect(uploadedContent.salt).toBeUndefined();
    });
  });

  // =========================================================================
  // Debounced Auto-Sync on Local Mutations
  // =========================================================================

  describe('Debounced Auto-Sync', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('triggers debounced syncNow({ silent: true }) 3000ms after a local mutation', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [] },
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'auto-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      await engine.connect();
      const syncNowSpy = vi.spyOn(engine, 'syncNow');

      // Dispatch local mutation
      contractRegistry.notifyLocalMutation();

      // Before timer expires, syncNow should NOT have been called
      vi.advanceTimersByTime(2999);
      expect(syncNowSpy).not.toHaveBeenCalled();

      // Advance past debounce threshold
      await vi.advanceTimersByTimeAsync(1);
      expect(syncNowSpy).toHaveBeenCalledTimes(1);
      expect(syncNowSpy).toHaveBeenCalledWith({ silent: true });
    });

    it('resets debounce timer on rapid consecutive mutations and syncs exactly once', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [] },
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'auto-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      await engine.connect();
      const syncNowSpy = vi.spyOn(engine, 'syncNow');

      // 3 rapid consecutive mutations
      contractRegistry.notifyLocalMutation();
      vi.advanceTimersByTime(1000);
      contractRegistry.notifyLocalMutation();
      vi.advanceTimersByTime(1500);
      contractRegistry.notifyLocalMutation();

      // 2500ms since last mutation - should not fire yet
      vi.advanceTimersByTime(2500);
      expect(syncNowSpy).not.toHaveBeenCalled();

      // Reach 3000ms from the third mutation
      await vi.advanceTimersByTimeAsync(500);
      expect(syncNowSpy).toHaveBeenCalledTimes(1);
      expect(syncNowSpy).toHaveBeenCalledWith({ silent: true });
    });

    it('ignores local mutations when disconnected', async () => {
      const syncNowSpy = vi.spyOn(engine, 'syncNow');

      expect((await engine.getStatus()).isConnected).toBe(false);

      contractRegistry.notifyLocalMutation();
      await vi.advanceTimersByTimeAsync(4000);

      expect(syncNowSpy).not.toHaveBeenCalled();
    });

    it('ignores local mutations when vault is locked', async () => {
      await engine.connect();
      await engine.lockVault();

      expect((await engine.getStatus()).state).toBe('locked');

      const syncNowSpy = vi.spyOn(engine, 'syncNow');

      contractRegistry.notifyLocalMutation();
      await vi.advanceTimersByTimeAsync(4000);

      expect(syncNowSpy).not.toHaveBeenCalled();
    });

    it('cancels pending debounce timer when disconnecting or locking vault', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      await engine.connect();
      const syncNowSpy = vi.spyOn(engine, 'syncNow');

      // Test 1: Disconnect cancels timer
      contractRegistry.notifyLocalMutation();
      vi.advanceTimersByTime(1500);

      await engine.disconnect();

      await vi.advanceTimersByTimeAsync(2000);
      expect(syncNowSpy).not.toHaveBeenCalled();

      // Reconnect
      await engine.connect();

      // Test 2: Lock vault cancels timer
      contractRegistry.notifyLocalMutation();
      vi.advanceTimersByTime(1500);

      await engine.lockVault();

      await vi.advanceTimersByTimeAsync(2000);
      expect(syncNowSpy).not.toHaveBeenCalled();
    });
  });

  describe('Schema Forward-Compatibility & Version Guarding', () => {
    it('aborts sync, does not mutate local Dexie, and sets UPDATE_REQUIRED error when remote has future major version', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [
            {
              id: 'vault-file-001',
              name: 'tabbellus_vault.json',
              mimeType: 'application/json',
              etag: 'vault-etag-v1',
            },
          ],
        },
      });

      const remoteSnapshot = {
        version: 2,
        schemaVersion: '2.0.0',
        clientTimestamp: 3000,
        deviceId: 'future-device',
        spaces: [{ id: 99, name: 'Future Space', createdAt: 3000 }],
        tabs: [],
        readLater: [],
      };
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        etag: 'vault-etag-v1',
        data: remoteSnapshot as any,
      });

      await db.spaces.add({
        name: 'Local Space',
        createdAt: 1000,
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(false);
      expect(result.error).toBe('UPDATE_REQUIRED');

      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.telemetry.lastError).toBe(
        'Sync paused: Cloud vault was updated by a newer version of TabBellus. Please update your extension to resume syncing.',
      );

      // Verify local Dexie was NOT mutated
      const spaces = await db.spaces.toArray();
      expect(spaces).toHaveLength(1);
      expect(spaces[0].name).toBe('Local Space');

      // Verify no upload attempted
      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
    });

    it('successfully reconciles and preserves newer minor schemaVersion on upload', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [
            {
              id: 'vault-file-001',
              name: 'tabbellus_vault.json',
              mimeType: 'application/json',
              etag: 'vault-etag-v1',
            },
          ],
        },
      });

      const remoteSnapshot = {
        version: 1,
        schemaVersion: '1.5.0',
        clientTimestamp: 1000,
        deviceId: 'remote-device',
        spaces: [{ id: 10, name: 'Remote Space', createdAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        etag: 'vault-etag-v1',
        data: remoteSnapshot as any,
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: {
          id: 'vault-file-001',
          name: 'tabbellus_vault.json',
          mimeType: 'application/json',
          etag: 'vault-etag-v2',
        },
      });

      await db.spaces.add({
        name: 'Local Space',
        createdAt: 2000,
      });

      const result = await engine.syncNow();

      expect(result.success).toBe(true);

      // Verify Dexie received the remote space
      const allSpaces = await db.spaces.toArray();
      expect(allSpaces).toHaveLength(2);

      // Verify upload was called with preserved schemaVersion: '1.5.0' on both envelope and inner snapshot
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalled();
      const uploadedVault = JSON.parse(mockedDrive.uploadVaultFile.mock.calls[0][0]);
      expect(uploadedVault.schemaVersion).toBe('1.5.0');
      const innerSnapshot = JSON.parse(uploadedVault.payload);
      expect(innerSnapshot.schemaVersion).toBe('1.5.0');
    });
  });
});

