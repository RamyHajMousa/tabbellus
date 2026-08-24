/**
 * TabBellus Pro Licensing Engine & Entitlement Cache
 *
 * Implements LicensingContract defined in Core Contracts.
 * Handles Lemon Squeezy API activation/validation/deactivation,
 * entitlement cache persistence, offline-first grace states,
 * and periodic background revalidation.
 */

import type { EntitlementStatus, LicensingContract } from '@/core/contracts';
import { activateLicense, validateLicense, deactivateLicense } from './api';
import {
  getOrCreateInstanceId,
  saveLicenseData,
  loadLicenseData,
  clearLicenseData,
  evaluateGracePeriod,
} from './storage';
import type { LicenseStorageData } from './storage';

/** 24 hours in milliseconds — background revalidation threshold */
const REVALIDATION_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export class ProLicensingEngine implements LicensingContract {
  private currentStatus: EntitlementStatus = {
    isPro: false,
    tier: 'free',
  };

  private listeners: Set<(status: EntitlementStatus) => void> = new Set();
  private cachedStorage: LicenseStorageData | null = null;
  private isRevalidating = false;

  constructor() {
    // Begin async hydration from storage
    this.hydrateFromStorage();
  }

  /**
   * Hydrates the engine state from cached storage on startup.
   * Evaluates grace period to determine initial entitlement status.
   */
  private async hydrateFromStorage(): Promise<void> {
    try {
      this.cachedStorage = await loadLicenseData();
      const status = evaluateGracePeriod(this.cachedStorage);
      this.currentStatus = status;
    } catch {
      // Storage read failure — fail open to free tier
      this.currentStatus = { isPro: false, tier: 'free' };
      this.cachedStorage = null;
    }

    this.notifyListeners();

    // Trigger background revalidation if needed after hydration
    this.maybeRevalidate();
  }

  async getEntitlement(): Promise<EntitlementStatus> {
    return { ...this.currentStatus };
  }

  /**
   * Activates a license key with the Lemon Squeezy API.
   *
   * 1. Resolves or creates a stable device instance UUID
   * 2. Calls the activation API
   * 3. On success: persists credentials, updates status, notifies subscribers
   * 4. On failure: returns typed error without side effects
   */
  async validateKey(licenseKey: string): Promise<{ success: boolean; error?: string }> {
    if (!licenseKey || licenseKey.trim().length === 0) {
      return { success: false, error: 'Please enter a license key.' };
    }

    const trimmedKey = licenseKey.trim();

    // Resolve device instance
    let instanceId: string;
    try {
      instanceId = await getOrCreateInstanceId();
    } catch {
      return { success: false, error: 'Failed to initialize device identity.' };
    }

    // Call Lemon Squeezy activation endpoint
    const result = await activateLicense(trimmedKey, instanceId);

    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'Activation failed.' };
    }

    // Persist license credentials
    const now = Date.now();
    const storageData: LicenseStorageData = {
      licenseKey: result.data.licenseKey.key,
      instanceId: result.data.instance.id,
      status: 'active',
      tier: 'pro',
      validatedAt: now,
      expiresAt: null,
    };

    try {
      await saveLicenseData(storageData);
    } catch {
      // Storage write failed, but activation succeeded on the server side.
      // Continue with in-memory state — it will be lost on restart.
    }

    this.cachedStorage = storageData;
    this.currentStatus = {
      isPro: true,
      tier: 'pro',
      gracePeriodActive: false,
    };

    this.notifyListeners();
    return { success: true };
  }

  /**
   * Deactivates the current license.
   *
   * 1. Reads current credentials from storage
   * 2. Calls deactivation API (fire-and-forget)
   * 3. Clears local storage
   * 4. Resets to free tier and notifies subscribers
   */
  async clearLicense(): Promise<void> {
    // Fire-and-forget deactivation — best effort, don't block UI
    if (this.cachedStorage?.licenseKey && this.cachedStorage?.instanceId) {
      deactivateLicense(
        this.cachedStorage.licenseKey,
        this.cachedStorage.instanceId,
      ).catch(() => {
        // Intentionally silenced — deactivation is best-effort
      });
    }

    // Clear persistent storage
    try {
      await clearLicenseData();
    } catch {
      // Silent failure — storage cleanup is best-effort
    }

    this.cachedStorage = null;
    this.currentStatus = { isPro: false, tier: 'free' };
    this.notifyListeners();
  }

  subscribe(callback: (status: EntitlementStatus) => void): () => void {
    this.listeners.add(callback);

    // Immediately invoke with current status
    callback({ ...this.currentStatus });

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const status = { ...this.currentStatus };
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // Prevent listener exception from breaking notification loop
      }
    });
  }

  /**
   * Triggers background revalidation if the last validation was
   * more than 24 hours ago. Non-blocking, fire-and-forget.
   */
  private maybeRevalidate(): void {
    if (this.isRevalidating) return;
    if (!this.cachedStorage) return;
    if (this.cachedStorage.status !== 'active') return;

    const elapsed = Date.now() - this.cachedStorage.validatedAt;
    if (elapsed <= REVALIDATION_THRESHOLD_MS) return;

    this.isRevalidating = true;

    this.performBackgroundRevalidation().finally(() => {
      this.isRevalidating = false;
    });
  }

  private async performBackgroundRevalidation(): Promise<void> {
    if (!this.cachedStorage) return;

    const { licenseKey, instanceId } = this.cachedStorage;
    if (!licenseKey || !instanceId) return;

    const result = await validateLicense(licenseKey, instanceId);

    if (result.success && result.data) {
      if (result.data.valid) {
        // Revalidation succeeded — refresh the cached timestamp
        const now = Date.now();
        const expiresAt = result.data.licenseKey.expiresAt
          ? new Date(result.data.licenseKey.expiresAt).getTime()
          : null;

        const updatedStorage: LicenseStorageData = {
          ...this.cachedStorage,
          status: 'active',
          validatedAt: now,
          expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
        };

        try {
          await saveLicenseData(updatedStorage);
        } catch {
          // Silent failure — in-memory state is still updated
        }

        this.cachedStorage = updatedStorage;
        this.currentStatus = {
          isPro: true,
          tier: updatedStorage.tier,
          expiresAt: updatedStorage.expiresAt ?? undefined,
          gracePeriodActive: false,
        };
        this.notifyListeners();
      } else {
        // License is no longer valid on the server — revoke immediately
        try {
          await clearLicenseData();
        } catch {
          // Silent
        }

        this.cachedStorage = null;
        this.currentStatus = { isPro: false, tier: 'free' };
        this.notifyListeners();
      }
    }
    // If revalidation fails due to network error, do nothing —
    // the grace period evaluator will handle the offline window.
  }
}

export const proLicensingEngine = new ProLicensingEngine();
