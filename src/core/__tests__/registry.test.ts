import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContractRegistry,
  NullLicensingEngine,
  NullRulesEngine,
  NullSyncProvider,
  contractRegistry,
  notifyLocalMutation,
  subscribeLocalMutation,
} from '../contracts/registry';
import type {
  FeatureSlotRegistration,
  LicensingContract,
  ProModule,
  RulesContract,
  SyncProvider,
  SyncStatus,
  TabRule,
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

  it('should handle encryption lifecycle methods safely without throwing', async () => {
    const provider = new NullSyncProvider();

    await expect(provider.setupEncryption('passphrase')).resolves.toBeUndefined();
    await expect(provider.unlockVault('passphrase')).resolves.toBe(false);
    await expect(provider.lockVault()).resolves.toBeUndefined();
  });
});

describe('NullRulesEngine', () => {
  it('should return an empty rule set on getRules', async () => {
    const engine = new NullRulesEngine();
    const rules = await engine.getRules();
    expect(rules).toEqual([]);
  });

  it('should execute saveRules without throwing', async () => {
    const engine = new NullRulesEngine();
    await expect(engine.saveRules([])).resolves.toBeUndefined();
  });

  it('should return an unmatched evaluation result on evaluateTab', async () => {
    const engine = new NullRulesEngine();
    const result = await engine.evaluateTab({ url: 'https://example.com' });
    expect(result).toEqual({ matched: false, actions: [] });
  });

  it('should execute executeActions without throwing', async () => {
    const engine = new NullRulesEngine();
    await expect(engine.executeActions(1, [])).resolves.toBeUndefined();
  });

  it('should notify subscriber immediately with an empty rule set', () => {
    const engine = new NullRulesEngine();
    const callback = vi.fn();
    const unsubscribe = engine.subscribe(callback);

    expect(callback).toHaveBeenCalledWith([]);
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

  describe('Rules Provider Management & Subscriptions', () => {
    const makeRulesProvider = (overrides: Partial<RulesContract> = {}): RulesContract => ({
      getRules: vi.fn().mockResolvedValue([]),
      saveRules: vi.fn().mockResolvedValue(undefined),
      evaluateTab: vi.fn().mockResolvedValue({ matched: false, actions: [] }),
      executeActions: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
        cb([]);
        return () => {};
      }),
      ...overrides,
    });

    it('should initialize with NullRulesEngine by default', async () => {
      const provider = registry.getRulesProvider();
      expect(provider).toBeInstanceOf(NullRulesEngine);
      const rules = await provider.getRules();
      expect(rules).toEqual([]);
      expect(registry.getRulesSnapshot()).toEqual([]);
    });

    it('should return a referentially stable snapshot across repeated calls (useSyncExternalStore contract)', () => {
      // getRulesSnapshot() must return the SAME array reference between actual
      // rule-list changes. A fresh array on every call fails Object.is() on
      // every React render and triggers an infinite re-render loop in
      // consumers of useRules() (regression: RuleManagerCard white-screened
      // with "Maximum update depth exceeded" when this returned `[...rules]`).
      const first = registry.getRulesSnapshot();
      const second = registry.getRulesSnapshot();
      const third = registry.getRulesSnapshot();

      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it('should return a new snapshot reference only when the rule list actually changes', async () => {
      const beforeUpdate = registry.getRulesSnapshot();

      const customRule: TabRule = {
        id: 'stability-check',
        name: 'Stability Check',
        enabled: true,
        priority: 0,
        matchAll: false,
        conditions: [],
        actions: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      registry.registerRulesProvider(
        makeRulesProvider({
          subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
            cb([customRule]);
            return () => {};
          }),
        }),
      );

      const afterUpdate = registry.getRulesSnapshot();
      expect(afterUpdate).not.toBe(beforeUpdate);
      expect(afterUpdate).toEqual([customRule]);

      // Stable again between calls until the next real change.
      expect(registry.getRulesSnapshot()).toBe(afterUpdate);
    });

    it('should register a custom rules provider and notify subscribers', async () => {
      const mockSubscriber = vi.fn();
      registry.subscribeRules(mockSubscriber);

      const customRule: TabRule = {
        id: 'r1',
        name: 'Group GitHub',
        enabled: true,
        priority: 0,
        matchAll: false,
        conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
        actions: [{ type: 'group', groupName: 'Dev' }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const customProvider = makeRulesProvider({
        getRules: vi.fn().mockResolvedValue([customRule]),
        subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
          cb([customRule]);
          return () => {};
        }),
      });

      registry.registerRulesProvider(customProvider);
      expect(registry.getRulesProvider()).toBe(customProvider);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSubscriber).toHaveBeenCalledWith([expect.objectContaining({ id: 'r1' })]);
      expect(registry.getRulesSnapshot()).toEqual([customRule]);
    });

    it('should handle rules provider errors gracefully during subscription', async () => {
      const mockSubscriber = vi.fn();
      const faultyProvider = makeRulesProvider({
        getRules: vi.fn().mockRejectedValue(new Error('Rules load failure')),
        subscribe: vi.fn(() => {
          throw new Error('Rules subscription crash');
        }),
      });

      registry.registerRulesProvider(faultyProvider);
      registry.subscribeRules(mockSubscriber);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSubscriber).toHaveBeenCalledWith([]);
    });

    it('should unsubscribe previous rules provider when a new one is registered', () => {
      const unsubscribeOld = vi.fn();
      const oldProvider = makeRulesProvider({ subscribe: vi.fn(() => unsubscribeOld) });

      registry.registerRulesProvider(oldProvider);
      expect(unsubscribeOld).not.toHaveBeenCalled();

      const newProvider = makeRulesProvider();
      registry.registerRulesProvider(newProvider);
      expect(unsubscribeOld).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing from rules updates', () => {
      const mockSubscriber = vi.fn();
      const unsubscribe = registry.subscribeRules(mockSubscriber);

      mockSubscriber.mockClear();
      unsubscribe();

      registry.registerRulesProvider(makeRulesProvider());

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

  describe('Local Mutation Event Bus', () => {
    it('notifies registered listeners when notifyLocalMutation is invoked', () => {
      const listener = vi.fn();
      const unsubscribe = registry.subscribeLocalMutation(listener);

      expect(listener).not.toHaveBeenCalled();

      registry.notifyLocalMutation();
      expect(listener).toHaveBeenCalledTimes(1);

      registry.notifyLocalMutation();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('unsubscribes listener when cleanup function is called', () => {
      const listener = vi.fn();
      const unsubscribe = registry.subscribeLocalMutation(listener);

      registry.notifyLocalMutation();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      registry.notifyLocalMutation();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('wipes mutation listeners on reset()', () => {
      const listener = vi.fn();
      registry.subscribeLocalMutation(listener);

      registry.reset();
      registry.notifyLocalMutation();
      expect(listener).not.toHaveBeenCalled();
    });

    it('safely isolates errors in individual mutation listeners without breaking notification loop', () => {
      const faultyListener = vi.fn(() => {
        throw new Error('Listener crash');
      });
      const goodListener = vi.fn();

      registry.subscribeLocalMutation(faultyListener);
      registry.subscribeLocalMutation(goodListener);

      expect(() => registry.notifyLocalMutation()).not.toThrow();
      expect(faultyListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);
    });

    it('handles standalone exported helpers notifyLocalMutation and subscribeLocalMutation', () => {
      contractRegistry.reset();
      const listener = vi.fn();
      const unsubscribe = subscribeLocalMutation(listener);

      notifyLocalMutation();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      notifyLocalMutation();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reset', () => {
    it('should wipe modules, slots, and restore NullLicensingEngine, NullSyncProvider, and NullRulesEngine on reset', () => {
      registry.registerModule({
        metadata: { id: 'm1', name: 'M1', version: '1.0' },
        initialize: () => {},
      });
      registry.registerSlot({ slotId: 's1', component: 'c1' });

      registry.reset();

      expect(registry.getLicensingProvider()).toBeInstanceOf(NullLicensingEngine);
      expect(registry.getSyncProvider()).toBeInstanceOf(NullSyncProvider);
      expect(registry.getRulesProvider()).toBeInstanceOf(NullRulesEngine);
      expect(registry.getRulesSnapshot()).toEqual([]);
      expect(registry.getAllModules()).toHaveLength(0);
      expect(registry.getSlots('s1')).toEqual([]);
    });
  });
});


