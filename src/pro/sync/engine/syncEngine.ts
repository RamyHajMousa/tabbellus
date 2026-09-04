/**
 * Google Drive Sync Engine
 *
 * Implements `SyncProvider` to orchestrate cloud synchronization between
 * local Dexie IndexedDB and Google Drive appDataFolder with client-side
 * Zero-Knowledge End-to-End Encryption (E2EE) support.
 *
 * LIFECYCLE:
 * 1. `connect()`: Requests OAuth2 token and enables cloud sync.
 * 2. `disconnect()`: Revokes OAuth2 token and disables cloud sync.
 * 3. `syncNow()`: Orchestrates download -> decrypt -> LWW diff -> local write -> encrypt -> upload -> status update.
 * 4. `subscribe()`: Dispatches reactive telemetry and state updates.
 * 5. `setupEncryption(passphrase)`: Derives key, saves session, and triggers full encrypted upload.
 * 6. `unlockVault(passphrase)`: Derives key, verifies decryption, saves session, and triggers sync.
 * 7. `lockVault()`: Clears active session key, pauses sync, and transitions state to 'locked'.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Implements `@/core/contracts/sync.ts` interface.
 * - Free Core never imports this class directly; it attaches via ContractRegistry.
 */

import type {
  SyncProvider,
  SyncStatus,
  SyncResult,
  SyncOptions,
} from '@/core/contracts/sync';
import { contractRegistry } from '@/core/contracts/registry';
import { googleAuthClient } from '../api/googleAuthClient';
import { googleDriveClient } from '../api/googleDriveClient';
import type { VaultPayload } from '../api/types';
import {
  WebCryptoEngine,
  sessionKeyStore,
  CryptoEngineError,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../crypto';
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
  private autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_SYNC_DEBOUNCE_MS = 3000;
  private mutationUnsubscribe: (() => void) | null = null;
  private rateLimitResetAt = 0;

  constructor() {
    this.initFromStorage();
    this.mutationUnsubscribe = contractRegistry.subscribeLocalMutation(() => this.handleLocalMutation());
  }

  /**
   * Initializes sync state and encryption lock state from local storage.
   */
  private async initFromStorage(): Promise<void> {
    try {
      const state = await this.loadStorageState();
      if (state.syncEnabled) {
        this.status.isConnected = true;
        this.status.telemetry.lastSyncedAt = state.lastSyncedAt;
        this.status.telemetry.lastError = state.lastError;
      }
      if (state.isEncrypted) {
        this.status.telemetry.encrypted = true;
        const isUnlocked = await sessionKeyStore.isUnlocked();
        if (!isUnlocked) {
          this.status.state = 'locked';
        }
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
          isEncrypted: typeof raw.isEncrypted === 'boolean' ? raw.isEncrypted : undefined,
          vaultSalt: typeof raw.vaultSalt === 'string' ? raw.vaultSalt : undefined,
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

    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
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
   * Disposes the sync engine, cancelling active timers and unregistering mutation listeners.
   */
  dispose(): void {
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    if (this.mutationUnsubscribe) {
      this.mutationUnsubscribe();
      this.mutationUnsubscribe = null;
    }
  }

  /**
   * Sets up end-to-end encryption with the provided passphrase and immediately
   * uploads the current snapshot as an encrypted vault.
   */
  async setupEncryption(passphrase: string): Promise<void> {
    return this.withSyncLock(
      'setupEncryption',
      async () => {
        const saltBytes = WebCryptoEngine.generateSalt();
        const saltBase64 = uint8ArrayToBase64(saltBytes);
        const key = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);

        await sessionKeyStore.saveSession(key, saltBase64);
        await this.saveStorageState({
          isEncrypted: true,
          vaultSalt: saltBase64,
        });

        this.updateStatus({
          telemetry: {
            ...this.status.telemetry,
            encrypted: true,
          },
        });

        await this.executeSync({ forceFull: true });
      },
      () => undefined,
    );
  }

  /**
   * Disables end-to-end encryption, purging active session keys, reverting storage
   * state to unencrypted, and forcing a full unencrypted sync upload.
   */
  async disableEncryption(): Promise<void> {
    return this.withSyncLock(
      'disableEncryption',
      async () => {
        if (!this.status.isConnected) {
          return;
        }

        // 1. Purge active encryption keys
        await sessionKeyStore.clearSession();

        // 2. Reset storage state
        await this.saveStorageState({
          isEncrypted: false,
          vaultSalt: undefined,
          lastError: undefined,
        });

        // 3. Update in-memory telemetry immediately
        this.updateStatus({
          telemetry: {
            ...this.status.telemetry,
            encrypted: false,
            lastError: undefined,
          },
        });

        // 4. Force a full sync upload without encryption
        await this.executeSync({ forceFull: true, forceUnencrypted: true });

        // 5. Transition state to 'synced' and notify subscribers
        this.updateStatus({
          state: 'synced',
          telemetry: {
            ...this.status.telemetry,
            encrypted: false,
            lastError: undefined,
          },
        });
      },
      () => undefined,
    );
  }

  /**
   * Resets the cloud vault to unencrypted state by clearing local keys,
   * resetting storage state, and triggering a full unencrypted sync upload.
   */
  async resetCloudVault(): Promise<void> {
    return this.withSyncLock(
      'resetCloudVault',
      async () => {
        await sessionKeyStore.clearSession();
        await this.saveStorageState({
          isEncrypted: false,
          vaultSalt: undefined,
          lastError: undefined,
        });

        this.updateStatus({
          telemetry: {
            ...this.status.telemetry,
            encrypted: false,
            lastError: undefined,
          },
        });

        await this.executeSync({ forceFull: true, forceUnencrypted: true });

        this.updateStatus({
          state: 'synced',
          telemetry: {
            ...this.status.telemetry,
            encrypted: false,
            lastError: undefined,
          },
        });
      },
      () => undefined,
    );
  }

  /**
   * Unlocks an encrypted vault using the provided passphrase.
   * Verifies against remote ciphertext if available, caches key, and resumes sync.
   */
  async unlockVault(passphrase: string): Promise<boolean> {
    let saltBase64 = (await this.loadStorageState()).vaultSalt;
    let remoteEncryptedPayload: VaultPayload | null = null;

    // Check remote vault file to obtain or verify salt
    try {
      const findResult = await googleDriveClient.findVaultFile(VAULT_FILE_NAME);
      if (findResult.success && findResult.data.files.length > 0) {
        const fileId = findResult.data.files[0].id;
        const downloadResult = await googleDriveClient.downloadVaultFile(fileId);
        if (downloadResult.success) {
          const raw = downloadResult.data as VaultPayload;
          if (raw && typeof raw.payload === 'string') {
            remoteEncryptedPayload = raw;
            if (raw.salt) {
              saltBase64 = raw.salt;
              await this.saveStorageState({ vaultSalt: saltBase64, isEncrypted: true });
            }
          }
        }
      }
    } catch {
      // Best effort remote check
    }

    if (!saltBase64) {
      return false;
    }

    let candidateKey: CryptoKey;
    try {
      const saltBytes = base64ToUint8Array(saltBase64);
      candidateKey = await WebCryptoEngine.deriveKeyFromPassphrase(passphrase, saltBytes);
    } catch {
      return false;
    }

    // Verify passphrase correctness against remote payload if available
    if (remoteEncryptedPayload?.iv && remoteEncryptedPayload?.payload) {
      try {
        await WebCryptoEngine.decryptPayload(
          {
            version: 1,
            salt: remoteEncryptedPayload.salt ?? saltBase64,
            iv: remoteEncryptedPayload.iv,
            ciphertext: remoteEncryptedPayload.payload,
            iterations: 600_000,
          },
          candidateKey
        );
      } catch (err: unknown) {
        if (err instanceof CryptoEngineError && err.code === 'INVALID_PASSPHRASE') {
          return false;
        }
        return false;
      }
    }

    // Passphrase is valid: save session, update state, and trigger sync
    await sessionKeyStore.saveSession(candidateKey, saltBase64);
    await this.saveStorageState({
      isEncrypted: true,
      vaultSalt: saltBase64,
      lastError: undefined,
    });

    this.updateStatus({
      state: 'idle',
      telemetry: {
        ...this.status.telemetry,
        encrypted: true,
        lastError: undefined,
      },
    });

    await this.syncNow();
    return true;
  }

  /**
   * Locks the active vault by wiping session keys and entering 'locked' state.
   */
  async lockVault(): Promise<void> {
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    await sessionKeyStore.clearSession();
    this.updateStatus({
      state: 'locked',
      telemetry: {
        ...this.status.telemetry,
        encrypted: true,
      },
    });
  }

  /**
   * Cross-Context Web Lock Mutex
   *
   * Coordinates access to cloud synchronization across multiple extension contexts
   * (e.g. sidepanel, background worker, popup) using the Web Locks API ('tabbellus_sync_vault')
   * with a re-entrant safe in-memory fallback.
   */
  private async withSyncLock<T>(
    operationName: string,
    action: () => Promise<T>,
    onContention: () => T,
  ): Promise<T> {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.locks?.request === 'function'
    ) {
      return await navigator.locks.request(
        'tabbellus_sync_vault',
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            console.debug(
              `[SyncEngine] Skipping ${operationName}: lock held by another context`,
            );
            return onContention();
          }
          this.isSyncing = true;
          try {
            return await action();
          } finally {
            this.isSyncing = false;
          }
        },
      );
    }

    // Fallback Path (In-Memory Mutex)
    if (this.isSyncing) {
      console.debug(
        `[SyncEngine] Skipping ${operationName}: sync already in progress`,
      );
      return onContention();
    }

    this.isSyncing = true;
    try {
      return await action();
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Handles local domain mutations by debouncing an automatic synchronization cycle.
   */
  private handleLocalMutation(): void {
    if (!this.status.isConnected || this.status.state === 'locked') {
      return;
    }

    if (Date.now() < this.rateLimitResetAt) {
      console.debug('[SyncEngine] Skipping debounced auto-sync: rate limit cooldown active');
      return;
    }

    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }

    this.autoSyncTimer = setTimeout(async () => {
      this.autoSyncTimer = null;
      if (Date.now() < this.rateLimitResetAt) {
        return;
      }
      try {
        await this.syncNow({ silent: true });
      } catch (err) {
        console.debug('[SyncEngine] Background auto-sync skipped:', err);
      }
    }, this.AUTO_SYNC_DEBOUNCE_MS);
  }

  /**
   * Executes a full synchronization cycle.
   */
  async syncNow(options?: SyncOptions): Promise<SyncResult> {
    if (Date.now() < this.rateLimitResetAt) {
      const waitSeconds = Math.ceil((this.rateLimitResetAt - Date.now()) / 1000);
      return {
        success: false,
        error: `Google Drive rate limit cooldown active (${waitSeconds}s remaining).`,
        timestamp: Date.now(),
      };
    }

    return this.withSyncLock(
      'syncNow',
      async () => this.executeSync(options),
      () => ({
        success: false,
        error: 'Sync already in progress.',
        timestamp: Date.now(),
      }),
    );
  }

  /**
   * Internal execution body for synchronization cycle.
   * Runs under withSyncLock to guarantee process-exclusive execution.
   */
  private async executeSync(
    options?: SyncOptions & { forceUnencrypted?: boolean },
  ): Promise<SyncResult> {
    if (Date.now() < this.rateLimitResetAt && !options?.forceFull) {
      return {
        success: false,
        error: 'Rate limit active. Please wait before syncing.',
        timestamp: Date.now(),
      };
    }

    this.updateStatus({ state: 'syncing' });

    try {
      // Fast-fail if local vault is known to be encrypted and currently locked
      const initialStorage = await this.loadStorageState();
      const isInitiallyUnlocked = await sessionKeyStore.isUnlocked();
      if (initialStorage.isEncrypted && !isInitiallyUnlocked) {
        this.updateStatus({
          state: 'locked',
          telemetry: {
            ...this.status.telemetry,
            encrypted: true,
          },
        });
        return {
          success: false,
          error: 'Vault is locked. Passphrase required.',
          timestamp: Date.now(),
        };
      }
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
        if (findResult.rateLimited) {
          this.rateLimitResetAt = Date.now() + (findResult.retryAfterSeconds ?? 60) * 1000;
          this.updateStatus({
            state: 'error',
            telemetry: {
              ...this.status.telemetry,
              lastError: 'Google Drive rate limit exceeded. Backing off.',
            },
          });
          await this.saveStorageState({ lastError: 'Google Drive rate limit exceeded. Backing off.' });
        } else {
          const state = findResult.authExpired ? 'error' : 'offline';
          this.updateStatus({
            state,
            telemetry: {
              ...this.status.telemetry,
              lastError: findResult.error,
            },
          });
          await this.saveStorageState({ lastError: findResult.error });
        }
        return {
          success: false,
          error: findResult.error,
          timestamp: Date.now(),
        };
      }

      let remoteSnapshot: SyncVaultSnapshot | null = null;
      let vaultFileId: string | undefined = findResult.data.files.length > 0 ? findResult.data.files[0].id : undefined;
      const vaultExists = Boolean(vaultFileId);

      // Step 3: Download and decrypt remote snapshot if it exists
      if (vaultExists && !options?.forceUnencrypted) {
        const downloadResult = await googleDriveClient.downloadVaultFile(vaultFileId!);
        if (!downloadResult.success) {
          console.error(
            '[SyncEngine] Remote vault exists but download failed. Aborting sync cycle to prevent remote clobbering:',
            downloadResult.error,
          );

          if (downloadResult.rateLimited) {
            this.rateLimitResetAt = Date.now() + (downloadResult.retryAfterSeconds ?? 60) * 1000;
            this.updateStatus({
              state: 'error',
              telemetry: {
                ...this.status.telemetry,
                lastError: downloadResult.error,
              },
            });
            await this.saveStorageState({ lastError: downloadResult.error });
          } else if (downloadResult.authExpired) {
            this.updateStatus({
              state: 'error',
              isConnected: false,
              telemetry: {
                ...this.status.telemetry,
                lastError: downloadResult.error,
              },
            });
            await this.saveStorageState({ lastError: downloadResult.error });
          } else {
            this.updateStatus({
              state: 'offline',
              telemetry: {
                ...this.status.telemetry,
                lastError: downloadResult.error,
              },
            });
            await this.saveStorageState({ lastError: downloadResult.error });
          }

          return {
            success: false,
            error: downloadResult.error ?? 'FAILED_REMOTE_DOWNLOAD',
            timestamp: Date.now(),
          };
        }

          const raw = downloadResult.data as unknown as Record<string, unknown> | null;

          let potentialPayload: VaultPayload | null = null;
          if (raw && typeof raw === 'object' && typeof (raw as { payload?: unknown }).payload === 'string') {
            potentialPayload = raw as unknown as VaultPayload;
          } else if (SnapshotSerializer.validateSnapshot(raw)) {
            remoteSnapshot = raw as unknown as SyncVaultSnapshot;
          }

          if (potentialPayload) {
            const isRemoteEncrypted = Boolean(
              potentialPayload.isEncrypted ||
              (potentialPayload.iv && potentialPayload.salt)
            );

            if (isRemoteEncrypted) {
              const salt = potentialPayload.salt;
              await this.saveStorageState({
                isEncrypted: true,
                ...(salt ? { vaultSalt: salt } : {}),
              });

              const isUnlocked = await sessionKeyStore.isUnlocked();
              if (!isUnlocked) {
                this.updateStatus({
                  state: 'locked',
                  isConnected: true,
                  telemetry: {
                    ...this.status.telemetry,
                    encrypted: true,
                  },
                });
                return {
                  success: false,
                  error: 'Vault is locked. Passphrase required.',
                  timestamp: Date.now(),
                };
              }

              const session = await sessionKeyStore.loadSession();
              if (!session) {
                this.updateStatus({
                  state: 'locked',
                  isConnected: true,
                  telemetry: {
                    ...this.status.telemetry,
                    encrypted: true,
                  },
                });
                return {
                  success: false,
                  error: 'Vault is locked. Passphrase required.',
                  timestamp: Date.now(),
                };
              }

              try {
                const decryptedStr = await WebCryptoEngine.decryptPayload(
                  {
                    version: 1,
                    salt: potentialPayload.salt ?? session.salt,
                    iv: potentialPayload.iv!,
                    ciphertext: potentialPayload.payload,
                    iterations: 600_000,
                  },
                  session.key
                );
                const parsed = JSON.parse(decryptedStr);
                if (SnapshotSerializer.validateSnapshot(parsed)) {
                  remoteSnapshot = parsed;
                }
              } catch (err: unknown) {
                if (err instanceof CryptoEngineError && err.code === 'INVALID_PASSPHRASE') {
                  this.updateStatus({
                    state: 'error',
                    telemetry: {
                      ...this.status.telemetry,
                      encrypted: true,
                      lastError: 'INVALID_PASSPHRASE',
                    },
                  });
                  await this.saveStorageState({ lastError: 'INVALID_PASSPHRASE' });
                  return {
                    success: false,
                    error: 'INVALID_PASSPHRASE',
                    timestamp: Date.now(),
                  };
                }
                const msg = err instanceof Error ? err.message : 'Decryption failed';
                this.updateStatus({
                  state: 'error',
                  telemetry: {
                    ...this.status.telemetry,
                    encrypted: true,
                    lastError: msg,
                  },
                });
                await this.saveStorageState({ lastError: msg });
                return {
                  success: false,
                  error: msg,
                  timestamp: Date.now(),
                };
              }
            } else {
              // Legacy unencrypted payload
              try {
                const parsed = JSON.parse(potentialPayload.payload);
                if (SnapshotSerializer.validateSnapshot(parsed)) {
                  remoteSnapshot = parsed;
                }
              } catch {
                // Ignore corrupt payload
              }
            }
          }

          // Safety gate: If a remote vault exists on Google Drive but could not be parsed into a valid remoteSnapshot,
          // abort sync cycle to prevent treating as initial upload and clobbering the remote vault.
          if (!remoteSnapshot) {
            const errorMsg = 'Remote vault payload is corrupt or invalid.';
            console.warn('[SyncEngine]', errorMsg, 'Aborting sync cycle immediately.');
            this.updateStatus({
              state: 'error',
              telemetry: {
                ...this.status.telemetry,
                lastError: errorMsg,
              },
            });
            await this.saveStorageState({ lastError: errorMsg });
            return {
              success: false,
              error: errorMsg,
              timestamp: Date.now(),
            };
          }
        }

      // Step 4: Create local snapshot
      const deviceId = await getOrCreateInstanceId();
      const localSnapshot = await SnapshotSerializer.createLocalSnapshot(deviceId);

      // Step 5: Reconcile snapshots using Record-Level LWW DiffEngine
      const currentStorageForSync = await this.loadStorageState();
      const reconciliation = DiffEngine.reconcile(
        localSnapshot,
        remoteSnapshot,
        deviceId,
        currentStorageForSync.lastSyncedAt ?? 0,
      );

      // Step 6: Apply incoming remote updates to Dexie if local changes exist
      if (reconciliation.hasLocalChanges) {
        await SnapshotSerializer.applyRemoteUpdates(reconciliation.localUpdates);
      }

      // Step 7: Upload reconciled merged snapshot to Drive if remote changes exist
      if (reconciliation.hasRemoteChanges || options?.forceFull) {
        const currentStorage = await this.loadStorageState();
        const hasUnlockedSession = await sessionKeyStore.isUnlocked();
        const shouldEncrypt = Boolean(
          !options?.forceUnencrypted && (currentStorage.isEncrypted || hasUnlockedSession)
        );

        let uploadContent: string;

        if (shouldEncrypt) {
          const session = await sessionKeyStore.loadSession();
          if (!session) {
            this.updateStatus({
              state: 'locked',
              telemetry: {
                ...this.status.telemetry,
                encrypted: true,
              },
            });
            return {
              success: false,
              error: 'Vault is locked. Cannot encrypt changes without unlocked session.',
              timestamp: Date.now(),
            };
          }

          const jsonStr = JSON.stringify(reconciliation.mergedSnapshot);
          const saltBytes = base64ToUint8Array(session.salt);
          const envelope = await WebCryptoEngine.encryptPayload(jsonStr, session.key, saltBytes);

          const vaultContent: VaultPayload = {
            schemaVersion: '2.0.0-e2ee',
            clientTimestamp: new Date().toISOString(),
            payload: envelope.ciphertext,
            iv: envelope.iv,
            salt: envelope.salt,
            isEncrypted: true,
          };
          uploadContent = JSON.stringify(vaultContent);
        } else {
          const jsonStr = JSON.stringify(reconciliation.mergedSnapshot);
          const vaultContent: VaultPayload = {
            schemaVersion: '1.0.0',
            clientTimestamp: new Date().toISOString(),
            payload: jsonStr,
            isEncrypted: false,
          };
          uploadContent = JSON.stringify(vaultContent);
        }

        const uploadResult = await googleDriveClient.uploadVaultFile(
          uploadContent,
          vaultFileId,
          VAULT_FILE_NAME,
        );

        if (!uploadResult.success) {
          if (uploadResult.rateLimited) {
            this.rateLimitResetAt = Date.now() + (uploadResult.retryAfterSeconds ?? 60) * 1000;
            this.updateStatus({
              state: 'error',
              telemetry: {
                ...this.status.telemetry,
                lastError: 'Google Drive rate limit exceeded. Backing off.',
              },
            });
            await this.saveStorageState({ lastError: 'Google Drive rate limit exceeded. Backing off.' });
          } else {
            const state = uploadResult.authExpired ? 'error' : 'offline';
            this.updateStatus({
              state,
              telemetry: {
                ...this.status.telemetry,
                lastError: uploadResult.error,
              },
            });
            await this.saveStorageState({ lastError: uploadResult.error });
          }
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
      const finalStorage = await this.loadStorageState();
      const isEncrypted = Boolean(finalStorage.isEncrypted || (await sessionKeyStore.isUnlocked()));

      this.updateStatus({
        state: 'synced',
        isConnected: true,
        telemetry: {
          lastSyncedAt: now,
          pendingMutations: 0,
          lastError: undefined,
          encrypted: isEncrypted,
        },
      });

      await this.saveStorageState({
        syncEnabled: true,
        lastSyncedAt: now,
        lastVaultFileId: vaultFileId,
        lastError: undefined,
        isEncrypted,
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
