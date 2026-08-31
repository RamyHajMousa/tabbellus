/**
 * TabBellus Core Sync Status Hook
 *
 * Reactive hook querying the active sync provider via ContractRegistry.
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

let cachedSnapshot: UseSyncStatusResult | null = null;
let lastSourceSnapshot: SyncStatus | null = null;

function getSnapshot(): UseSyncStatusResult {
  try {
    const raw = contractRegistry.getSyncStatus();
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

export function useSyncStatus(): UseSyncStatusResult {
  return useSyncExternalStore(
    (callback) => contractRegistry.subscribeSync(callback),
    getSnapshot,
    getSnapshot,
  );
}
