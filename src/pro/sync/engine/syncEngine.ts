/**
 * Google Drive Sync Engine
 *
 * Implements `SyncProvider` to orchestrate cloud synchronization between
 * local Dexie IndexedDB and Google Drive appDataFolder.
 *
 * LIFECYCLE:
 * 1. `connect()`: Requests OAuth2 token and enables cloud sync.
 * 2. `disconnect()`: Revokes OAuth2 token and disables cloud sync.
 * 3. `syncNow()`: Orchestrates download -> LWW diff -> local write -> upload -> status update.
 * 4. `subscribe()`: Dispatches reactive telemetry and state updates.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Implements `@/core/contracts/sync.ts` interface.
 * - Free Core never imports this class directly; it attaches via ContractRegistry.
 */

import type {
  SyncProvider,
  SyncStatus,
  SyncResult,
} from '@/core/contracts/sync';
import { googleAuthClient } from '../api/googleAuthClient';
import { googleDriveClient } from '../api/googleDriveClient';
import { SnapshotSerializer } from './snapshotSerializer';
import { DiffEngine } from './diffEngine';
import type { SyncStorageState, SyncVaultSnapshot } from './types';
import { getOrCreateInstanceId } from '@/pro/licensing/storage/instanceManager';

const SYNC_STORAGE_KEY = 'tabbellus_sync_state';
const VAULT_FILE_NAME = 'tabbellus_vault.json';

export class SyncEngine implements SyncProvider {
  private status: SyncStatus = {
    state: 'idle',
    isConnected: false,
    telemetry: {
      pendingMutations: 0,
      encrypted: false,
    },
  };

  private listeners = new Set<(status: SyncStatus) => void>();
  private isSyncing = false;

  constructor() {
    this.initFromStorage();
  }

  /**
   * Initializes sync state from local storage.
   */
  private async initFromStorage(): Promise<void> {
    try {
      const state = await this.loadStorageState();
      if (state.syncEnabled) {
        this.status.isConnected = true;
        this.status.telemetry.lastSyncedAt = state.lastSyncedAt;
        this.status.telemetry.lastError = state.lastError;
      }
      this.notifyListeners();
    } catch {
      // Best-effort storage initialization
    }
  }

  private async loadStorageState(): Promise<SyncStorageState> {
    try {
      const result = await chrome.storage.local.get(SYNC_STORAGE_KEY);
      const raw = result[SYNC_STORAGE_KEY];
      if (raw && typeof raw === 'object') {
        return {
          syncEnabled: Boolean(raw.syncEnabled),
          lastSyncedAt: typeof raw.lastSyncedAt === 'number' ? raw.lastSyncedAt : undefined,
          lastVaultFileId: typeof raw.lastVaultFileId === 'string' ? raw.lastVaultFileId : undefined,
          lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
        };
      }
    } catch {
      // Fall through to default
    }
    return { syncEnabled: false };
  }

  private async saveStorageState(updates: Partial<SyncStorageState>): Promise<void> {
    try {
      const current = await this.loadStorageState();
      const updated: SyncStorageState = { ...current, ...updates };
      await chrome.storage.local.set({ [SYNC_STORAGE_KEY]: updated });
    } catch {
      // Best-effort storage persistence
    }
  }

  private updateStatus(patch: Partial<SyncStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      telemetry: {
        ...this.status.telemetry,
        ...(patch.telemetry ?? {}),
      },
    };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const snapshot: SyncStatus = {
      state: this.status.state,
      isConnected: this.status.isConnected,
      telemetry: { ...this.status.telemetry },
    };
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // Prevent listener error from breaking notification loop
      }
    });
  }

  // -------------------------------------------------------------------------
  // SyncProvider Interface Implementation
  // -------------------------------------------------------------------------

  async getStatus(): Promise<SyncStatus> {
    return {
      state: this.status.state,
      isConnected: this.status.isConnected,
      telemetry: { ...this.status.telemetry },
    };
  }

  /**
   * Prompts the user for interactive Google OAuth2 consent and enables sync.
   */
  async connect(): Promise<{ success: boolean; error?: string }> {
    try {
      const authResult = await googleAuthClient.getAuthToken(true);

      if (!authResult.success) {
        this.updateStatus({
          state: 'error',
          isConnected: false,
          telemetry: {
            ...this.status.telemetry,
            lastError: authResult.error,
          },
        });
        await this.saveStorageState({
          syncEnabled: false,
          lastError: authResult.error,
        });
        return { success: false, error: authResult.error };
      }

      this.updateStatus({
        state: 'idle',
        isConnected: true,
        telemetry: {
          ...this.status.telemetry,
          lastError: undefined,
        },
      });

      await this.saveStorageState({
        syncEnabled: true,
        lastError: undefined,
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect Google Drive';
      this.updateStatus({
        state: 'error',
        isConnected: false,
        telemetry: {
          ...this.status.telemetry,
          lastError: message,
        },
      });
      return { success: false, error: message };
    }
  }

  /**
   * Revokes the OAuth2 token and disables sync.
   */
  async disconnect(): Promise<void> {
    try {
      const tokenResult = await googleAuthClient.getAuthToken(false);
      if (tokenResult.success) {
        await googleAuthClient.revokeToken(tokenResult.data);
      }
    } catch {
      // Best-effort revocation
    }

    this.updateStatus({
      state: 'idle',
      isConnected: false,
      telemetry: {
        ...this.status.telemetry,
        lastError: undefined,
      },
    });

    await this.saveStorageState({
      syncEnabled: false,
      lastError: undefined,
    });
  }

  /**
   * Executes a full synchronization cycle.
   */
  async syncNow(options?: { forceFull?: boolean }): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        error: 'Sync already in progress.',
        timestamp: Date.now(),
      };
    }

    this.isSyncing = true;
    this.updateStatus({ state: 'syncing' });

    try {
      // Step 1: Verify auth token silently
      const authResult = await googleAuthClient.getAuthToken(false);
      if (!authResult.success) {
        const isOffline =
          authResult.error.includes('Network') ||
          authResult.error.includes('offline') ||
          authResult.error.includes('Failed to fetch');

        const state = isOffline ? 'offline' : 'error';

        this.updateStatus({
          state,
          isConnected: !authResult.authExpired,
          telemetry: {
            ...this.status.telemetry,
            lastError: authResult.error,
          },
        });

        await this.saveStorageState({ lastError: authResult.error });
        return {
          success: false,
          error: authResult.error,
          timestamp: Date.now(),
        };
      }

      // Step 2: Query for existing vault file in appDataFolder
      const findResult = await googleDriveClient.findVaultFile(VAULT_FILE_NAME);
      if (!findResult.success) {
        const state = findResult.authExpired ? 'error' : 'offline';
        this.updateStatus({
          state,
          telemetry: {
            ...this.status.telemetry,
            lastError: findResult.error,
          },
        });
        await this.saveStorageState({ lastError: findResult.error });
        return {
          success: false,
          error: findResult.error,
          timestamp: Date.now(),
        };
      }

      let remoteSnapshot: SyncVaultSnapshot | null = null;
      let vaultFileId: string | undefined = undefined;

      // Step 3: Download remote snapshot if it exists
      if (findResult.data.files.length > 0) {
        const file = findResult.data.files[0];
        vaultFileId = file.id;

        const downloadResult = await googleDriveClient.downloadVaultFile(vaultFileId);
        if (downloadResult.success) {
          const raw = downloadResult.data;
          // Handle both direct snapshot objects and VaultPayload envelope
          if (SnapshotSerializer.validateSnapshot(raw)) {
            remoteSnapshot = raw;
          } else if (raw && typeof (raw as { payload?: string }).payload === 'string') {
            try {
              const parsed = JSON.parse((raw as { payload: string }).payload);
              if (SnapshotSerializer.validateSnapshot(parsed)) {
                remoteSnapshot = parsed;
              }
            } catch {
              // Ignore corrupt payload and proceed with initial upload
            }
          }
        }
      }

      // Step 4: Create local snapshot
      const deviceId = await getOrCreateInstanceId();
      const localSnapshot = await SnapshotSerializer.createLocalSnapshot(deviceId);

      // Step 5: Reconcile snapshots using Record-Level LWW DiffEngine
      const reconciliation = DiffEngine.reconcile(
        localSnapshot,
        remoteSnapshot,
        deviceId,
      );

      // Step 6: Apply incoming remote updates to Dexie
      await SnapshotSerializer.applyRemoteUpdates(reconciliation.localUpdates);

      // Step 7: Upload reconciled merged snapshot to Drive if changes exist
      if (reconciliation.hasChanges || options?.forceFull) {
        const payloadString = JSON.stringify(reconciliation.mergedSnapshot);
        const uploadResult = await googleDriveClient.uploadVaultFile(
          payloadString,
          vaultFileId,
          VAULT_FILE_NAME,
        );

        if (!uploadResult.success) {
          const state = uploadResult.authExpired ? 'error' : 'offline';
          this.updateStatus({
            state,
            telemetry: {
              ...this.status.telemetry,
              lastError: uploadResult.error,
            },
          });
          await this.saveStorageState({ lastError: uploadResult.error });
          return {
            success: false,
            error: uploadResult.error,
            timestamp: Date.now(),
          };
        }

        vaultFileId = uploadResult.data.id;
      }

      // Step 8: Update state to synced
      const now = Date.now();
      this.updateStatus({
        state: 'synced',
        isConnected: true,
        telemetry: {
          lastSyncedAt: now,
          pendingMutations: 0,
          lastError: undefined,
          encrypted: false,
        },
      });

      await this.saveStorageState({
        syncEnabled: true,
        lastSyncedAt: now,
        lastVaultFileId: vaultFileId,
        lastError: undefined,
      });

      return {
        success: true,
        timestamp: now,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected sync error.';
      this.updateStatus({
        state: 'error',
        telemetry: {
          ...this.status.telemetry,
          lastError: message,
        },
      });
      await this.saveStorageState({ lastError: message });
      return {
        success: false,
        error: message,
        timestamp: Date.now(),
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Subscribes to reactive sync status changes.
   */
  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    callback({
      state: this.status.state,
      isConnected: this.status.isConnected,
      telemetry: { ...this.status.telemetry },
    });

    return () => {
      this.listeners.delete(callback);
    };
  }
}

/** Singleton instance for Pro sync subsystem */
export const syncEngine = new SyncEngine();
