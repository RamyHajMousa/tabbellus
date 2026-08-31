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

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};
const mockChrome = {
  storage: {
    local: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
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
});
