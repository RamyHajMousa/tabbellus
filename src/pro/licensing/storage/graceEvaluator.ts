/**
 * Offline Grace Period Evaluator
 *
 * Deterministic, pure function evaluating cached license data to determine
 * if the user should retain Pro status during network unavailability.
 *
 * Grace Period: 7 days from last successful validation.
 * If offline or validation fails within this window, Pro access is retained
 * with `gracePeriodActive: true` flag.
 */

import type { EntitlementStatus } from '@/core/contracts';
import type { LicenseStorageData } from './licenseStorage';

/** 7 days in milliseconds */
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Evaluates whether cached license data qualifies for Pro entitlement,
 * including offline grace period logic.
 *
 * @param cachedData - The last persisted license state, or null if none exists
 * @returns Deterministic entitlement status based on cached data and current time
 */
export function evaluateGracePeriod(cachedData: LicenseStorageData | null): EntitlementStatus {
  // No cached data — default to free tier
  if (!cachedData) {
    return { isPro: false, tier: 'free' };
  }

  // License is not in active status — free tier regardless of timing
  if (cachedData.status !== 'active') {
    return { isPro: false, tier: 'free' };
  }

  // Check if the license has been explicitly expired by date
  if (cachedData.expiresAt !== null && cachedData.expiresAt > 0 && Date.now() > cachedData.expiresAt) {
    return { isPro: false, tier: 'free' };
  }

  const elapsed = Date.now() - cachedData.validatedAt;

  // Within grace period — retain Pro status with grace flag
  if (elapsed < GRACE_PERIOD_MS) {
    return {
      isPro: true,
      tier: cachedData.tier ?? 'pro',
      expiresAt: cachedData.expiresAt ?? undefined,
      gracePeriodActive: elapsed > 24 * 60 * 60 * 1000, // Only flag after 24h without revalidation
    };
  }

  // Grace period expired — revoke Pro status
  return { isPro: false, tier: 'free' };
}
