import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContractRegistry,
  NullLicensingEngine,
  contractRegistry,
} from '../contracts/registry';
import type {
  FeatureSlotRegistration,
  LicensingContract,
  ProModule,
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
    it('should wipe modules, slots, and restore NullLicensingEngine on reset', () => {
      registry.registerModule({
        metadata: { id: 'm1', name: 'M1', version: '1.0' },
        initialize: () => {},
      });
      registry.registerSlot({ slotId: 's1', component: 'c1' });

      registry.reset();

      expect(registry.getLicensingProvider()).toBeInstanceOf(NullLicensingEngine);
      expect(registry.getAllModules()).toHaveLength(0);
      expect(registry.getSlots('s1')).toEqual([]);
    });
  });
});
