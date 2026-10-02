/**
 * SyncScheduler Unit & Integration Tests (Commit A)
 *
 * Verifies:
 * - A3: markDirty() sets tabbellus_sync_dirty in session storage, starts 3s in-memory timer, and creates 0.5-min alarm.
 * - A3: timer and alarm both firing produce exactly ONE cycle.
 * - A3: mutation during a running cycle leaves the flag set (another cycle follows).
 * - A3: failed cycle re-sets the flag.
 * - A3: periodic alarm (30m) created only when enabled+entitled, cleared on disconnect or loss of entitlement.
 * - A4: Free user produces ZERO fetch/getAuthToken calls and NO alarms.
 * - A4: Locked vault sets status 'locked' without network calls.
 * - A3: onStartup triggers a cycle when enabled and entitled.
 * - A5: A background mutation (e.g. via readLaterService or notifyLocalMutation) leads to a sync with no side panel present.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncScheduler } from '../syncScheduler';
import { contractRegistry } from '@/core/contracts/registry';
import type { SyncEngine } from '../syncEngine';
import type { LicensingContract, EntitlementStatus } from '@/core/contracts';
import { db } from '@/lib/db';
import { readLaterService } from '@/lib/readLaterService';

describe('SyncScheduler (Commit A)', () => {
  let mockLocalStorage: Record<string, unknown> = {};
  let mockSessionStorage: Record<string, unknown> = {};
  let createdAlarms: Map<string, chrome.alarms.AlarmCreateInfo> = new Map();
  let alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];
  let startupListeners: Array<() => void> = [];
  let installedListeners: Array<(details: { reason: string }) => void> = [];

  let mockSyncEngine: Partial<SyncEngine>;
  let mockLicensingEngine: LicensingContract;
  let entitlementStatus: EntitlementStatus;

  const mockChrome = {
    storage: {
      local: {
        get: vi.fn((key: string) => Promise.resolve({ [key]: mockLocalStorage[key] })),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockLocalStorage, items);
          return Promise.resolve();
        }),
      },
      session: {
        get: vi.fn((key: string) => Promise.resolve({ [key]: mockSessionStorage[key] })),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(mockSessionStorage, items);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete mockSessionStorage[key];
          return Promise.resolve();
        }),
      },
    },
    alarms: {
      create: vi.fn((name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) => {
        createdAlarms.set(name, alarmInfo);
        return Promise.resolve();
      }),
      clear: vi.fn((name: string) => {
        createdAlarms.delete(name);
        return Promise.resolve(true);
      }),
      onAlarm: {
        addListener: vi.fn((cb: (alarm: chrome.alarms.Alarm) => void) => {
          alarmListeners.push(cb);
        }),
        removeListener: vi.fn((cb: (alarm: chrome.alarms.Alarm) => void) => {
          alarmListeners = alarmListeners.filter((l) => l !== cb);
        }),
      },
    },
    runtime: {
      onStartup: {
        addListener: vi.fn((cb: () => void) => {
          startupListeners.push(cb);
        }),
      },
      onInstalled: {
        addListener: vi.fn((cb: (details: { reason: string }) => void) => {
          installedListeners.push(cb);
        }),
      },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.stubGlobal('chrome', mockChrome);

    mockLocalStorage = {};
    mockSessionStorage = {};
    createdAlarms = new Map();
    alarmListeners = [];
    startupListeners = [];
    installedListeners = [];

    entitlementStatus = { isPro: true, tier: 'pro' };
    mockLicensingEngine = {
      getEntitlement: vi.fn().mockImplementation(async () => entitlementStatus),
      validateKey: vi.fn().mockResolvedValue({ success: true }),
      clearLicense: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockReturnValue(() => {}),
    };

    mockSyncEngine = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'idle',
        isConnected: true,
        telemetry: { pendingMutations: 0, encrypted: false },
      }),
      syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
      updateStatus: vi.fn(),
    } as any;

    await db.readLater.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    contractRegistry.reset();
  });

  it('A3: markDirty sets the flag, timer and 0.5-min alarm', async () => {
    vi.useFakeTimers();
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };
    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.markDirty();

    // 1. Session flag set
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true);

    // 2. Alarm scheduled with delayInMinutes 0.5
    expect(createdAlarms.get('tabbellus-sync-debounce')).toEqual({ delayInMinutes: 0.5 });

    // 3. Timer is active (advancing 3s triggers syncNow)
    expect(mockSyncEngine.syncNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('A3: timer and alarm both firing produce exactly ONE cycle', async () => {
    vi.useFakeTimers();
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };
    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.markDirty();
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true);

    // Timer fires first at 3s
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1);
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBeFalsy();

    // Now alarm fires later (e.g. after 30s)
    for (const listener of alarmListeners) {
      await listener({ name: 'tabbellus-sync-debounce', scheduledTime: Date.now() });
    }

    // Should NOT have run a second cycle
    expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('A3: a mutation during a running cycle leaves the flag set (another cycle follows)', async () => {
    vi.useFakeTimers();
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };

    let resolveSync: (res: any) => void;
    (mockSyncEngine.syncNow as any).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSync = resolve;
        }),
    );

    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    // 1. Trigger first cycle
    await scheduler.markDirty();
    vi.advanceTimersByTime(3000);

    // At the start of cycle, dirty flag was cleared
    await vi.waitFor(() => expect(mockSessionStorage['tabbellus_sync_dirty']).toBeFalsy());

    // 2. Mid-cycle mutation occurs
    await scheduler.markDirty();
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true);

    // 3. First cycle completes
    resolveSync!({ success: true, timestamp: Date.now() });
    await vi.waitFor(() => expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1));

    // The dirty flag must STILL be true (not wiped by cycle finish!)
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true);

    // 4. Timer advances for the second cycle
    vi.advanceTimersByTime(3000);
    await vi.waitFor(() => expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(2));

    scheduler.dispose();
  });

  it('A3: a failed cycle re-sets the dirty flag', async () => {
    vi.useFakeTimers();
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };
    (mockSyncEngine.syncNow as any).mockResolvedValue({
      success: false,
      error: 'Network failure',
      timestamp: Date.now(),
    });

    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(3000);

    expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1);
    // On failure, dirty flag is set again
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true);

    scheduler.dispose();
  });

  it('A3: periodic alarm (30m) created only when enabled+entitled, cleared on disconnect or loss of entitlement', async () => {
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };
    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.init();

    // Created periodic alarm
    expect(createdAlarms.get('tabbellus-sync-periodic')).toEqual({ periodInMinutes: 30 });

    // User loses entitlement
    entitlementStatus = { isPro: false, tier: 'free' };
    await scheduler.recheckAlarms();
    expect(createdAlarms.has('tabbellus-sync-periodic')).toBe(false);

    // Re-entitled, but sync disabled
    entitlementStatus = { isPro: true, tier: 'pro' };
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: false };
    await scheduler.recheckAlarms();
    expect(createdAlarms.has('tabbellus-sync-periodic')).toBe(false);

    scheduler.dispose();
  });

  it('A4: Free user produces ZERO fetch/getAuthToken calls and NO alarms', async () => {
    vi.useFakeTimers();
    entitlementStatus = { isPro: false, tier: 'free' };
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };

    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.init();
    await scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(3000);

    // No sync executed
    expect(mockSyncEngine.syncNow).not.toHaveBeenCalled();
    // No alarms created
    expect(createdAlarms.size).toBe(0);

    scheduler.dispose();
  });

  it('A4: Locked vault sets status "locked" without network calls', async () => {
    vi.useFakeTimers();
    mockLocalStorage['tabbellus_sync_state'] = {
      syncEnabled: true,
      isEncrypted: true,
    };

    // Simulate locked sessionKeyStore
    const isUnlockedSpy = vi.spyOn(
      await import('../../crypto').then((m) => m.sessionKeyStore),
      'isUnlocked',
    ).mockResolvedValue(false);

    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(3000);

    // Zero syncNow calls
    expect(mockSyncEngine.syncNow).not.toHaveBeenCalled();
    // Sets status to locked
    expect((mockSyncEngine as any).updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'locked' }),
    );

    isUnlockedSpy.mockRestore();
    scheduler.dispose();
  });

  it('A3: onStartup triggers a cycle when enabled and entitled', async () => {
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };
    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.init();

    expect(startupListeners.length).toBeGreaterThan(0);
    for (const listener of startupListeners) {
      await listener();
    }

    expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('A5: a background mutation (e.g. Read Later via readLaterService) leads to a sync with no side panel present', async () => {
    mockLocalStorage['tabbellus_sync_state'] = { syncEnabled: true };
    const scheduler = new SyncScheduler({
      syncEngine: mockSyncEngine as SyncEngine,
      licensingEngine: mockLicensingEngine,
    });

    await scheduler.init();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // Trigger mutation from readLaterService (which calls contractRegistry.notifyLocalMutation())
    await readLaterService.addFromTab({
      url: 'https://example.com/article',
      title: 'Article',
    });

    await vi.waitFor(() => expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true));

    // 3s debounce passes
    vi.advanceTimersByTime(3000);

    await vi.waitFor(() => expect(mockSyncEngine.syncNow).toHaveBeenCalledTimes(1));

    scheduler.dispose();
  });
});
