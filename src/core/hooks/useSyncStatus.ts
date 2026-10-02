/**
 * TabBellus Core Sync Status Hook
 *
 * Reactive hook querying the active sync provider via ContractRegistry
 * and the live session status mirror in `chrome.storage.session` ('tabbellus_sync_live_status').
 * Uses `useSyncExternalStore` for tear-free, concurrent-safe, zero-flash rendering.
 * Ensures zero direct dependency on Pro modules, guaranteed fail-open behavior,
 * and automatic real-time updates when sync status transitions occur.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact ONLY through this hook and contracts.
 * - This file MUST NOT import anything from `src/pro/`.
 */

import { useSyncExternalStore } from 'react';
import type { SyncState, SyncStatus, SyncTelemetry } from '../contracts/sync';
import { contractRegistry } from '../contracts/registry';

export interface UseSyncStatusResult {
  state: SyncState;
  isConnected: boolean;
  telemetry: SyncTelemetry;
  loading: boolean;
}

const DEFAULT_FAIL_OPEN_STATUS: UseSyncStatusResult = {
  state: 'idle',
  isConnected: false,
  telemetry: {
    pendingMutations: 0,
    encrypted: false,
  },
  loading: false,
};

const SESSION_STATUS_KEY = 'tabbellus_sync_live_status';
let sessionMirrorStatus: SyncStatus | null = null;
let cachedSnapshot: UseSyncStatusResult | null = null;
let lastSourceSnapshot: SyncStatus | null = null;
const subscribers = new Set<() => void>();
let isStorageSubscribed = false;

function notifySubscribers(): void {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // Prevent subscriber error from breaking loop
    }
  });
}

function ensureStorageSubscription(): void {
  if (isStorageSubscribed) return;

  if (typeof chrome !== 'undefined' && chrome.storage) {
    if (chrome.storage.session) {
      chrome.storage.session
        .get(SESSION_STATUS_KEY)
        .then((res) => {
          const val = res[SESSION_STATUS_KEY] as SyncStatus | undefined;
          if (val && typeof val === 'object') {
            sessionMirrorStatus = val;
            notifySubscribers();
          }
        })
        .catch(() => {});
    }

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'session' && changes[SESSION_STATUS_KEY]) {
          const newVal = changes[SESSION_STATUS_KEY].newValue as SyncStatus | undefined;
          sessionMirrorStatus = newVal && typeof newVal === 'object' ? newVal : null;
          notifySubscribers();
        }
      });
      isStorageSubscribed = true;
    }
  }
}

function getSnapshot(): UseSyncStatusResult {
  try {
    const raw = sessionMirrorStatus ?? contractRegistry.getSyncStatus();
    if (
      !cachedSnapshot ||
      !lastSourceSnapshot ||
      raw.state !== lastSourceSnapshot.state ||
      raw.isConnected !== lastSourceSnapshot.isConnected ||
      raw.telemetry?.lastSyncedAt !== lastSourceSnapshot.telemetry?.lastSyncedAt ||
      raw.telemetry?.pendingMutations !== lastSourceSnapshot.telemetry?.pendingMutations ||
      raw.telemetry?.lastError !== lastSourceSnapshot.telemetry?.lastError ||
      raw.telemetry?.encrypted !== lastSourceSnapshot.telemetry?.encrypted
    ) {
      lastSourceSnapshot = raw;
      cachedSnapshot = {
        state: raw.state ?? 'idle',
        isConnected: Boolean(raw.isConnected),
        telemetry: {
          lastSyncedAt: raw.telemetry?.lastSyncedAt,
          pendingMutations: raw.telemetry?.pendingMutations ?? 0,
          lastError: raw.telemetry?.lastError,
          encrypted: Boolean(raw.telemetry?.encrypted),
        },
        loading: false,
      };
    }
    return cachedSnapshot;
  } catch {
    return DEFAULT_FAIL_OPEN_STATUS;
  }
}

function subscribe(callback: () => void): () => void {
  ensureStorageSubscription();
  subscribers.add(callback);

  const unsubscribeRegistry = contractRegistry.subscribeSync(() => {
    callback();
  });

  return () => {
    subscribers.delete(callback);
    unsubscribeRegistry();
  };
}

export function useSyncStatus(): UseSyncStatusResult {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Testing helper to reset module-level session mirror state */
export function _resetSyncStatusSessionMirror(): void {
  sessionMirrorStatus = null;
  cachedSnapshot = null;
  lastSourceSnapshot = null;
}
