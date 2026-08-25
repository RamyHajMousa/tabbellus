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
  SyncProvider,
  SyncResult,
  SyncStatus,
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

/**
 * Null-object pattern sync provider used as default fallback
 * when no Pro sync driver has been registered.
 */
export class NullSyncProvider implements SyncProvider {
  async getStatus(): Promise<SyncStatus> {
    return {
      state: 'idle',
      isConnected: false,
      telemetry: {
        pendingMutations: 0,
        encrypted: false,
      },
    };
  }

  async connect(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Sync subsystem not loaded' };
  }

  async disconnect(): Promise<void> {
    // No-op for null provider
  }

  async syncNow(_options?: { forceFull?: boolean }): Promise<SyncResult> {
    return {
      success: false,
      error: 'Sync subsystem not loaded',
      timestamp: Date.now(),
    };
  }

  subscribe(callback: (status: SyncStatus) => void): () => void {
    callback({
      state: 'idle',
      isConnected: false,
      telemetry: {
        pendingMutations: 0,
        encrypted: false,
      },
    });
    return () => {};
  }
}

export class ContractRegistry {
  private licensingProvider: LicensingContract = new NullLicensingEngine();
  private syncProvider: SyncProvider = new NullSyncProvider();
  private currentEntitlement: EntitlementStatus = { isPro: false, tier: 'free' };
  private currentSyncStatus: SyncStatus = {
    state: 'idle',
    isConnected: false,
    telemetry: {
      pendingMutations: 0,
      encrypted: false,
    },
  };
  private isProviderReady: boolean = true;
  private isSyncProviderReady: boolean = true;
  private modules: Map<string, ProModule> = new Map();
  private slots: Map<string, FeatureSlotRegistration[]> = new Map();
  private listeners: Set<(snapshot: EntitlementSnapshot) => void> = new Set();
  private syncListeners: Set<(status: SyncStatus) => void> = new Set();
  private providerUnsubscribe: (() => void) | null = null;
  private syncProviderUnsubscribe: (() => void) | null = null;

  constructor() {
    this.bindProviderSubscription(this.licensingProvider);
    this.bindSyncProviderSubscription(this.syncProvider);
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

  // --- Sync Provider Registration & Query ---

  registerSyncProvider(provider: SyncProvider): void {
    if (this.syncProviderUnsubscribe) {
      this.syncProviderUnsubscribe();
      this.syncProviderUnsubscribe = null;
    }

    this.syncProvider = provider;
    this.isSyncProviderReady = false;
    this.bindSyncProviderSubscription(provider);

    // If subscription did not synchronously mark provider ready, notify subscribers of current status
    if (!this.isSyncProviderReady) {
      this.notifySyncListeners();
    }

    // Trigger async fetch in case provider updates asynchronously
    provider
      .getStatus()
      .then((status) => {
        this.isSyncProviderReady = true;
        this.updateSyncAndNotify(status);
      })
      .catch(() => {
        this.isSyncProviderReady = true;
        this.updateSyncAndNotify({
          state: 'idle',
          isConnected: false,
          telemetry: { pendingMutations: 0, encrypted: false },
        });
      });
  }

  getSyncProvider(): SyncProvider {
    return this.syncProvider;
  }

  /**
   * Returns current synchronous snapshot of sync status.
   */
  getSyncStatus(): SyncStatus {
    return {
      state: this.currentSyncStatus.state,
      isConnected: Boolean(this.currentSyncStatus.isConnected),
      telemetry: {
        lastSyncedAt: this.currentSyncStatus.telemetry?.lastSyncedAt,
        pendingMutations: this.currentSyncStatus.telemetry?.pendingMutations ?? 0,
        lastError: this.currentSyncStatus.telemetry?.lastError,
        encrypted: Boolean(this.currentSyncStatus.telemetry?.encrypted),
      },
    };
  }

  /**
   * Subscribes to sync status changes across provider updates.
   */
  subscribeSync(callback: (status: SyncStatus) => void): () => void {
    this.syncListeners.add(callback);
    callback(this.getSyncStatus());

    return () => {
      this.syncListeners.delete(callback);
    };
  }

  private bindSyncProviderSubscription(provider: SyncProvider): void {
    try {
      this.syncProviderUnsubscribe = provider.subscribe((status) => {
        this.isSyncProviderReady = true;
        this.updateSyncAndNotify(status);
      });
    } catch {
      this.syncProviderUnsubscribe = null;
      this.isSyncProviderReady = true;
      this.updateSyncAndNotify({
        state: 'idle',
        isConnected: false,
        telemetry: { pendingMutations: 0, encrypted: false },
      });
    }
  }

  private updateSyncAndNotify(status: SyncStatus): void {
    this.currentSyncStatus = {
      state: status?.state ?? 'idle',
      isConnected: Boolean(status?.isConnected),
      telemetry: {
        lastSyncedAt: status?.telemetry?.lastSyncedAt,
        pendingMutations: status?.telemetry?.pendingMutations ?? 0,
        lastError: status?.telemetry?.lastError,
        encrypted: Boolean(status?.telemetry?.encrypted),
      },
    };

    this.notifySyncListeners();
  }

  private notifySyncListeners(): void {
    const status = this.getSyncStatus();
    this.syncListeners.forEach((listener) => {
      try {
        listener(status);
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
    if (this.syncProviderUnsubscribe) {
      this.syncProviderUnsubscribe();
      this.syncProviderUnsubscribe = null;
    }
    this.licensingProvider = new NullLicensingEngine();
    this.syncProvider = new NullSyncProvider();
    this.currentEntitlement = { isPro: false, tier: 'free' };
    this.currentSyncStatus = {
      state: 'idle',
      isConnected: false,
      telemetry: { pendingMutations: 0, encrypted: false },
    };
    this.isProviderReady = true;
    this.isSyncProviderReady = true;
    this.modules.clear();
    this.slots.clear();
    this.listeners.clear();
    this.syncListeners.clear();
    this.bindProviderSubscription(this.licensingProvider);
    this.bindSyncProviderSubscription(this.syncProvider);
  }
}

export const contractRegistry = new ContractRegistry();

