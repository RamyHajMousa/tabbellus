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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncEngine } from '../syncEngine';
import { googleAuthClient } from '../../api/googleAuthClient';
import { googleDriveClient } from '../../api/googleDriveClient';
import { db } from '@/lib/db';
import {
  WebCryptoEngine,
  sessionKeyStore,
  base64ToUint8Array,
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
        data: remoteSnapshot as unknown as { schemaVersion: string; clientTimestamp: string; payload: string },
      });

      // 4. Upload returns updated file
      mockedDrive.uploadVaultFile.mockResolvedValue({
        success: true,
        data: {
          id: 'vault-file-001',
          name: 'tabbellus_vault.json',
          mimeType: 'application/json',
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

      // Verify Drive upload called with merged content
      expect(mockedDrive.uploadVaultFile).toHaveBeenCalledWith(
        expect.stringContaining('Remote Space'),
        'vault-file-001',
        'tabbellus_vault.json',
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
  });
});

