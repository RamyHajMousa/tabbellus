import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContractRegistry,
  NullLicensingEngine,
  NullSyncProvider,
  contractRegistry,
} from '../contracts/registry';
import type {
  FeatureSlotRegistration,
  LicensingContract,
  ProModule,
  SyncProvider,
  SyncStatus,
} from '../contracts';

describe('NullLicensingEngine', () => {
  it('should return default free tier entitlement', async () => {
    const engine = new NullLicensingEngine();
    const entitlement = await engine.getEntitlement();
    expect(entitlement).toEqual({ isPro: false, tier: 'free' });
  });

  it('should return failure error on validateKey', async () => {
    const engine = new NullLicensingEngine();
    const result = await engine.validateKey('TEST-KEY');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Licensing subsystem not loaded');
  });

  it('should execute clearLicense without throwing', async () => {
    const engine = new NullLicensingEngine();
    await expect(engine.clearLicense()).resolves.toBeUndefined();
  });

  it('should notify subscriber immediately with free tier', () => {
    const engine = new NullLicensingEngine();
    const callback = vi.fn();
    const unsubscribe = engine.subscribe(callback);

    expect(callback).toHaveBeenCalledWith({ isPro: false, tier: 'free' });
    expect(typeof unsubscribe).toBe('function');
  });
});

describe('NullSyncProvider', () => {
  it('should return default idle sync status with zero pending mutations', async () => {
    const provider = new NullSyncProvider();
    const status = await provider.getStatus();
    expect(status).toEqual({
      state: 'idle',
      isConnected: false,
      telemetry: {
        pendingMutations: 0,
        encrypted: false,
      },
    });
  });

  it('should return failure error on connect', async () => {
    const provider = new NullSyncProvider();
    const result = await provider.connect();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Sync subsystem not loaded');
  });

  it('should execute disconnect without throwing', async () => {
    const provider = new NullSyncProvider();
    await expect(provider.disconnect()).resolves.toBeUndefined();
  });

  it('should return failure result on syncNow', async () => {
    const provider = new NullSyncProvider();
    const result = await provider.syncNow();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Sync subsystem not loaded');
    expect(typeof result.timestamp).toBe('number');
  });

  it('should notify subscriber immediately with default idle status', () => {
    const provider = new NullSyncProvider();
    const callback = vi.fn();
    const unsubscribe = provider.subscribe(callback);

    expect(callback).toHaveBeenCalledWith({
      state: 'idle',
      isConnected: false,
      telemetry: {
        pendingMutations: 0,
        encrypted: false,
      },
    });
    expect(typeof unsubscribe).toBe('function');
  });
});

describe('ContractRegistry', () => {
  let registry: ContractRegistry;

  beforeEach(() => {
    registry = new ContractRegistry();
    contractRegistry.reset();
  });

  describe('Licensing Provider Management & Subscriptions', () => {
    it('should initialize with NullLicensingEngine by default', async () => {
      const provider = registry.getLicensingProvider();
      expect(provider).toBeInstanceOf(NullLicensingEngine);
      const entitlement = await provider.getEntitlement();
      expect(entitlement).toEqual({ isPro: false, tier: 'free' });
    });

    it('should register a custom licensing provider and notify subscribers', async () => {
      const mockSubscriber = vi.fn();
      registry.subscribeEntitlement(mockSubscriber);

      const customProvider: LicensingContract = {
        getEntitlement: vi.fn().mockResolvedValue({ isPro: true, tier: 'pro' }),
        validateKey: vi.fn().mockResolvedValue({ success: true }),
        clearLicense: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn((cb) => {
          cb({ isPro: true, tier: 'pro' });
          return () => {};
        }),
      };

      registry.registerLicensingProvider(customProvider);
      expect(registry.getLicensingProvider()).toBe(customProvider);

      // Wait a tick for async notification
      await new Promise((r) => setTimeout(r, 0));
      expect(mockSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({ isPro: true, tier: 'pro' })
      );
    });

    it('should handle provider errors gracefully during subscription', async () => {
      const mockSubscriber = vi.fn();
      const faultyProvider: LicensingContract = {
        getEntitlement: vi.fn().mockRejectedValue(new Error('Network failure')),
        validateKey: vi.fn().mockRejectedValue(new Error('Network failure')),
        clearLicense: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(() => {
          throw new Error('Subscription crash');
        }),
      };

      registry.registerLicensingProvider(faultyProvider);
      registry.subscribeEntitlement(mockSubscriber);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({ isPro: false, tier: 'free', loading: false })
      );
    });
  });

  describe('Sync Provider Management & Subscriptions', () => {
    it('should initialize with NullSyncProvider by default', async () => {
      const provider = registry.getSyncProvider();
      expect(provider).toBeInstanceOf(NullSyncProvider);
      const status = await provider.getStatus();
      expect(status).toEqual({
        state: 'idle',
        isConnected: false,
        telemetry: { pendingMutations: 0, encrypted: false },
      });
    });

    it('should register a custom sync provider and notify subscribers', async () => {
      const mockSubscriber = vi.fn();
      registry.subscribeSync(mockSubscriber);

      const customSyncStatus: SyncStatus = {
        state: 'synced',
        isConnected: true,
        telemetry: {
          lastSyncedAt: 1700000000000,
          pendingMutations: 0,
          encrypted: true,
        },
      };

      const customProvider: SyncProvider = {
        getStatus: vi.fn().mockResolvedValue(customSyncStatus),
        connect: vi.fn().mockResolvedValue({ success: true }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
        subscribe: vi.fn((cb) => {
          cb(customSyncStatus);
          return () => {};
        }),
      };

      registry.registerSyncProvider(customProvider);
      expect(registry.getSyncProvider()).toBe(customProvider);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'synced',
          isConnected: true,
          telemetry: expect.objectContaining({ encrypted: true }),
        })
      );
    });

    it('should handle sync provider errors gracefully during subscription', async () => {
      const mockSubscriber = vi.fn();
      const faultyProvider: SyncProvider = {
        getStatus: vi.fn().mockRejectedValue(new Error('Sync failure')),
        connect: vi.fn().mockRejectedValue(new Error('Connect failure')),
        disconnect: vi.fn().mockResolvedValue(undefined),
        syncNow: vi.fn().mockRejectedValue(new Error('Sync error')),
        subscribe: vi.fn(() => {
          throw new Error('Sync subscription crash');
        }),
      };

      registry.registerSyncProvider(faultyProvider);
      registry.subscribeSync(mockSubscriber);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'idle',
          isConnected: false,
          telemetry: { pendingMutations: 0, encrypted: false },
        })
      );
    });

    it('should unsubscribe previous sync provider when a new one is registered', () => {
      const unsubscribeOld = vi.fn();
      const oldProvider: SyncProvider = {
        getStatus: vi.fn().mockResolvedValue({
          state: 'idle',
          isConnected: false,
          telemetry: { pendingMutations: 0, encrypted: false },
        }),
        connect: vi.fn().mockResolvedValue({ success: true }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
        subscribe: vi.fn(() => unsubscribeOld),
      };

      registry.registerSyncProvider(oldProvider);
      expect(unsubscribeOld).not.toHaveBeenCalled();

      const newProvider: SyncProvider = {
        getStatus: vi.fn().mockResolvedValue({
          state: 'synced',
          isConnected: true,
          telemetry: { pendingMutations: 0, encrypted: true },
        }),
        connect: vi.fn().mockResolvedValue({ success: true }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
        subscribe: vi.fn(() => () => {}),
      };

      registry.registerSyncProvider(newProvider);
      expect(unsubscribeOld).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing from sync updates', () => {
      const mockSubscriber = vi.fn();
      const unsubscribe = registry.subscribeSync(mockSubscriber);

      mockSubscriber.mockClear();

      const customProvider: SyncProvider = {
        getStatus: vi.fn().mockResolvedValue({
          state: 'synced',
          isConnected: true,
          telemetry: { pendingMutations: 0, encrypted: true },
        }),
        connect: vi.fn().mockResolvedValue({ success: true }),
        disconnect: vi.fn().mockResolvedValue(undefined),
        syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
        subscribe: vi.fn((cb) => {
          cb({
            state: 'synced',
            isConnected: true,
            telemetry: { pendingMutations: 0, encrypted: true },
          });
          return () => {};
        }),
      };

      unsubscribe();
      registry.registerSyncProvider(customProvider);

      expect(mockSubscriber).not.toHaveBeenCalled();
    });
  });

  describe('Module Management', () => {
    it('should register and retrieve Pro modules by ID', () => {
      const mockModule: ProModule = {
        metadata: {
          id: 'pro-tab-rules',
          name: 'Pro Tab Rules',
          version: '1.0.0',
          requiredEntitlement: 'pro',
        },
        initialize: vi.fn(),
      };

      registry.registerModule(mockModule);
      expect(registry.getModule('pro-tab-rules')).toBe(mockModule);
      expect(registry.getAllModules()).toContain(mockModule);
    });

    it('should throw when registering an invalid module without metadata id', () => {
      expect(() => {
        registry.registerModule({} as any);
      }).toThrow('ContractRegistry: Invalid module registration without metadata.id');
    });

    it('should return undefined for unregistered module IDs', () => {
      expect(registry.getModule('non-existent')).toBeUndefined();
    });
  });

  describe('Feature Slot Management', () => {
    it('should register and retrieve slots sorted by order', () => {
      const slot1: FeatureSlotRegistration = {
        slotId: 'active-toolbar.quick-actions',
        component: { id: 'btn-1' },
        order: 20,
      };
      const slot2: FeatureSlotRegistration = {
        slotId: 'active-toolbar.quick-actions',
        component: { id: 'btn-0' },
        order: 5,
      };

      registry.registerSlot(slot1);
      registry.registerSlot(slot2);

      const slots = registry.getSlots('active-toolbar.quick-actions');
      expect(slots).toHaveLength(2);
      expect(slots[0]).toEqual(slot2);
      expect(slots[1]).toEqual(slot1);
    });

    it('should return an empty array for unused slot IDs', () => {
      expect(registry.getSlots('empty-slot')).toEqual([]);
    });

    it('should throw when registering a slot without slotId', () => {
      expect(() => {
        registry.registerSlot({} as any);
      }).toThrow('ContractRegistry: Invalid slot registration without slotId');
    });
  });

  describe('Reset', () => {
    it('should wipe modules, slots, and restore NullLicensingEngine and NullSyncProvider on reset', () => {
      registry.registerModule({
        metadata: { id: 'm1', name: 'M1', version: '1.0' },
        initialize: () => {},
      });
      registry.registerSlot({ slotId: 's1', component: 'c1' });

      registry.reset();

      expect(registry.getLicensingProvider()).toBeInstanceOf(NullLicensingEngine);
      expect(registry.getSyncProvider()).toBeInstanceOf(NullSyncProvider);
      expect(registry.getAllModules()).toHaveLength(0);
      expect(registry.getSlots('s1')).toEqual([]);
    });
  });
});

