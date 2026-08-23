/**
 * TabBellus Core Entitlement Hook
 *
 * Reactive hook querying the active licensing provider via ContractRegistry.
 * Uses useSyncExternalStore for tear-free, concurrent-safe, zero-flash rendering.
 * Ensures zero direct dependency on Pro modules, guaranteed fail-open behavior,
 * and automatic real-time updates when licenses are registered or refreshed.
 */

import { useSyncExternalStore } from 'react';
import type { EntitlementSnapshot } from '../contracts/registry';
import { contractRegistry } from '../contracts/registry';

export type UseEntitlementResult = EntitlementSnapshot;

const DEFAULT_FAIL_OPEN_STATUS: UseEntitlementResult = {
  isPro: false,
  tier: 'free',
  loading: false,
};

let cachedSnapshot: UseEntitlementResult | null = null;
let lastSourceSnapshot: EntitlementSnapshot | null = null;

function getSnapshot(): UseEntitlementResult {
  try {
    const raw = contractRegistry.getEntitlementSnapshot();
    if (
      !cachedSnapshot ||
      !lastSourceSnapshot ||
      raw.isPro !== lastSourceSnapshot.isPro ||
      raw.tier !== lastSourceSnapshot.tier ||
      raw.expiresAt !== lastSourceSnapshot.expiresAt ||
      raw.gracePeriodActive !== lastSourceSnapshot.gracePeriodActive ||
      raw.loading !== lastSourceSnapshot.loading
    ) {
      lastSourceSnapshot = raw;
      cachedSnapshot = {
        isPro: Boolean(raw.isPro),
        tier: raw.tier ?? (raw.isPro ? 'pro' : 'free'),
        expiresAt: raw.expiresAt,
        gracePeriodActive: raw.gracePeriodActive,
        loading: Boolean(raw.loading),
      };
    }
    return cachedSnapshot;
  } catch {
    return DEFAULT_FAIL_OPEN_STATUS;
  }
}

export function useEntitlement(): UseEntitlementResult {
  return useSyncExternalStore(
    (callback) => contractRegistry.subscribeEntitlement(callback),
    getSnapshot,
    getSnapshot
  );
}
