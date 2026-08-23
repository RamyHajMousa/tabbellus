/**
 * TabBellus Core Contract Registry
 *
 * Provides a decoupled extension registry where Free Core components
 * interact with public extension interfaces without depending on or
 * statically importing from the Pro subsystem.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact ONLY with this registry.
 * - This module MUST NOT import anything from `src/pro/`.
 */

import type {
  EntitlementStatus,
  FeatureSlotRegistration,
  LicensingContract,
  ProModule,
} from './index';

export interface EntitlementSnapshot extends EntitlementStatus {
  tier: 'free' | 'pro' | 'enterprise';
  loading: boolean;
}

/**
 * Null-object pattern licensing engine used as default fallback
 * when no Pro licensing driver has been registered.
 */
export class NullLicensingEngine implements LicensingContract {
  async getEntitlement(): Promise<EntitlementStatus> {
    return { isPro: false, tier: 'free' };
  }

  async validateKey(_licenseKey: string): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Licensing subsystem not loaded' };
  }

  async clearLicense(): Promise<void> {
    // No-op for null provider
  }

  subscribe(callback: (status: EntitlementStatus) => void): () => void {
    callback({ isPro: false, tier: 'free' });
    return () => {};
  }
}

export class ContractRegistry {
  private licensingProvider: LicensingContract = new NullLicensingEngine();
  private currentEntitlement: EntitlementStatus = { isPro: false, tier: 'free' };
  private isProviderReady: boolean = true;
  private modules: Map<string, ProModule> = new Map();
  private slots: Map<string, FeatureSlotRegistration[]> = new Map();
  private listeners: Set<(snapshot: EntitlementSnapshot) => void> = new Set();
  private providerUnsubscribe: (() => void) | null = null;

  constructor() {
    this.bindProviderSubscription(this.licensingProvider);
  }

  // --- Licensing Provider Registration & Query ---

  registerLicensingProvider(provider: LicensingContract): void {
    if (this.providerUnsubscribe) {
      this.providerUnsubscribe();
      this.providerUnsubscribe = null;
    }

    this.licensingProvider = provider;
    this.isProviderReady = false;
    this.bindProviderSubscription(provider);

    // If subscription did not synchronously mark provider ready, notify subscribers of loading state
    if (!this.isProviderReady) {
      this.notifyListeners();
    }

    // Trigger async fetch in case provider updates asynchronously
    provider
      .getEntitlement()
      .then((status) => {
        this.isProviderReady = true;
        this.updateAndNotify(status);
      })
      .catch(() => {
        this.isProviderReady = true;
        this.updateAndNotify({ isPro: false, tier: 'free' });
      });
  }

  getLicensingProvider(): LicensingContract {
    return this.licensingProvider;
  }

  /**
   * Returns the current synchronous snapshot of entitlement status.
   */
  getEntitlementSnapshot(): EntitlementSnapshot {
    return {
      isPro: Boolean(this.currentEntitlement.isPro),
      tier: this.currentEntitlement.tier ?? (this.currentEntitlement.isPro ? 'pro' : 'free'),
      expiresAt: this.currentEntitlement.expiresAt,
      gracePeriodActive: this.currentEntitlement.gracePeriodActive,
      loading: !this.isProviderReady,
    };
  }

  /**
   * Subscribes to entitlement changes across provider updates.
   */
  subscribeEntitlement(callback: (snapshot: EntitlementSnapshot) => void): () => void {
    this.listeners.add(callback);
    callback(this.getEntitlementSnapshot());

    return () => {
      this.listeners.delete(callback);
    };
  }

  private bindProviderSubscription(provider: LicensingContract): void {
    try {
      this.providerUnsubscribe = provider.subscribe((status) => {
        this.isProviderReady = true;
        this.updateAndNotify(status);
      });
    } catch {
      this.providerUnsubscribe = null;
      this.isProviderReady = true;
      this.updateAndNotify({ isPro: false, tier: 'free' });
    }
  }

  private updateAndNotify(status: EntitlementStatus): void {
    this.currentEntitlement = {
      isPro: Boolean(status?.isPro),
      tier: status?.tier ?? (status?.isPro ? 'pro' : 'free'),
      expiresAt: status?.expiresAt,
      gracePeriodActive: status?.gracePeriodActive,
    };

    this.notifyListeners();
  }

  private notifyListeners(): void {
    const snapshot = this.getEntitlementSnapshot();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // Prevent listener exception from breaking notification loop
      }
    });
  }

  // --- Module Registration & Query ---

  registerModule(module: ProModule): void {
    if (!module?.metadata?.id) {
      throw new Error('ContractRegistry: Invalid module registration without metadata.id');
    }
    this.modules.set(module.metadata.id, module);
  }

  getModule(id: string): ProModule | undefined {
    return this.modules.get(id);
  }

  getAllModules(): ProModule[] {
    return Array.from(this.modules.values());
  }

  // --- Slot Registration & Query ---

  registerSlot(slot: FeatureSlotRegistration): void {
    if (!slot?.slotId) {
      throw new Error('ContractRegistry: Invalid slot registration without slotId');
    }
    const current = this.slots.get(slot.slotId) || [];
    current.push(slot);
    current.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.slots.set(slot.slotId, current);
  }

  getSlots(slotId: string): FeatureSlotRegistration[] {
    return this.slots.get(slotId) ? [...this.slots.get(slotId)!] : [];
  }

  // --- Testing & Reset Helper ---

  reset(): void {
    if (this.providerUnsubscribe) {
      this.providerUnsubscribe();
      this.providerUnsubscribe = null;
    }
    this.licensingProvider = new NullLicensingEngine();
    this.currentEntitlement = { isPro: false, tier: 'free' };
    this.isProviderReady = true;
    this.modules.clear();
    this.slots.clear();
    this.listeners.clear();
    this.bindProviderSubscription(this.licensingProvider);
  }
}

export const contractRegistry = new ContractRegistry();
