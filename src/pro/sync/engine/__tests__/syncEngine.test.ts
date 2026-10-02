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
import { SyncEngine, SyncBusyError, MAX_SYNC_LOCK_WAIT_MS } from '../syncEngine';
import { SyncScheduler } from '../syncScheduler';
import { resolveVaultFiles } from '../vaultResolver';
import { contractRegistry } from '@/core/contracts/registry';
import { googleAuthClient } from '../../api/googleAuthClient';
import { googleDriveClient } from '../../api/googleDriveClient';
import { db, type Space } from '@/lib/db';
import {
  WebCryptoEngine,
  sessionKeyStore,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../../crypto';
import type { VaultPayload } from '../../api/types';
import type { SyncVaultSnapshot, SyncStorageState, SyncedSettings } from '../types';
import { useAppStore } from '@/store/appStore';

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
    deleteVaultFile: vi.fn(),
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
    mockedDrive.deleteVaultFile.mockResolvedValue({ success: true, data: undefined });
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
              version: '1',
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
        '1', // Drive metadata version from files.list; the download's HTTP ETag is ignored
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
      it('when upload returns conflict: true, the engine backs off, re-downloads the updated remote snapshot, re-merges, and successfully uploads on retry', async () => {
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
                version: '1',
              },
            ],
          },
        });

        // 1st download returns initial remote state with version '1'
        const initialRemoteSnapshot = {
          version: 1,
          clientTimestamp: 1000,
          deviceId: 'remote-device-1',
          spaces: [{ id: 1, name: 'Remote Space 1', createdAt: 1000 }],
          tabs: [],
          readLater: [],
        };

        // 2nd download (on conflict retry) returns updated remote state with version '2'
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

        // Media downloads carry no Drive version (the body is the vault file itself)
        mockedDrive.downloadVaultFile
          .mockResolvedValueOnce({
            success: true,
            data: initialRemoteSnapshot as unknown as VaultPayload,
          })
          .mockResolvedValueOnce({
            success: true,
            data: updatedRemoteSnapshot as unknown as VaultPayload,
          });

        // 1st upload fails with version conflict; 2nd upload succeeds with version '3'
        mockedDrive.uploadVaultFile
          .mockResolvedValueOnce({
            success: false,
            error: 'Conflict: Remote file version mismatch (expected: 1, remote: 2).',
            conflict: true,
            version: '2',
          })
          .mockResolvedValueOnce({
            success: true,
            data: {
              id: 'vault-occ-file-01',
              name: 'tabbellus_vault.json',
              mimeType: 'application/json',
              version: '3',
            },
            version: '3',
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

        // 1st upload used initial version '1'
        expect(mockedDrive.uploadVaultFile.mock.calls[0][3]).toBe('1');
        // 2nd upload used version '2' observed by the pre-flight check (read before re-download)
        expect(mockedDrive.uploadVaultFile.mock.calls[1][3]).toBe('2');

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
                version: 'version-start',
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
          version: 'version-repeat',
          data: remoteSnapshot as unknown as VaultPayload,
        });

        // uploadVaultFile constantly conflicts
        mockedDrive.uploadVaultFile.mockResolvedValue({
          success: false,
          error: 'Conflict: Remote file version mismatch.',
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

      it('uses the Drive metadata version as baseline even when the vault body carries its own `version` field', async () => {
        mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: {
            files: [
              { id: 'vault-bare-snapshot', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '57' },
            ],
          },
        });

        // Bare (unwrapped) snapshot vault: its schema `version: 1` must never be used as the Drive version
        mockedDrive.downloadVaultFile.mockResolvedValue({
          success: true,
          data: {
            version: 1,
            clientTimestamp: 1000,
            deviceId: 'remote-device',
            spaces: [{ id: 1, name: 'Remote Space', createdAt: 1000 }],
            tabs: [],
            readLater: [],
          } as unknown as VaultPayload,
        });

        mockedDrive.uploadVaultFile.mockResolvedValue({
          success: true,
          data: { id: 'vault-bare-snapshot', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '58' },
        });

        await db.spaces.add({ name: 'Local Space', createdAt: 2000 });

        const result = await engine.syncNow();

        expect(result.success).toBe(true);
        expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
        expect(mockedDrive.uploadVaultFile.mock.calls[0][3]).toBe('57');
      });

      it('resetCloudVault uses the fresh listing version, not a baseline left over from an earlier cycle', async () => {
        mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

        const remoteSnapshot = {
          version: 1,
          clientTimestamp: 1000,
          deviceId: 'remote-device',
          spaces: [{ id: 1, name: 'Remote Space', createdAt: 1000 }],
          tabs: [],
          readLater: [],
        };
        mockedDrive.downloadVaultFile.mockResolvedValue({
          success: true,
          data: remoteSnapshot as unknown as VaultPayload,
        });
        mockedDrive.uploadVaultFile.mockResolvedValue({
          success: true,
          data: { id: 'vault-reset', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        });

        // 1st cycle observes version '5'
        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: { files: [{ id: 'vault-reset', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '5' }] },
        });
        await db.spaces.add({ name: 'Local Space', createdAt: 2000 });
        await engine.syncNow();

        // Another device writes; the vault is now at version '9'
        mockedDrive.findVaultFile.mockResolvedValue({
          success: true,
          data: { files: [{ id: 'vault-reset', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '9' }] },
        });
        mockedDrive.uploadVaultFile.mockClear();
        mockedDrive.downloadVaultFile.mockClear();

        await engine.resetCloudVault();

        // Reset skips the download, but its baseline is the fresh '9', not the stale '5'
        expect(mockedDrive.downloadVaultFile).not.toHaveBeenCalled();
        expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
        expect(mockedDrive.uploadVaultFile.mock.calls[0][3]).toBe('9');
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
              version: '42',
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
      const [uploadedRaw, fileId, fileName, expectedVersion] = mockedDrive.uploadVaultFile.mock.calls[0];
      expect(fileId).toBe('vault-file-123');
      expect(fileName).toBe('tabbellus_vault.json');
      // Baseline comes from Drive metadata (files.list `version`), never from an HTTP ETag
      expect(expectedVersion).toBe('42');

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
    let scheduler: SyncScheduler;

    beforeEach(async () => {
      vi.useFakeTimers();
      scheduler = new SyncScheduler({
        syncEngine: engine,
        licensingEngine: {
          getEntitlement: vi.fn().mockResolvedValue({ isPro: true, tier: 'pro' }),
        } as any,
      });
      await scheduler.init();
    });

    afterEach(() => {
      scheduler.dispose();
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
      vi.advanceTimersByTime(500);
      await vi.waitFor(() => expect(syncNowSpy).toHaveBeenCalledTimes(1));
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

  // =========================================================================
  // Critical E2EE Upgrade with Existing Unencrypted Cloud Vault (T1-T5)
  // =========================================================================

  describe('Critical E2EE Upgrade with Existing Unencrypted Cloud Vault', () => {
    const passphrase = 'test-upgrade-passphrase';

    it('T1: Existing unencrypted remote vault + setupEncryption → uploaded payload has isEncrypted=true, iv, salt, and decrypts with passphrase; storage isEncrypted=true, flag cleared', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        schemaVersion: '1.0.0',
        clientTimestamp: 1000,
        deviceId: 'device-remote',
        spaces: [{ id: 10, name: 'Remote Unencrypted Space', createdAt: 1000, updatedAt: 1000 }],
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
          files: [{ id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      let uploadedPayloadContent = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadedPayloadContent = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
        });
      });

      await engine.connect();
      await engine.setupEncryption(passphrase);

      expect(uploadedPayloadContent).toBeTruthy();
      const parsedVault = JSON.parse(uploadedPayloadContent) as VaultPayload;
      expect(parsedVault.isEncrypted).toBe(true);
      expect(parsedVault.iv).toBeDefined();
      expect(parsedVault.salt).toBeDefined();

      // Decrypt payload with passphrase
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
      expect(decryptedSnapshot.spaces.some((s) => s.name === 'Remote Unencrypted Space')).toBe(true);

      const storage = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storage.isEncrypted).toBe(true);
      expect(storage.pendingEncryptionUpgrade).toBeUndefined();
    });

    it('T2: Same as T1, but first upload returns conflict and re-download is still plaintext → final upload is encrypted', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        schemaVersion: '1.0.0',
        clientTimestamp: 1000,
        deviceId: 'device-remote',
        spaces: [{ id: 10, name: 'Remote Unencrypted Space', createdAt: 1000, updatedAt: 1000 }],
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
          files: [{ id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      // downloadVaultFile returns unencrypted payload on both initial download and conflict retry download
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      let uploadAttempts = 0;
      let finalUploadedPayload = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          return Promise.resolve({
            success: false,
            conflict: true,
            version: '2',
            error: 'Conflict: Remote file version mismatch',
          });
        }
        finalUploadedPayload = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '3' },
        });
      });

      await engine.connect();
      await engine.setupEncryption(passphrase);

      expect(uploadAttempts).toBe(2);
      expect(finalUploadedPayload).toBeTruthy();
      const parsedVault = JSON.parse(finalUploadedPayload) as VaultPayload;
      expect(parsedVault.isEncrypted).toBe(true);
      expect(parsedVault.iv).toBeDefined();
      expect(parsedVault.salt).toBeDefined();

      const storage = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storage.isEncrypted).toBe(true);
      expect(storage.pendingEncryptionUpgrade).toBeUndefined();
    });

    it('T3: Upload fails during setupEncryption → setupEncryption rejects; flag and isEncrypted remain true; subsequent successful syncNow uploads encrypted and clears flag', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      const remoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        schemaVersion: '1.0.0',
        clientTimestamp: 1000,
        deviceId: 'device-remote',
        spaces: [{ id: 10, name: 'Remote Unencrypted Space', createdAt: 1000, updatedAt: 1000 }],
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
          files: [{ id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      // First upload fails with network error
      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: false,
        error: 'Network connection dropped',
      });

      await engine.connect();

      await expect(engine.setupEncryption(passphrase)).rejects.toThrow(
        /Network connection dropped|Failed to encrypt/,
      );

      // Flag, isEncrypted, and vaultSalt remain set (intent preserved)
      const storageAfterFail = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageAfterFail.isEncrypted).toBe(true);
      expect(storageAfterFail.pendingEncryptionUpgrade).toBe(true);
      expect(storageAfterFail.vaultSalt).toBeDefined();

      // Now network is restored and upload succeeds
      let subsequentUpload = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        subsequentUpload = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
        });
      });

      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(true);

      expect(subsequentUpload).toBeTruthy();
      const parsed = JSON.parse(subsequentUpload) as VaultPayload;
      expect(parsed.isEncrypted).toBe(true);
      expect(parsed.iv).toBeDefined();
      expect(parsed.salt).toBeDefined();

      const storageAfterSuccess = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageAfterSuccess.isEncrypted).toBe(true);
      expect(storageAfterSuccess.pendingEncryptionUpgrade).toBeUndefined();
    });

    it('T4: Regression: local encrypted, flag NOT set, remote plaintext → auto-downgrade still occurs (existing behavior preserved)', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
          pendingEncryptionUpgrade: undefined,
        },
      });

      const unencryptedRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify({
          version: 1,
          clientTimestamp: 2000,
          deviceId: 'device-a',
          spaces: [],
          tabs: [],
          readLater: [],
        }),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-file-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      let uploadContent = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadContent = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
        });
      });

      const result = await engine.syncNow();
      expect(result.success).toBe(true);

      expect(uploadContent).toBeTruthy();
      const parsedUpload = JSON.parse(uploadContent) as VaultPayload;
      expect(parsedUpload.isEncrypted).toBe(false);

      // Auto-downgrade occurred: session cleared, storage marked unencrypted
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storage = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storage.isEncrypted).toBe(false);
      expect(storage.vaultSalt).toBeUndefined();

      const status = await engine.getStatus();
      expect(status.telemetry.encrypted).toBe(false);
    });

    it('T5: disableEncryption while the flag is set → flag cleared, plaintext upload, no re-upgrade on next cycle', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
          pendingEncryptionUpgrade: true,
        },
      });

      const unencryptedRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify({
          version: 1,
          clientTimestamp: 2000,
          deviceId: 'device-a',
          spaces: [],
          tabs: [],
          readLater: [],
        }),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-file-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      let uploadContent = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadContent = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
        });
      });

      await engine.disableEncryption();

      const storageAfterDisable = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageAfterDisable.isEncrypted).toBe(false);
      expect(storageAfterDisable.pendingEncryptionUpgrade).toBeUndefined();

      const parsedUpload = JSON.parse(uploadContent) as VaultPayload;
      expect(parsedUpload.isEncrypted).toBe(false);

      // On next cycle, ensure no re-upgrade happens
      let nextUpload = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        nextUpload = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '3' },
        });
      });

      // Add a local change so next sync uploads
      await db.spaces.add({ name: 'New Space', createdAt: 3000 });
      await engine.syncNow();

      expect(nextUpload).toBeTruthy();
      const parsedNext = JSON.parse(nextUpload) as VaultPayload;
      expect(parsedNext.isEncrypted).toBe(false);

      const storageNext = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageNext.isEncrypted).toBe(false);
      expect(storageNext.pendingEncryptionUpgrade).toBeUndefined();
    });

    it('T6: Recovery cycle must upload when remote content is identical to local (G1)', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      // Align local app settings with an explicit settingsUpdatedAt
      const currentAppSettings = useAppStore.getState().settings;
      useAppStore.setState({
        settings: {
          ...currentAppSettings,
          settingsUpdatedAt: 1000,
        },
      });

      const matchingSettings: SyncedSettings = {
        duplicateTabBehavior: currentAppSettings.duplicateTabBehavior,
        spaceRestoreTrigger: currentAppSettings.spaceRestoreTrigger,
        readLaterOpenBehavior: currentAppSettings.readLaterOpenBehavior,
        readLaterAutoArchive: currentAppSettings.readLaterAutoArchive,
        updatedAt: 1000,
      };

      // Local and remote have identical data across all collections
      const testSpace: Space = {
        id: 10,
        uuid: 'space-uuid-1',
        name: 'Identical Space',
        createdAt: 1000,
        updatedAt: 1000,
      };
      await db.spaces.add(testSpace);

      const identicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        schemaVersion: '1.0.0',
        clientTimestamp: 1000,
        deviceId: 'device-remote',
        spaces: [{ ...testSpace }],
        tabs: [],
        readLater: [],
        rules: [],
        settings: matchingSettings,
      };

      const unencryptedRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(identicalSnapshot),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      // 1. Initial setupEncryption fails on upload
      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: false,
        error: 'Initial upload failure',
      });

      await engine.connect();
      await expect(engine.setupEncryption(passphrase)).rejects.toThrow();

      // Verify flag is preserved after failure
      const storageAfterFail = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageAfterFail.pendingEncryptionUpgrade).toBe(true);

      // 2. Recovery cycle: network is restored, upload succeeds
      let recoveryUploadContent = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        recoveryUploadContent = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
        });
      });

      // Call syncNow() with NO options (not forceFull!)
      const recoveryResult = await engine.syncNow();
      expect(recoveryResult.success).toBe(true);

      // Must upload encrypted payload even though local and remote are identical
      expect(recoveryUploadContent).toBeTruthy();
      const parsed = JSON.parse(recoveryUploadContent) as VaultPayload;
      expect(parsed.isEncrypted).toBe(true);
      expect(parsed.iv).toBeDefined();
      expect(parsed.salt).toBeDefined();

      const finalStorage = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(finalStorage.isEncrypted).toBe(true);
      expect(finalStorage.pendingEncryptionUpgrade).toBeUndefined();
    });

    it('T7: First upload conflicts, retry succeeds with shouldEncrypt=true → assert pendingEncryptionUpgrade is absent from storage afterward (G2)', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
          pendingEncryptionUpgrade: true,
        },
      });

      const unencryptedRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify({
          version: 1,
          schemaVersion: '1.0.0',
          clientTimestamp: 1000,
          deviceId: 'device-remote',
          spaces: [],
          tabs: [],
          readLater: [],
          rules: [],
        }),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      let uploadAttempts = 0;
      let finalUploadedPayload = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          return Promise.resolve({
            success: false,
            conflict: true,
            version: '2',
            error: 'Conflict: Remote file version mismatch',
          });
        }
        finalUploadedPayload = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '3' },
        });
      });

      // Recovery sync cycle with NO options
      const result = await engine.syncNow();
      expect(result.success).toBe(true);

      // Verify that retry loop executed and final upload was encrypted
      expect(uploadAttempts).toBe(2);
      expect(finalUploadedPayload).toBeTruthy();
      const parsedVault = JSON.parse(finalUploadedPayload) as VaultPayload;
      expect(parsedVault.isEncrypted).toBe(true);
      expect(parsedVault.iv).toBeDefined();
      expect(parsedVault.salt).toBeDefined();

      // Assert pendingEncryptionUpgrade is absent from storage afterward
      const storageAfterSync = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageAfterSync.isEncrypted).toBe(true);
      expect(storageAfterSync.pendingEncryptionUpgrade).toBeUndefined();
    });

    it('T8: pendingEncryptionUpgrade=true, remote plaintext; first upload returns conflict; re-download returns plaintext content that reconciles to NO remote changes → assert a real encrypted upload still occurs and the flag is cleared only after it', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });

      // Align local app settings with an explicit settingsUpdatedAt
      const currentAppSettings = useAppStore.getState().settings;
      useAppStore.setState({
        settings: {
          ...currentAppSettings,
          settingsUpdatedAt: 1000,
        },
      });

      const matchingSettings: SyncedSettings = {
        duplicateTabBehavior: currentAppSettings.duplicateTabBehavior,
        spaceRestoreTrigger: currentAppSettings.spaceRestoreTrigger,
        readLaterOpenBehavior: currentAppSettings.readLaterOpenBehavior,
        readLaterAutoArchive: currentAppSettings.readLaterAutoArchive,
        updatedAt: 1000,
      };

      // Local and remote have identical data across all collections
      const testSpace: Space = {
        id: 10,
        uuid: 'space-uuid-1',
        name: 'Identical Space',
        createdAt: 1000,
        updatedAt: 1000,
      };
      await db.spaces.add(testSpace);

      const identicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        schemaVersion: '1.0.0',
        clientTimestamp: 1000,
        deviceId: 'device-remote',
        spaces: [{ ...testSpace }],
        tabs: [],
        readLater: [],
        rules: [],
        settings: matchingSettings,
      };

      const unencryptedRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(identicalSnapshot),
        isEncrypted: false,
      };

      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
          pendingEncryptionUpgrade: true,
        },
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [{ id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' }],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: unencryptedRemotePayload,
      });

      let uploadAttempts = 0;
      let finalUploadedPayload = '';
      mockedDrive.uploadVaultFile.mockImplementation((content: string) => {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          return Promise.resolve({
            success: false,
            conflict: true,
            version: '2',
            error: 'Conflict: Remote file version mismatch',
          });
        }
        finalUploadedPayload = content;
        return Promise.resolve({
          success: true,
          data: { id: 'vault-file-id-1', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '3' },
        });
      });

      // Recovery sync cycle with NO options
      const result = await engine.syncNow();
      expect(result.success).toBe(true);

      // Must perform real encrypted upload on retry attempt (attempt 2), NOT take synthetic success early-exit
      expect(uploadAttempts).toBe(2);
      expect(finalUploadedPayload).toBeTruthy();
      const parsedVault = JSON.parse(finalUploadedPayload) as VaultPayload;
      expect(parsedVault.isEncrypted).toBe(true);
      expect(parsedVault.iv).toBeDefined();
      expect(parsedVault.salt).toBeDefined();

      // Flag must be cleared only after the real encrypted upload succeeds
      const storageAfterSync = mockStorage['tabbellus_sync_state'] as SyncStorageState;
      expect(storageAfterSync.isEncrypted).toBe(true);
      expect(storageAfterSync.pendingEncryptionUpgrade).toBeUndefined();
    });
  });

  describe('disableEncryption Safety & Validation Parity', () => {
    let passphrase = 'test-passphrase-disable';
    let saltBytes: Uint8Array;
    let saltBase64: string;
    let key: CryptoKey;

    beforeEach(async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      saltBytes = WebCryptoEngine.generateSalt();
      saltBase64 = uint8ArrayToBase64(saltBytes);
      key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      await db.spaces.add({
        name: 'Local Keep Safe Space',
        createdAt: 1000,
        updatedAt: 1000,
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: {
          files: [
            {
              id: 'vault-file-id-existing',
              name: 'tabbellus_vault.json',
              modifiedTime: '2026-09-03T10:00:00Z',
              mimeType: 'application/json',
              version: '10',
            },
          ],
        },
      });

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
    });

    it('T1: Vault file exists, download returns an unknown-shape object → disableEncryption rejects; uploadVaultFile NOT called; session still unlocked; storage isEncrypted=true; status error', async () => {
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: { unexpected: 'shape', someNumbers: [1, 2, 3] } as any,
      });

      await expect(engine.disableEncryption()).rejects.toThrow();

      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storage.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(true);
      const status = await engine.getStatus();
      expect(status.state).toBe('error');
    });

    it('T2: Vault file exists, unencrypted payload whose JSON parses but fails validateSnapshot → same assertions as T1', async () => {
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: {
          schemaVersion: '1.0.0',
          clientTimestamp: new Date().toISOString(),
          isEncrypted: false,
          payload: JSON.stringify({ notASnapshot: true, spaces: 'not-an-array' }),
        },
      });

      await expect(engine.disableEncryption()).rejects.toThrow();

      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storage.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(true);
      const status = await engine.getStatus();
      expect(status.state).toBe('error');
    });

    it('T3: Encrypted payload that decrypts to an invalid snapshot → same assertions; specifically status is error, not syncing', async () => {
      const envelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify({ notASnapshot: true, spaces: 'not-an-array' }),
        key,
        saltBytes,
      );
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: {
          schemaVersion: '2.0.0-e2ee',
          clientTimestamp: new Date().toISOString(),
          payload: envelope.ciphertext,
          iv: envelope.iv,
          salt: envelope.salt,
          isEncrypted: true,
        },
      });

      await expect(engine.disableEncryption()).rejects.toThrow();

      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storage.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(true);
      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.state).not.toBe('syncing');
    });

    it('T4: Vault written by a newer schema major → rejects with the same update your extension semantics as executeSync; no upload; keys kept', async () => {
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
        data: remoteSnapshot as any,
      });

      await expect(engine.disableEncryption()).rejects.toThrow(
        /newer version of TabBellus/i,
      );

      expect(mockedDrive.uploadVaultFile).not.toHaveBeenCalled();
      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storage.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(true);
      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.telemetry.lastError).toContain('newer version of TabBellus');
    });

    it('T5: No vault file exists → disableEncryption proceeds and uploads plaintext local data (legitimate path preserved)', async () => {
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [] },
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'new-vault-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      await engine.disableEncryption();

      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storage.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(false);
      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
    });
  });

  // =========================================================================
  // disableEncryption Session Key & State Lifecycle Safety (T1–T5)
  // =========================================================================

  describe('disableEncryption Session Key & State Lifecycle Safety (T1–T5)', () => {
    let passphrase = 'disable-e2ee-lifecycle-pass';
    let saltBytes: Uint8Array;
    let saltBase64: string;
    let key: CryptoKey;
    let remoteEncryptedPayload: VaultPayload;

    beforeEach(async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });

      saltBytes = WebCryptoEngine.generateSalt();
      saltBase64 = uint8ArrayToBase64(saltBytes);
      key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      await db.spaces.add({
        name: 'Local Only Space',
        createdAt: 1000,
        updatedAt: 1000,
      });

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

      remoteEncryptedPayload = {
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
              modifiedTime: '2026-09-01T12:00:00Z',
              mimeType: 'application/json',
              version: '10',
            },
          ],
        },
      });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: remoteEncryptedPayload,
      });

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
    });

    it('T1: Upload fails (network error) → disableEncryption rejects; sessionKeyStore still unlocked; storage isEncrypted true and vaultSalt unchanged; telemetry.encrypted true; status error. A second disableEncryption with a working upload then succeeds.', async () => {
      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: false,
        error: 'Network timeout: Failed to fetch',
      });

      await expect(engine.disableEncryption()).rejects.toThrow(/Failed to upload unencrypted vault/i);

      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      const state = storage.tabbellus_sync_state as SyncStorageState;
      expect(state.isEncrypted).toBe(true);
      expect(state.vaultSalt).toBe(saltBase64);
      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.telemetry.encrypted).toBe(true);

      // A second disableEncryption with a working upload then succeeds
      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: true,
        data: { id: 'vault-file-123', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      await engine.disableEncryption();

      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storage2 = await chrome.storage.local.get('tabbellus_sync_state');
      const state2 = storage2.tabbellus_sync_state as SyncStorageState;
      expect(state2.isEncrypted).toBe(false);
      expect(state2.vaultSalt).toBeUndefined();
      const status2 = await engine.getStatus();
      expect(status2.state).toBe('synced');
      expect(status2.telemetry.encrypted).toBe(false);
    });

    it('T2: Upload returns conflict → same assertions as T1, and the error message tells the user to try again.', async () => {
      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: false,
        error: 'Conflict: Remote file version mismatch (expected: 10, remote: 11).',
        conflict: true,
        statusCode: 409,
      });

      await expect(engine.disableEncryption()).rejects.toThrow(/try again/i);

      expect(await sessionKeyStore.isUnlocked()).toBe(true);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      const state = storage.tabbellus_sync_state as SyncStorageState;
      expect(state.isEncrypted).toBe(true);
      expect(state.vaultSalt).toBe(saltBase64);
      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.telemetry.encrypted).toBe(true);
      expect(status.telemetry.lastError).toMatch(/try again/i);
    });

    it('T3 (regression): Happy path — plaintext uploaded, session cleared, isEncrypted false, status synced.', async () => {
      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: true,
        data: { id: 'vault-file-123', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      await engine.disableEncryption();

      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      const uploadedPayload = JSON.parse(mockedDrive.uploadVaultFile.mock.calls[0][0]) as VaultPayload;
      expect(uploadedPayload.isEncrypted).toBe(false);
      expect(uploadedPayload.iv).toBeUndefined();
      expect(uploadedPayload.salt).toBeUndefined();

      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      const state = storage.tabbellus_sync_state as SyncStorageState;
      expect(state.isEncrypted).toBe(false);
      expect(state.vaultSalt).toBeUndefined();
      expect(state.lastError).toBeUndefined();
      expect(state.syncEnabled).toBe(true);

      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.telemetry.encrypted).toBe(false);
    });

    it('T4 (R3): Simulate a stop after a successful plaintext upload (storage still isEncrypted:true with an unlocked session; remote plaintext) → syncNow() → session cleared, isEncrypted false, no encrypted upload.', async () => {
      const plaintextRemoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'remote-device-x',
        spaces: [{ id: 99, name: 'Remote Plaintext Space', createdAt: 2000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };
      const plaintextRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(plaintextRemoteSnapshot),
        isEncrypted: false,
      };

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: plaintextRemotePayload,
      });

      // Storage still has isEncrypted:true, unlocked session, but pendingEncryptionUpgrade cleared
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
          pendingEncryptionUpgrade: undefined,
        },
      });

      // Mock upload for syncNow reconciliation upload
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-file-123', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(true);

      // Verify no encrypted upload occurred: any upload that occurred must be plaintext
      if (mockedDrive.uploadVaultFile.mock.calls.length > 0) {
        const uploaded = JSON.parse(mockedDrive.uploadVaultFile.mock.calls[0][0]) as VaultPayload;
        expect(uploaded.isEncrypted).toBe(false);
      }

      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storage = await chrome.storage.local.get('tabbellus_sync_state');
      const state = storage.tabbellus_sync_state as SyncStorageState;
      expect(state.isEncrypted).toBe(false);
      expect(state.vaultSalt).toBeUndefined();

      const status = await engine.getStatus();
      expect(status.telemetry.encrypted).toBe(false);
    });

    it('T5 (R4): pendingEncryptionUpgrade=true, remote plaintext; disableEncryption with a failing upload → a subsequent syncNow() does NOT upload an encrypted vault and ends with isEncrypted false.', async () => {
      const plaintextRemoteSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'remote-device-x',
        spaces: [{ id: 99, name: 'Remote Plaintext Space', createdAt: 2000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };
      const plaintextRemotePayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(plaintextRemoteSnapshot),
        isEncrypted: false,
      };

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: plaintextRemotePayload,
      });

      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
          pendingEncryptionUpgrade: true,
        },
      });

      mockedDrive.uploadVaultFile.mockResolvedValueOnce({
        success: false,
        error: 'Upload connection reset',
      });

      await expect(engine.disableEncryption()).rejects.toThrow();

      const storageAfterFail = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storageAfterFail.tabbellus_sync_state as SyncStorageState).pendingEncryptionUpgrade).toBeUndefined();

      // Subsequent syncNow
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-file-123', name: 'tabbellus_vault.json', mimeType: 'application/json' },
      });

      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(true);

      const storageFinal = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storageFinal.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(false);
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
    });
  });

  // =========================================================================
  // User-Initiated Encryption Operations Lock Contention (T1–T4)
  // =========================================================================

  // =========================================================================
  // User-Initiated Encryption Operations Lock Contention (T1–T4 + Regressions)
  // =========================================================================

  describe('User-Initiated Encryption Operations Lock Contention', () => {
    interface LockQueueItem {
      options: { ifAvailable?: boolean; signal?: AbortSignal };
      callback: (lock: { name: string; mode: string } | null) => Promise<any>;
      resolve: (value: any) => void;
      reject: (reason: any) => void;
    }

    function createMockLocks() {
      const queues = new Map<string, { held: boolean; queue: LockQueueItem[] }>();

      function getBucket(name: string) {
        let bucket = queues.get(name);
        if (!bucket) {
          bucket = { held: false, queue: [] };
          queues.set(name, bucket);
        }
        return bucket;
      }

      function processQueue(name: string) {
        const bucket = getBucket(name);
        if (bucket.held || bucket.queue.length === 0) return;

        const next = bucket.queue.shift()!;
        if (next.options.signal?.aborted) {
          next.reject(next.options.signal.reason || new DOMException('The request was aborted', 'AbortError'));
          processQueue(name);
          return;
        }

        bucket.held = true;
        const lock = { name, mode: 'exclusive' };

        Promise.resolve()
          .then(() => next.callback(lock))
          .then(
            (res) => {
              bucket.held = false;
              next.resolve(res);
              processQueue(name);
            },
            (err) => {
              bucket.held = false;
              next.reject(err);
              processQueue(name);
            },
          );
      }

      const request = vi.fn(
        (
          name: string,
          optionsOrCallback: any,
          maybeCallback?: any,
        ): Promise<any> => {
          let options: { ifAvailable?: boolean; signal?: AbortSignal } = {};
          let callback: (lock: any) => Promise<any>;

          if (typeof optionsOrCallback === 'function') {
            callback = optionsOrCallback;
          } else {
            options = optionsOrCallback || {};
            callback = maybeCallback;
          }

          const bucket = getBucket(name);

          if (options.ifAvailable) {
            if (bucket.held) {
              return Promise.resolve(callback(null));
            }
            bucket.held = true;
            const lock = { name, mode: 'exclusive' };
            return Promise.resolve()
              .then(() => callback(lock))
              .finally(() => {
                bucket.held = false;
                processQueue(name);
              });
          }

          // 'wait' mode:
          if (options.signal?.aborted) {
            return Promise.reject(options.signal.reason || new DOMException('The request was aborted', 'AbortError'));
          }

          return new Promise<any>((resolve, reject) => {
            const item: LockQueueItem = {
              options,
              callback,
              resolve,
              reject,
            };

            if (options.signal) {
              const onAbort = () => {
                options.signal?.removeEventListener('abort', onAbort);
                const idx = bucket.queue.indexOf(item);
                if (idx !== -1) {
                  bucket.queue.splice(idx, 1);
                  reject(options.signal?.reason || new DOMException('The request was aborted', 'AbortError'));
                }
              };
              options.signal.addEventListener('abort', onAbort);
            }

            bucket.queue.push(item);
            processQueue(name);
          });
        },
      );

      return { request, queues };
    }

    beforeEach(async () => {
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'mock-token' });
      mockedDrive.findVaultFile.mockResolvedValue({ success: true, data: { files: [] } });
      await engine.connect();
    });

    it('T1: In-memory fallback branch: setupEncryption findVaultFile happens only AFTER in-flight sync upload gate is released (explicit call order)', async () => {
      vi.stubGlobal('navigator', {});

      const testKey = await WebCryptoEngine.deriveKeyFromPassphrase('test', new Uint8Array(16));
      vi.spyOn(WebCryptoEngine, 'deriveKeyFromPassphrase').mockResolvedValue(testKey);

      const callOrder: string[] = [];
      let resolveUploadGate!: () => void;
      const uploadGate = new Promise<void>((resolve) => {
        resolveUploadGate = resolve;
      });

      let findCount = 0;
      mockedDrive.findVaultFile.mockImplementation(async () => {
        findCount++;
        let label: string;
        if (findCount === 1) {
          label = 'syncNow:findVaultFile';
        } else if (findCount === 2) {
          label = 'syncNow:findVaultFile_recheck';
        } else if (findCount === 3) {
          label = 'setupEncryption:findVaultFile';
        } else {
          label = 'setupEncryption:findVaultFile_recheck';
        }
        callOrder.push(label);
        return { success: true, data: { files: [] } };
      });

      let uploadCount = 0;
      mockedDrive.uploadVaultFile.mockImplementation(async () => {
        uploadCount++;
        if (uploadCount === 1) {
          callOrder.push('syncNow:uploadVaultFile_started');
          await uploadGate;
          callOrder.push('syncNow:uploadVaultFile_finished');
        } else {
          callOrder.push('setupEncryption:uploadVaultFile');
        }
        return {
          success: true,
          data: { id: 'vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        };
      });

      // Start an in-flight sync that holds the lock
      const inFlightSync = engine.syncNow();

      // Ensure in-flight sync has acquired lock and entered uploadVaultFile
      while (!callOrder.includes('syncNow:uploadVaultFile_started')) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Initiate setupEncryption while syncNow holds the lock
      const setupPromise = engine.setupEncryption('MySecurePassphrase123!');

      // Wait 80ms while uploadGate is held
      await new Promise((r) => setTimeout(r, 80));

      // Now release the in-flight sync lock
      callOrder.push('gate_released');
      resolveUploadGate();

      await inFlightSync;
      await setupPromise;

      const gateReleaseIndex = callOrder.indexOf('gate_released');
      const setupFindIndex = callOrder.indexOf('setupEncryption:findVaultFile');

      expect(gateReleaseIndex).toBeGreaterThan(-1);
      expect(setupFindIndex).toBeGreaterThan(gateReleaseIndex);
      expect(callOrder).toEqual([
        'syncNow:findVaultFile',
        'syncNow:uploadVaultFile_started',
        'gate_released',
        'syncNow:uploadVaultFile_finished',
        'syncNow:findVaultFile_recheck',
        'setupEncryption:findVaultFile',
        'setupEncryption:uploadVaultFile',
        'setupEncryption:findVaultFile_recheck',
      ]);
    });

    it('T2: Web Locks branch: setupEncryption findVaultFile happens only AFTER in-flight sync upload gate is released (explicit call order with stubbed navigator.locks)', async () => {
      const mockLocks = createMockLocks();
      vi.stubGlobal('navigator', {
        locks: {
          request: mockLocks.request,
        },
      });

      const testKey = await WebCryptoEngine.deriveKeyFromPassphrase('test', new Uint8Array(16));
      vi.spyOn(WebCryptoEngine, 'deriveKeyFromPassphrase').mockResolvedValue(testKey);

      const callOrder: string[] = [];
      let resolveUploadGate!: () => void;
      const uploadGate = new Promise<void>((resolve) => {
        resolveUploadGate = resolve;
      });

      let findCount = 0;
      mockedDrive.findVaultFile.mockImplementation(async () => {
        findCount++;
        let label: string;
        if (findCount === 1) {
          label = 'syncNow:findVaultFile';
        } else if (findCount === 2) {
          label = 'syncNow:findVaultFile_recheck';
        } else if (findCount === 3) {
          label = 'setupEncryption:findVaultFile';
        } else {
          label = 'setupEncryption:findVaultFile_recheck';
        }
        callOrder.push(label);
        return { success: true, data: { files: [] } };
      });

      let uploadCount = 0;
      mockedDrive.uploadVaultFile.mockImplementation(async () => {
        uploadCount++;
        if (uploadCount === 1) {
          callOrder.push('syncNow:uploadVaultFile_started');
          await uploadGate;
          callOrder.push('syncNow:uploadVaultFile_finished');
        } else {
          callOrder.push('setupEncryption:uploadVaultFile');
        }
        return {
          success: true,
          data: { id: 'vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        };
      });

      const inFlightSync = engine.syncNow();

      while (!callOrder.includes('syncNow:uploadVaultFile_started')) {
        await new Promise((r) => setTimeout(r, 10));
      }

      const setupPromise = engine.setupEncryption('MySecurePassphrase123!');

      await new Promise((r) => setTimeout(r, 80));

      callOrder.push('gate_released');
      resolveUploadGate();

      await inFlightSync;
      await setupPromise;

      const gateReleaseIndex = callOrder.indexOf('gate_released');
      const setupFindIndex = callOrder.indexOf('setupEncryption:findVaultFile');

      expect(gateReleaseIndex).toBeGreaterThan(-1);
      expect(setupFindIndex).toBeGreaterThan(gateReleaseIndex);
      expect(callOrder).toEqual([
        'syncNow:findVaultFile',
        'syncNow:uploadVaultFile_started',
        'gate_released',
        'syncNow:uploadVaultFile_finished',
        'syncNow:findVaultFile_recheck',
        'setupEncryption:findVaultFile',
        'setupEncryption:uploadVaultFile',
        'setupEncryption:findVaultFile_recheck',
      ]);
    });

    it('T3: Lock held past the max wait (use fake timers) → setupEncryption rejects with the busy error; its action never executes, even after the holder later releases', async () => {
      let releaseHolder!: () => void;
      const holderPromise = new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });

      const holder = (engine as any).withSyncLock('holder', () => holderPromise, { mode: 'wait' });

      let setupExecuted = false;
      mockedDrive.uploadVaultFile.mockImplementation(async () => {
        setupExecuted = true;
        return { success: true, data: { id: 'id', name: 'tabbellus_vault.json', mimeType: 'application/json' } };
      });

      try {
        vi.useFakeTimers();

        const setupPromise = engine.setupEncryption('Passphrase123!');

        let caughtError: any = null;
        setupPromise.catch((err) => {
          caughtError = err;
        });

        vi.advanceTimersByTime(MAX_SYNC_LOCK_WAIT_MS + 100);

        await expect(setupPromise).rejects.toThrow(/sync is busy/i);
        expect(caughtError).toBeInstanceOf(SyncBusyError);
      } finally {
        vi.useRealTimers();
      }

      releaseHolder();
      await holder;

      await new Promise((r) => setTimeout(r, 20));

      expect(setupExecuted).toBe(false);
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
    });

    it('T4: After a timed-out waiter, a subsequent wait-mode operation still acquires the lock and runs normally (chain not broken)', async () => {
      let releaseHolder!: () => void;
      const holderPromise = new Promise<void>((resolve) => {
        releaseHolder = resolve;
      });

      const holder = (engine as any).withSyncLock('holder', () => holderPromise, { mode: 'wait' });

      try {
        vi.useFakeTimers();

        const waiter1 = engine.setupEncryption('TimedOutWaiter!');
        waiter1.catch(() => {});

        vi.advanceTimersByTime(MAX_SYNC_LOCK_WAIT_MS + 100);
        await expect(waiter1).rejects.toThrow(SyncBusyError);
      } finally {
        vi.useRealTimers();
      }

      let waiter2Executed = false;
      const waiter2 = (engine as any).withSyncLock(
        'waiter2',
        async () => {
          waiter2Executed = true;
          return 'waiter2_success';
        },
        { mode: 'wait' },
      );

      expect(waiter2Executed).toBe(false);

      releaseHolder();
      await holder;

      const result = await waiter2;
      expect(result).toBe('waiter2_success');
      expect(waiter2Executed).toBe(true);
    });

    it('T5: Lock held by an in-flight sync → disableEncryption and resetCloudVault do not resolve until lock is released, then complete work', async () => {
      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase('ActivePass123!', saltBytes);
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
        },
      });

      let resolveUploadGate1!: () => void;
      const uploadGate1 = new Promise<void>((resolve) => {
        resolveUploadGate1 = resolve;
      });

      let firstCall = true;
      mockedDrive.uploadVaultFile.mockImplementation(async () => {
        if (firstCall) {
          firstCall = false;
          await uploadGate1;
        }
        return {
          success: true,
          data: { id: 'vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        };
      });

      const inFlightSync1 = engine.syncNow();

      let disableResolved = false;
      const disablePromise = engine.disableEncryption().then(() => {
        disableResolved = true;
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(disableResolved).toBe(false);

      resolveUploadGate1();
      await inFlightSync1;
      await disablePromise;

      expect(disableResolved).toBe(true);
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storageAfterDisable = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storageAfterDisable.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(false);

      // Reset Cloud Vault
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
        },
      });

      let resolveUploadGate2!: () => void;
      const uploadGate2 = new Promise<void>((resolve) => {
        resolveUploadGate2 = resolve;
      });

      firstCall = true;
      mockedDrive.uploadVaultFile.mockImplementation(async () => {
        if (firstCall) {
          firstCall = false;
          await uploadGate2;
        }
        return {
          success: true,
          data: { id: 'vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        };
      });

      const inFlightSync2 = engine.syncNow();

      let resetResolved = false;
      const resetPromise = engine.resetCloudVault().then(() => {
        resetResolved = true;
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(resetResolved).toBe(false);

      resolveUploadGate2();
      await inFlightSync2;
      await resetPromise;

      expect(resetResolved).toBe(true);
      expect(await sessionKeyStore.isUnlocked()).toBe(false);
      const storageAfterReset = await chrome.storage.local.get('tabbellus_sync_state');
      expect((storageAfterReset.tabbellus_sync_state as SyncStorageState).isEncrypted).toBe(false);
    });

    it('T6: Background syncNow under contention still skips (regression)', async () => {
      let resolveUploadGate!: () => void;
      const uploadGate = new Promise<void>((resolve) => {
        resolveUploadGate = resolve;
      });

      let firstCall = true;
      mockedDrive.uploadVaultFile.mockImplementation(async () => {
        if (firstCall) {
          firstCall = false;
          await uploadGate;
        }
        return {
          success: true,
          data: { id: 'vault-file-id', name: 'tabbellus_vault.json', mimeType: 'application/json' },
        };
      });

      const inFlightSync = engine.syncNow();

      const skipResult = await engine.syncNow();
      expect(skipResult.success).toBe(false);
      expect(skipResult.error).toContain('Sync already in progress');

      resolveUploadGate();
      const inFlightResult = await inFlightSync;
      expect(inFlightResult.success).toBe(true);
    });

    it('T7: disableEncryption while disconnected → rejects with a descriptive error', async () => {
      await engine.disconnect();

      await expect(engine.disableEncryption()).rejects.toThrow(
        /disconnected/i,
      );
    });
  });

  // =========================================================================
  // Duplicate Vault Files Resolution & Healing (T1–T8)
  // =========================================================================

  describe('Duplicate Vault Files Resolution & Healing (T1–T8)', () => {
    const fileOld = {
      id: 'vault-old-100',
      name: 'tabbellus_vault.json',
      mimeType: 'application/json',
      createdTime: '2026-09-01T10:00:00.000Z',
      version: '1',
    };

    const fileNew = {
      id: 'vault-new-200',
      name: 'tabbellus_vault.json',
      mimeType: 'application/json',
      createdTime: '2026-09-01T12:00:00.000Z',
      version: '2',
    };

    beforeEach(async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: true,
        data: 'valid-token',
      });
      await engine.connect();
    });

    it('T1: findVaultFile returns two files in either order → every lookup site binds to the older one (assert for both orders)', async () => {
      // 1. Direct resolver assertion: Order 1 [fileOld, fileNew]
      const res1 = resolveVaultFiles([fileOld, fileNew]);
      expect(res1.canonical?.id).toBe('vault-old-100');
      expect(res1.extras.map((f) => f.id)).toEqual(['vault-new-200']);

      // 2. Direct resolver assertion: Order 2 [fileNew, fileOld]
      const res2 = resolveVaultFiles([fileNew, fileOld]);
      expect(res2.canonical?.id).toBe('vault-old-100');
      expect(res2.extras.map((f) => f.id)).toEqual(['vault-new-200']);

      // 3. Direct resolver tiebreak by smallest id when createdTime identical
      const fileTieA = {
        id: 'vault-aaa',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T10:00:00.000Z',
      };
      const fileTieB = {
        id: 'vault-bbb',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T10:00:00.000Z',
      };
      const resTie = resolveVaultFiles([fileTieB, fileTieA]);
      expect(resTie.canonical?.id).toBe('vault-aaa');
      expect(resTie.extras.map((f) => f.id)).toEqual(['vault-bbb']);

      // 4. Integration assertion: syncNow with [fileNew, fileOld] binds to fileOld (canonical)
      const snapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'dev-1',
        spaces: [{ id: 1, name: 'S1', createdAt: 1000, updatedAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const payload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(snapshot),
        isEncrypted: false,
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileNew, fileOld] },
      });
      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: payload,
      });
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
      });

      await engine.syncNow();

      // Canonical upload must be for fileOld ('vault-old-100'), NOT fileNew
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledWith(
        expect.any(String),
        'vault-old-100',
        'tabbellus_vault.json',
        '1',
      );
    });

    it('T2: Two vault files with disjoint data → after syncNow, the canonical upload contains the union, then the extra is deleted', async () => {
      const canonicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'dev-canonical',
        spaces: [{ id: 101, name: 'Canonical Space', createdAt: 1000, updatedAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const extraSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'dev-extra',
        spaces: [{ id: 202, name: 'Extra Space', createdAt: 2000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };

      await db.spaces.add({
        id: 303,
        name: 'Local Space',
        createdAt: 3000,
        updatedAt: 3000,
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileNew, fileOld] },
      });

      mockedDrive.downloadVaultFile.mockImplementation(async (fileId: string) => {
        if (fileId === 'vault-old-100') {
          return {
            success: true,
            data: {
              schemaVersion: '1.0.0',
              clientTimestamp: new Date().toISOString(),
              payload: JSON.stringify(canonicalSnapshot),
              isEncrypted: false,
            },
          };
        }
        if (fileId === 'vault-new-200') {
          return {
            success: true,
            data: {
              schemaVersion: '1.0.0',
              clientTimestamp: new Date().toISOString(),
              payload: JSON.stringify(extraSnapshot),
              isEncrypted: false,
            },
          };
        }
        return { success: false, error: 'File not found' };
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
      });

      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(true);

      // Verify canonical upload contains union of all three spaces
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(1);
      const [uploadedRaw, targetId] = mockedDrive.uploadVaultFile.mock.calls[0];
      expect(targetId).toBe('vault-old-100');
      const uploadedPayload = JSON.parse(uploadedRaw) as VaultPayload;
      const uploadedSnapshot = JSON.parse(uploadedPayload.payload) as SyncVaultSnapshot;
      const spaceNames = uploadedSnapshot.spaces.map((s) => s.name).sort();
      expect(spaceNames).toEqual(['Canonical Space', 'Extra Space', 'Local Space']);

      // Verify local Dexie has all 3 spaces
      const localSpaces = await db.spaces.toArray();
      expect(localSpaces.map((s) => s.name).sort()).toEqual(['Canonical Space', 'Extra Space', 'Local Space']);

      // Verify the extra was deleted AFTER upload
      expect(mockedDrive.deleteVaultFile).toHaveBeenCalledWith('vault-new-200');
    });

    it('T3: Extra file contains a space tombstone newer than the canonical file active copy → the space stays deleted after healing (LWW respected)', async () => {
      const now = Date.now();
      const canonicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: now - 5000,
        deviceId: 'dev-canonical',
        spaces: [{ id: 101, name: 'To Be Deleted Space', createdAt: now - 5000, updatedAt: now - 5000 }],
        tabs: [],
        readLater: [],
      };
      const extraSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: now - 1000,
        deviceId: 'dev-extra',
        spaces: [{ id: 101, name: 'To Be Deleted Space', createdAt: now - 5000, updatedAt: now - 1000, deletedAt: now - 1000 }],
        tabs: [],
        readLater: [],
      };

      await db.spaces.add({
        id: 101,
        name: 'To Be Deleted Space',
        createdAt: now - 5000,
        updatedAt: now - 5000,
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileOld, fileNew] },
      });

      mockedDrive.downloadVaultFile.mockImplementation(async (fileId: string) => {
        const snap = fileId === 'vault-old-100' ? canonicalSnapshot : extraSnapshot;
        return {
          success: true,
          data: {
            schemaVersion: '1.0.0',
            clientTimestamp: new Date().toISOString(),
            payload: JSON.stringify(snap),
            isEncrypted: false,
          },
        };
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
      });

      await engine.syncNow();

      // Dexie space 101 must be tombstoned
      const spaceInDb = await db.spaces.get(101);
      expect(spaceInDb?.deletedAt).toBe(now - 1000);

      // Uploaded payload must have space 101 tombstoned
      const uploadedRaw = mockedDrive.uploadVaultFile.mock.calls[0][0];
      const uploadedSnapshot = JSON.parse((JSON.parse(uploadedRaw) as VaultPayload).payload) as SyncVaultSnapshot;
      const uploadedSpace = uploadedSnapshot.spaces.find((s) => s.id === 101);
      expect(uploadedSpace?.deletedAt).toBe(now - 1000);

      // Extra must be deleted
      expect(mockedDrive.deleteVaultFile).toHaveBeenCalledWith('vault-new-200');
    });

    it('T4: Extra file cannot be decrypted (different salt/key) or fails validation → not deleted; canonical sync still succeeds; warning recorded', async () => {
      const canonicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'dev-canonical',
        spaces: [{ id: 101, name: 'Canonical Space', createdAt: 1000, updatedAt: 1000 }],
        tabs: [],
        readLater: [],
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileOld, fileNew] },
      });

      mockedDrive.downloadVaultFile.mockImplementation(async (fileId: string) => {
        if (fileId === 'vault-old-100') {
          return {
            success: true,
            data: {
              schemaVersion: '1.0.0',
              clientTimestamp: new Date().toISOString(),
              payload: JSON.stringify(canonicalSnapshot),
              isEncrypted: false,
            },
          };
        }
        // Extra file fails validation / corrupt
        return {
          success: true,
          data: {
            schemaVersion: '1.0.0',
            clientTimestamp: new Date().toISOString(),
            payload: 'invalid-not-json-payload',
            isEncrypted: false,
          },
        };
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
      });

      const result = await engine.syncNow();
      expect(result.success).toBe(true);

      // Extra must NOT be deleted
      expect(mockedDrive.deleteVaultFile).not.toHaveBeenCalledWith('vault-new-200');

      // Canonical upload succeeded
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledWith(
        expect.any(String),
        'vault-old-100',
        'tabbellus_vault.json',
        '1',
      );

      // Non-fatal warning recorded in telemetry
      const status = await engine.getStatus();
      expect(status.telemetry.lastError).toMatch(/duplicate vault file/i);
    });

    it('T5: Canonical upload fails → no extra is deleted', async () => {
      const canonicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'dev-canonical',
        spaces: [{ id: 101, name: 'Canonical Space', createdAt: 1000, updatedAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const extraSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 2000,
        deviceId: 'dev-extra',
        spaces: [{ id: 202, name: 'Extra Space', createdAt: 2000, updatedAt: 2000 }],
        tabs: [],
        readLater: [],
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileOld, fileNew] },
      });

      mockedDrive.downloadVaultFile.mockImplementation(async (fileId: string) => {
        const snap = fileId === 'vault-old-100' ? canonicalSnapshot : extraSnapshot;
        return {
          success: true,
          data: {
            schemaVersion: '1.0.0',
            clientTimestamp: new Date().toISOString(),
            payload: JSON.stringify(snap),
            isEncrypted: false,
          },
        };
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: false,
        error: 'Network timeout: Failed to fetch',
      });

      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(false);

      // NO extra must be deleted on upload failure
      expect(mockedDrive.deleteVaultFile).not.toHaveBeenCalled();
    });

    it('T6 (race): no vault initially; this device creates one; re-list shows an OLDER file → this device file ends up deleted and the older file holds the merged data', async () => {
      await db.spaces.add({
        id: 501,
        name: 'This Device Space',
        createdAt: 5000,
        updatedAt: 5000,
      });

      const createdFileId = 'vault-created-by-me';
      const olderFile = {
        id: 'vault-older-concurrent',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T08:00:00.000Z',
        version: '1',
      };
      const myCreatedFile = {
        id: createdFileId,
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T09:00:00.000Z',
        version: '1',
      };

      const olderSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 4000,
        deviceId: 'dev-other',
        spaces: [{ id: 401, name: 'Older Device Space', createdAt: 4000, updatedAt: 4000 }],
        tabs: [],
        readLater: [],
      };

      // 1st listing: empty (no vault initially)
      mockedDrive.findVaultFile
        .mockResolvedValueOnce({
          success: true,
          data: { files: [] },
        })
        // 2nd listing (re-list after creation): shows older file and created file
        .mockResolvedValue({
          success: true,
          data: { files: [olderFile, myCreatedFile] },
        });

      mockedDrive.uploadVaultFile
        // 1st upload: POST creation of my file
        .mockResolvedValueOnce({
          success: true,
          data: { id: createdFileId, name: 'tabbellus_vault.json', mimeType: 'application/json', version: '1' },
        })
        // 2nd upload: PATCH update to the older canonical file
        .mockResolvedValueOnce({
          success: true,
          data: { id: olderFile.id, name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
        });

      mockedDrive.downloadVaultFile.mockResolvedValue({
        success: true,
        data: {
          schemaVersion: '1.0.0',
          clientTimestamp: new Date().toISOString(),
          payload: JSON.stringify(olderSnapshot),
          isEncrypted: false,
        },
      });

      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(true);

      // This device's created file must be deleted
      expect(mockedDrive.deleteVaultFile).toHaveBeenCalledWith(createdFileId);

      // Older file must receive upload with merged data
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledTimes(2);
      const [secondUploadRaw, secondTargetId] = mockedDrive.uploadVaultFile.mock.calls[1];
      expect(secondTargetId).toBe('vault-older-concurrent');
      const secondPayload = JSON.parse(secondUploadRaw) as VaultPayload;
      const secondSnapshot = JSON.parse(secondPayload.payload) as SyncVaultSnapshot;
      expect(secondSnapshot.spaces.map((s) => s.name).sort()).toEqual([
        'Older Device Space',
        'This Device Space',
      ]);
    });

    it('T7: unlockVault and disableEncryption operate on the canonical file when duplicates exist', async () => {
      const passphrase = 'test-passphrase-t7';
      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      const canonicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: 1000,
        deviceId: 'dev-canonical',
        spaces: [{ id: 101, name: 'Canonical Locked Space', createdAt: 1000, updatedAt: 1000 }],
        tabs: [],
        readLater: [],
      };
      const envelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify(canonicalSnapshot),
        key,
        saltBytes,
      );
      const canonicalEncryptedPayload: VaultPayload = {
        schemaVersion: '2.0.0-e2ee',
        clientTimestamp: new Date().toISOString(),
        payload: envelope.ciphertext,
        iv: envelope.iv,
        salt: envelope.salt,
        isEncrypted: true,
      };

      // Two files in reverse order: [fileNew, fileOld]
      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileNew, fileOld] },
      });

      mockedDrive.downloadVaultFile.mockImplementation(async (fileId: string) => {
        if (fileId === 'vault-old-100') {
          return { success: true, data: canonicalEncryptedPayload };
        }
        return {
          success: true,
          data: {
            schemaVersion: '1.0.0',
            clientTimestamp: new Date().toISOString(),
            payload: JSON.stringify({ spaces: [] }),
            isEncrypted: false,
          },
        };
      });

      // 1. unlockVault
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
        },
      });

      const unlockOk = await engine.unlockVault(passphrase);
      expect(unlockOk).toBe(true);
      // unlockVault downloaded from canonical ('vault-old-100'), NOT 'vault-new-200'
      expect(mockedDrive.downloadVaultFile).toHaveBeenCalledWith('vault-old-100');

      // 2. disableEncryption
      mockedDrive.uploadVaultFile.mockClear();
      mockedDrive.downloadVaultFile.mockClear();
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
      });

      await engine.disableEncryption();

      // disableEncryption downloaded and uploaded targeting 'vault-old-100'
      expect(mockedDrive.downloadVaultFile).toHaveBeenCalledWith('vault-old-100');
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledWith(
        expect.any(String),
        'vault-old-100',
        'tabbellus_vault.json',
        '1',
      );
    });

    it('T8: resetCloudVault removes all vault files', async () => {
      const fileExtra1 = {
        id: 'vault-extra-1',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T11:00:00.000Z',
        version: '1',
      };
      const fileExtra2 = {
        id: 'vault-extra-2',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T12:00:00.000Z',
        version: '2',
      };

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileExtra1, fileOld, fileExtra2] },
      });

      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '3' },
      });

      await engine.resetCloudVault();

      // Verify canonical file ('vault-old-100') was updated with unencrypted snapshot
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledWith(
        expect.any(String),
        'vault-old-100',
        'tabbellus_vault.json',
        '1',
      );

      // Verify all extra duplicate vault files were deleted
      expect(mockedDrive.deleteVaultFile).toHaveBeenCalledWith('vault-extra-1');
      expect(mockedDrive.deleteVaultFile).toHaveBeenCalledWith('vault-extra-2');
    });
  });

  describe('Duplicate Vault Gaps: Safe Deletion & Code-Point Determinism (T1–T2)', () => {
    it('T1: duplicates exist + disableEncryption succeeds → no deleteVaultFile call; a following syncNow merges the extra\'s data and then deletes it', async () => {
      const now = Date.now();
      const passphrase = 'test-passphrase-gaps';
      const saltBytes = WebCryptoEngine.generateSalt();
      const saltBase64 = uint8ArrayToBase64(saltBytes);
      const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

      const canonicalSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: now - 5000,
        deviceId: 'dev-canonical',
        spaces: [{ id: 101, name: 'Canonical Space', createdAt: now - 5000, updatedAt: now - 5000 }],
        tabs: [],
        readLater: [],
      };
      const extraSnapshot: SyncVaultSnapshot = {
        version: 1,
        clientTimestamp: now - 2000,
        deviceId: 'dev-extra',
        spaces: [{ id: 202, name: 'Extra Space', createdAt: now - 2000, updatedAt: now - 2000 }],
        tabs: [],
        readLater: [],
      };

      const canonicalEnvelope = await WebCryptoEngine.encryptPayload(
        JSON.stringify(canonicalSnapshot),
        key,
        saltBytes,
      );
      const canonicalEncryptedPayload: VaultPayload = {
        schemaVersion: '2.0.0-e2ee',
        clientTimestamp: new Date().toISOString(),
        payload: canonicalEnvelope.ciphertext,
        iv: canonicalEnvelope.iv,
        salt: canonicalEnvelope.salt,
        isEncrypted: true,
      };

      const extraPayload: VaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: new Date().toISOString(),
        payload: JSON.stringify(extraSnapshot),
        isEncrypted: false,
      };

      const fileOld = {
        id: 'vault-old-100',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T10:00:00.000Z',
        version: '1',
      };
      const fileNew = {
        id: 'vault-new-200',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T12:00:00.000Z',
        version: '1',
      };

      // Connect engine and set up active unlocked session
      mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'valid-token' });
      await engine.connect();
      await sessionKeyStore.saveSession(key, saltBase64);
      await chrome.storage.local.set({
        tabbellus_sync_state: {
          syncEnabled: true,
          isEncrypted: true,
          vaultSalt: saltBase64,
        },
      });

      mockedDrive.findVaultFile.mockResolvedValue({
        success: true,
        data: { files: [fileOld, fileNew] },
      });

      let canonicalPayloadOnDrive: VaultPayload = canonicalEncryptedPayload;
      mockedDrive.downloadVaultFile.mockImplementation(async (fileId: string) => {
        if (fileId === 'vault-old-100') {
          return { success: true, data: canonicalPayloadOnDrive };
        }
        if (fileId === 'vault-new-200') {
          return { success: true, data: extraPayload };
        }
        return { success: false, error: 'File not found' };
      });

      mockedDrive.uploadVaultFile.mockImplementation(async (content: string, fileId?: string) => {
        if (fileId === 'vault-old-100') {
          canonicalPayloadOnDrive = JSON.parse(content) as VaultPayload;
          return {
            success: true,
            data: { id: 'vault-old-100', name: 'tabbellus_vault.json', mimeType: 'application/json', version: '2' },
          };
        }
        return { success: false, error: 'Unexpected upload fileId' };
      });

      // 1. disableEncryption succeeds
      await engine.disableEncryption();

      // R1 assertion: disableEncryption must NOT delete extra duplicate vault files!
      expect(mockedDrive.deleteVaultFile).not.toHaveBeenCalled();

      // 2. A following syncNow merges the extra's data and then deletes it
      const syncResult = await engine.syncNow();
      expect(syncResult.success).toBe(true);

      // Verify extra was deleted by syncNow
      expect(mockedDrive.deleteVaultFile).toHaveBeenCalledWith('vault-new-200');

      // Verify local Dexie has merged both the canonical space and the extra space
      const allSpaces = await db.spaces.toArray();
      const localSpaceNames = allSpaces.map((s) => s.name).sort();
      expect(localSpaceNames).toEqual(['Canonical Space', 'Extra Space']);

      // Verify uploaded canonical vault contains the union
      expect(canonicalPayloadOnDrive.isEncrypted).toBe(false);
      const uploadedSnap = JSON.parse(canonicalPayloadOnDrive.payload) as SyncVaultSnapshot;
      expect(uploadedSnap.spaces.map((s) => s.name).sort()).toEqual(['Canonical Space', 'Extra Space']);
    });

    it('T2: two files with identical createdTime and ids differing only in case/ordering that localeCompare and code-point order disagree on → resolver picks the code-point-smallest id', () => {
      // In ASCII / UTF-16 code point order, 'file-B' (code point 66) < 'file-a' (code point 97).
      // However, in standard localeCompare, 'file-a'.localeCompare('file-B') is -1 ('a' before 'b' case-insensitively).
      // This verifies that resolveVaultFiles is deterministic and locale-insensitive across devices.
      const fileLower = {
        id: 'file-a',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T10:00:00.000Z',
      };
      const fileUpper = {
        id: 'file-B',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
        createdTime: '2026-09-01T10:00:00.000Z',
      };

      // Test both input orderings
      const res1 = resolveVaultFiles([fileLower, fileUpper]);
      expect(res1.canonical?.id).toBe('file-B');
      expect(res1.extras.map((f) => f.id)).toEqual(['file-a']);

      const res2 = resolveVaultFiles([fileUpper, fileLower]);
      expect(res2.canonical?.id).toBe('file-B');
      expect(res2.extras.map((f) => f.id)).toEqual(['file-a']);
    });
  });
});


