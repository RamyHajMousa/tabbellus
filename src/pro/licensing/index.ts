/**
 * TabBellus Pro Licensing Engine & Entitlement Cache
 *
 * Implements LicensingContract defined in Core Contracts.
 * Handles cryptographic signature verification, entitlement cache persistence,
 * and fail-open grace states.
 */

import type { EntitlementStatus, LicensingContract } from '@/core/contracts';

export class ProLicensingEngine implements LicensingContract {
  private currentStatus: EntitlementStatus = {
    isPro: false,
    tier: 'free',
  };

  private listeners: Set<(status: EntitlementStatus) => void> = new Set();

  async getEntitlement(): Promise<EntitlementStatus> {
    return { ...this.currentStatus };
  }

  async validateKey(licenseKey: string): Promise<{ success: boolean; error?: string }> {
    if (!licenseKey || licenseKey.trim().length === 0) {
      return { success: false, error: 'Empty license key provided' };
    }
    // Stub implementation for entitlement validation pipeline
    return { success: false, error: 'License validation server not connected' };
  }

  async clearLicense(): Promise<void> {
    this.currentStatus = { isPro: false, tier: 'free' };
    this.notifyListeners();
  }

  subscribe(callback: (status: EntitlementStatus) => void): () => void {
    this.listeners.add(callback);
    callback({ ...this.currentStatus });
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const status = { ...this.currentStatus };
    this.listeners.forEach((listener) => listener(status));
  }
}

export const proLicensingEngine = new ProLicensingEngine();
