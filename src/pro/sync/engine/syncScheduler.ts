/**
 * TabBellus Pro Background Sync Scheduler
 *
 * Owns automatic sync scheduling exclusively within the background service worker:
 * - 3s in-memory debounce timer + 0.5-min native alarm (tabbellus-sync-debounce)
 * - 30-min periodic background pull alarm (tabbellus-sync-periodic)
 * - Persistent dirty state in chrome.storage.session (tabbellus_sync_dirty)
 * - Anti-echo and gate guards: zero network egress for Free, disconnected, or locked states
 *
 * ZERO-DOM & ZERO-REACT GUARANTEE:
 * Must never import React, JSX, document, window, or Zustand stores (@/store/*).
 */

import { contractRegistry } from '@/core/contracts/registry';
import type { LicensingContract } from '@/core/contracts';
import { proLicensingEngine } from '@/pro/licensing';
import { syncEngine as defaultSyncEngine, SyncEngine } from './syncEngine';
import { sessionKeyStore } from '../crypto';
import type { SyncStorageState } from './types';

export const DIRTY_SESSION_KEY = 'tabbellus_sync_dirty';
export const DEBOUNCE_ALARM_NAME = 'tabbellus-sync-debounce';
export const PERIODIC_ALARM_NAME = 'tabbellus-sync-periodic';
const SYNC_STORAGE_KEY = 'tabbellus_sync_state';

export interface SyncSchedulerOptions {
  syncEngine?: SyncEngine;
  licensingEngine?: LicensingContract;
  autoSyncDebounceMs?: number;
  debounceAlarmDelayMinutes?: number;
  periodicAlarmPeriodMinutes?: number;
}

export class SyncScheduler {
  private syncEngine: SyncEngine;
  private licensingEngine: LicensingContract;
  private autoSyncDebounceMs: number;
  private debounceAlarmDelayMinutes: number;
  private periodicAlarmPeriodMinutes: number;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private mutationUnsubscribe: (() => void) | null = null;
  private lockOrDisconnectUnsubscribe: (() => void) | null = null;
  private alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null;
  private startupListener: (() => void) | null = null;
  private installedListener: ((details: { reason: string }) => void) | null = null;

  constructor(options: SyncSchedulerOptions = {}) {
    this.syncEngine = options.syncEngine ?? defaultSyncEngine;
    this.licensingEngine = options.licensingEngine ?? proLicensingEngine;
    this.autoSyncDebounceMs = options.autoSyncDebounceMs ?? 3000;
    this.debounceAlarmDelayMinutes = options.debounceAlarmDelayMinutes ?? 0.5;
    this.periodicAlarmPeriodMinutes = options.periodicAlarmPeriodMinutes ?? 30;
  }

  /**
   * Registers all background scheduler event listeners synchronously without awaiting storage.
   * Called at the top level of the service worker during module evaluation to ensure
   * events that wake the worker (alarms, onStartup, onInstalled, local mutations) are never missed.
   */
  registerListeners(): void {
    // 1. Subscribe to local domain mutations
    if (!this.mutationUnsubscribe) {
      this.mutationUnsubscribe = contractRegistry.subscribeLocalMutation(() => {
        this.markDirty();
      });
    }

    // 1b. Listen to lock/disconnect events on the sync engine
    if (!this.lockOrDisconnectUnsubscribe && this.syncEngine.onLockOrDisconnect) {
      this.lockOrDisconnectUnsubscribe = this.syncEngine.onLockOrDisconnect(() => {
        this.cancelDebounce();
      });
    }

    // 2. Register Chrome alarms listener
    if (typeof chrome !== 'undefined' && chrome.alarms?.onAlarm) {
      if (!this.alarmListener) {
        this.alarmListener = async (alarm: chrome.alarms.Alarm) => {
          await this.syncEngine.ready;
          if (alarm.name === DEBOUNCE_ALARM_NAME) {
            await this.runDebouncedCycle('alarm');
          } else if (alarm.name === PERIODIC_ALARM_NAME) {
            await this.runPeriodicCycle();
          }
        };
        chrome.alarms.onAlarm.addListener(this.alarmListener);
      }
    }

    // 3. Register Chrome startup listener
    if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
      if (!this.startupListener) {
        this.startupListener = async () => {
          await this.syncEngine.ready;
          await this.recheckAlarms();
          const check = await this.canSync();
          if (check.eligible) {
            try {
              await this.syncEngine.syncNow({ silent: true });
            } catch {
              // Best-effort startup sync
            }
          }
        };
        chrome.runtime.onStartup.addListener(this.startupListener);
      }
    }

    // 4. Register Chrome installed listener (for update reason)
    if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
      if (!this.installedListener) {
        this.installedListener = async (details: { reason: string }) => {
          if (details.reason === 'update') {
            await this.syncEngine.ready;
            await this.recheckAlarms();
            const check = await this.canSync();
            if (check.eligible) {
              try {
                await this.syncEngine.syncNow({ silent: true });
              } catch {
                // Best-effort update sync
              }
            }
          }
        };
        chrome.runtime.onInstalled.addListener(this.installedListener);
      }
    }
  }

  /**
   * Initializes background scheduler event listeners and periodic alarm state.
   */
  async init(): Promise<void> {
    this.registerListeners();
    await this.recheckAlarms();
  }

  /**
   * Cleans up all registered listeners, active timers, and alarms.
   */
  dispose(): void {
    if (this.mutationUnsubscribe) {
      this.mutationUnsubscribe();
      this.mutationUnsubscribe = null;
    }

    if (this.lockOrDisconnectUnsubscribe) {
      this.lockOrDisconnectUnsubscribe();
      this.lockOrDisconnectUnsubscribe = null;
    }

    this.cancelDebounce();

    if (typeof chrome !== 'undefined') {
      if (this.alarmListener && chrome.alarms?.onAlarm) {
        chrome.alarms.onAlarm.removeListener(this.alarmListener);
        this.alarmListener = null;
      }
      if (this.startupListener && chrome.runtime?.onStartup) {
        chrome.runtime.onStartup.removeListener?.(this.startupListener);
        this.startupListener = null;
      }
      if (this.installedListener && chrome.runtime?.onInstalled) {
        chrome.runtime.onInstalled.removeListener?.(this.installedListener);
        this.installedListener = null;
      }
    }
  }

  /**
   * Cancels any pending in-memory debounce timer and native debounce alarm.
   */
  cancelDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (typeof chrome !== 'undefined' && chrome.alarms?.clear) {
      chrome.alarms.clear(DEBOUNCE_ALARM_NAME).catch(() => {});
    }
  }

  /**
   * Evaluates eligibility gates before any network or OAuth calls:
   * 1. User must be entitled to Pro tier.
   * 2. syncEnabled must be true in persistent storage.
   * 3. Encrypted vaults must not be in a locked state.
   */
  async canSync(): Promise<{ eligible: boolean; locked?: boolean }> {
    try {
      // 1. Pro Entitlement Gate
      const entitlement = await this.licensingEngine.getEntitlement();
      if (!entitlement?.isPro) {
        return { eligible: false };
      }

      // 2. Sync Enabled Gate
      const storageState = await this.loadStorageState();
      if (!storageState?.syncEnabled) {
        return { eligible: false };
      }

      // 3. Vault Lock Gate
      if (storageState?.isEncrypted) {
        const isUnlocked = await sessionKeyStore.isUnlocked();
        if (!isUnlocked) {
          return { eligible: false, locked: true };
        }
      }

      const status = await this.syncEngine.getStatus();
      if (status.state === 'locked') {
        return { eligible: false, locked: true };
      }

      return { eligible: true };
    } catch {
      return { eligible: false };
    }
  }

  /**
   * Marks synchronization dirty in response to local mutations:
   * - Sets session storage dirty flag immediately
   * - Restarts 3s in-memory timer
   * - Creates/resets 0.5-min debounce alarm immediately
   * - Must work before engine readiness; cycles themselves await readiness.
   */
  async markDirty(): Promise<void> {
    // 1. Restart in-memory debounce timer (3s) synchronously
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.runDebouncedCycle('timer');
    }, this.autoSyncDebounceMs);

    // 2. Set persistent dirty flag in session storage immediately
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.set({ [DIRTY_SESSION_KEY]: true });
      } catch {
        // Fallback
      }
    }

    // 3. Create or reset native debounce alarm (0.5m) immediately without waiting for readiness
    if (typeof chrome !== 'undefined' && chrome.alarms?.create) {
      try {
        await chrome.alarms.create(DEBOUNCE_ALARM_NAME, {
          delayInMinutes: this.debounceAlarmDelayMinutes,
        });
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Executes a debounced sync cycle triggered by in-memory timer or native alarm:
   * - Awaits engine readiness before checking gates or executing cycles
   * - Only runs if dirty flag is true in session storage
   * - Clears dirty flag at START of cycle (anti-lost-update invariant)
   * - Clears debounce alarm and timer
   * - Re-sets dirty flag if cycle fails
   */
  async runDebouncedCycle(_source: 'timer' | 'alarm'): Promise<void> {
    await this.syncEngine.ready;
    // 1. Verify dirty flag
    let isDirty = false;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const res = await chrome.storage.session.get(DIRTY_SESSION_KEY);
        isDirty = Boolean(res[DIRTY_SESSION_KEY]);
      } catch {
        isDirty = false;
      }
    }

    if (!isDirty) {
      return;
    }

    // 2. Anti-lost-update invariant: clear dirty flag at START of cycle
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        await chrome.storage.session.remove(DIRTY_SESSION_KEY);
      } catch {
        // Best-effort
      }
    }

    // 3. Clear debounce alarm and in-memory timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (typeof chrome !== 'undefined' && chrome.alarms?.clear) {
      try {
        await chrome.alarms.clear(DEBOUNCE_ALARM_NAME);
      } catch {
        // Best-effort
      }
    }

    // 4. Validate gates before executing network calls
    const check = await this.canSync();
    if (!check.eligible) {
      if (check.locked) {
        this.syncEngine.setLockedStatus?.();
      }
      return;
    }

    // 5. Execute sync cycle
    try {
      const result = await this.syncEngine.syncNow({ silent: true });
      if (!result.success) {
        // Re-set dirty flag on failure so subsequent cycle retries
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          await chrome.storage.session.set({ [DIRTY_SESSION_KEY]: true });
        }
      }
    } catch {
      // Re-set dirty flag on exception
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        await chrome.storage.session.set({ [DIRTY_SESSION_KEY]: true });
      }
    }
  }

  /**
   * Executes a periodic sync cycle.
   */
  async runPeriodicCycle(): Promise<void> {
    await this.syncEngine.ready;
    const check = await this.canSync();
    if (!check.eligible) {
      await this.recheckAlarms();
      return;
    }

    try {
      await this.syncEngine.syncNow({ silent: true });
    } catch {
      // Best effort periodic sync
    }
  }

  /**
   * Harmonizes periodic alarm schedule with current entitlement and sync state.
   */
  async recheckAlarms(): Promise<void> {
    await this.syncEngine.ready;
    const check = await this.canSync();
    if (check.eligible) {
      if (typeof chrome !== 'undefined' && chrome.alarms?.create) {
        try {
          await chrome.alarms.create(PERIODIC_ALARM_NAME, {
            periodInMinutes: this.periodicAlarmPeriodMinutes,
          });
        } catch {
          // Best-effort
        }
      }
    } else {
      if (typeof chrome !== 'undefined' && chrome.alarms?.clear) {
        try {
          await chrome.alarms.clear(PERIODIC_ALARM_NAME);
        } catch {
          // Best-effort
        }
      }
    }
  }

  private async loadStorageState(): Promise<SyncStorageState> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
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
            pendingEncryptionUpgrade:
              typeof raw.pendingEncryptionUpgrade === 'boolean' ? raw.pendingEncryptionUpgrade : undefined,
          };
        }
      }
    } catch {
      // Fall through
    }
    return { syncEnabled: false };
  }
}

export const syncScheduler = new SyncScheduler();
