/**
 * MV3 Service Worker Cold Wake & Lifecycle Integration Tests
 *
 * Verifies:
 * - T4 (readiness): A message arriving immediately on cold wake before storage
 *   hydration resolves awaits readiness; GET_STATUS reports isConnected: true,
 *   and DISABLE_ENCRYPTION does not fail with "not connected".
 * - T1 (cold wake, alarm): Alarm dispatched before storage resolves runs cycle once ready.
 * - T2 (cold wake, onStartup): onStartup dispatched before storage resolves runs cycle once ready.
 * - T3 (cold wake, mutation): Alt+R command dispatched before storage resolves marks dirty and cycles.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncDispatcher } from '../syncDispatcher';
import { SyncEngine } from '@/pro/sync/engine/syncEngine';
import { SyncScheduler } from '@/pro/sync/engine/syncScheduler';

describe('MV3 Service Worker Readiness (Commit 1 / T4)', () => {
  const EXTENSION_ID = 'tabbellus-test-id';
  const EXTENSION_URL = `chrome-extension://${EXTENSION_ID}/src/sidepanel/index.html`;

  let delayedStorageResolve: (value: any) => void;
  let mockLocalStorage: Record<string, unknown>;
  let mockSessionStorage: Record<string, unknown>;

  const validSender = {
    id: EXTENSION_ID,
    tab: undefined,
    url: EXTENSION_URL,
  } as chrome.runtime.MessageSender;

  beforeEach(() => {
    mockLocalStorage = {};
    mockSessionStorage = {};

    const delayedStoragePromise = new Promise((resolve) => {
      delayedStorageResolve = resolve;
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: EXTENSION_ID,
        getURL: (path = '') => `chrome-extension://${EXTENSION_ID}/${path}`,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
        onInstalled: { addListener: vi.fn() },
        lastError: null,
      },
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(true),
        onAlarm: { addListener: vi.fn() },
      },
      storage: {
        local: {
          get: vi.fn((key: string) => {
            if (key === 'tabbellus_sync_state') {
              return delayedStoragePromise.then(() => ({ [key]: mockLocalStorage[key] }));
            }
            return Promise.resolve({ [key]: mockLocalStorage[key] });
          }),
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
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      identity: {
        getAuthToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
        removeCachedAuthToken: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('T4: GET_STATUS arriving before storage resolves reports isConnected: true once ready', async () => {
    mockLocalStorage['tabbellus_sync_state'] = {
      syncEnabled: true,
      lastSyncedAt: 1700000000000,
    };

    const engine = new SyncEngine();
    // Start storage loading, but it is delayed
    engine.start();

    const scheduler = new SyncScheduler({ syncEngine: engine });
    const dispatcher = new SyncDispatcher({ syncEngine: engine, syncScheduler: scheduler });

    let responseData: any = null;
    const sendResponse = vi.fn((res) => {
      responseData = res;
    });

    // Send message IMMEDIATELY while storage is still pending
    dispatcher.handleMessage(
      { type: 'TABBELLUS_SYNC_GET_STATUS' },
      validSender,
      sendResponse,
    );

    // Give microtasks a spin before storage resolves
    await new Promise((r) => setTimeout(r, 10));
    // At this moment, if readiness is not awaited, response might already be sent with isConnected: false
    // Now resolve storage
    delayedStorageResolve(undefined);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(responseData?.success).toBe(true);
    expect(responseData?.data?.isConnected).toBe(true);
  });

  it('T4: DISABLE_ENCRYPTION arriving before storage resolves does not fail with "not connected"', async () => {
    mockLocalStorage['tabbellus_sync_state'] = {
      syncEnabled: true,
      isEncrypted: false,
    };

    const engine = new SyncEngine();
    engine.start();

    const scheduler = new SyncScheduler({ syncEngine: engine });
    const dispatcher = new SyncDispatcher({ syncEngine: engine, syncScheduler: scheduler });

    let responseData: any = null;
    const sendResponse = vi.fn((res) => {
      responseData = res;
    });

    dispatcher.handleMessage(
      { type: 'TABBELLUS_SYNC_DISABLE_ENCRYPTION' },
      validSender,
      sendResponse,
    );

    // Resolve storage after dispatch
    delayedStorageResolve(undefined);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    // Crucially: it should NOT reject with "Cannot disable encryption while disconnected"
    if (!responseData?.success) {
      expect(responseData?.error?.message).not.toContain('while disconnected');
    }
  });
});

describe('MV3 Service Worker Synchronous Registration (Commit 2 / T1–T3)', () => {
  const EXTENSION_ID = 'tabbellus-test-id';

  let delayedStorageResolve: (value: any) => void;
  let mockLocalStorage: Record<string, unknown>;
  let mockSessionStorage: Record<string, unknown>;

  let alarmListeners: ((alarm: chrome.alarms.Alarm) => void)[];
  let startupListeners: (() => void)[];
  let commandListeners: ((command: string) => void)[];

  beforeEach(async () => {
    vi.resetModules();

    mockLocalStorage = {
      tabbellus_sync_state: { syncEnabled: true },
      tabbellus_license_data: {
        status: 'active',
        tier: 'pro',
        licenseKey: 'TB-TEST-KEY',
        instanceId: 'test-inst',
      },
    };
    mockSessionStorage = {};

    alarmListeners = [];
    startupListeners = [];
    commandListeners = [];

    const delayedStoragePromise = new Promise((resolve) => {
      delayedStorageResolve = resolve;
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: EXTENSION_ID,
        getURL: (path = '') => `chrome-extension://${EXTENSION_ID}/${path}`,
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        onStartup: {
          addListener: vi.fn((fn) => {
            startupListeners.push(fn);
          }),
        },
        onInstalled: { addListener: vi.fn() },
        lastError: null,
      },
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(true),
        onAlarm: {
          addListener: vi.fn((fn) => {
            alarmListeners.push(fn);
          }),
        },
      },
      commands: {
        onCommand: {
          addListener: vi.fn((fn) => {
            commandListeners.push(fn);
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn((key: string) => {
            return delayedStoragePromise.then(() => ({ [key]: mockLocalStorage[key] }));
          }),
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
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      tabs: {
        query: vi.fn().mockResolvedValue([
          { id: 101, url: 'https://example.com/article', title: 'Example Article' },
        ]),
        get: vi.fn().mockResolvedValue({ id: 101, windowId: 1, url: 'https://example.com' }),
        onCreated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onActivated: { addListener: vi.fn() },
        onMoved: { addListener: vi.fn() },
        onAttached: { addListener: vi.fn() },
        onDetached: { addListener: vi.fn() },
        onReplaced: { addListener: vi.fn() },
      },
      windows: {
        getAll: vi.fn().mockResolvedValue([]),
        onRemoved: { addListener: vi.fn() },
        onFocusChanged: { addListener: vi.fn() },
      },
      contextMenus: {
        create: vi.fn(),
        update: vi.fn(),
        removeAll: vi.fn().mockResolvedValue(undefined),
        onClicked: { addListener: vi.fn() },
      },
      action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
      sidePanel: {
        setPanelBehavior: vi.fn().mockResolvedValue(undefined),
      },
    });

    const { proLicensingEngine } = await import('@/pro/background');
    vi.spyOn(proLicensingEngine, 'getEntitlement').mockResolvedValue({
      isPro: true,
      tier: 'pro',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('T1 (cold wake, alarm): alarm dispatched immediately on import runs cycle once ready with dirty flag set', async () => {
    mockSessionStorage['tabbellus_sync_dirty'] = true;

    const { syncEngine } = await import('@/pro/background');
    const syncNowSpy = vi.spyOn(syncEngine, 'syncNow').mockResolvedValue({
      success: true,
      timestamp: Date.now(),
    });

    // Import background entrypoint fresh
    await import('../index');

    // Immediately dispatch debounce alarm before storage resolves
    expect(alarmListeners.length).toBeGreaterThan(0);
    const alarmHandler = alarmListeners[0];
    const alarmPromise = alarmHandler({ name: 'tabbellus-sync-debounce' } as chrome.alarms.Alarm);

    // Now resolve storage hydration
    delayedStorageResolve(undefined);
    await alarmPromise;

    await vi.waitFor(() => {
      expect(syncNowSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('T2 (cold wake, onStartup): onStartup dispatched immediately on import runs cycle once ready', async () => {
    const { syncEngine, proLicensingEngine } = await import('@/pro/background');
    vi.spyOn(proLicensingEngine, 'getEntitlement').mockResolvedValue({
      isPro: true,
      tier: 'pro',
    });
    const syncNowSpy = vi.spyOn(syncEngine, 'syncNow').mockResolvedValue({
      success: true,
      timestamp: Date.now(),
    });

    await import('../index');

    expect(startupListeners.length).toBeGreaterThan(0);
    const startupHandler = startupListeners[0];
    const startupPromise = (startupHandler as any)();

    delayedStorageResolve(undefined);
    await startupPromise;

    await vi.waitFor(() => {
      expect(syncNowSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('T3 (cold wake, mutation): Alt+R command dispatched immediately on import marks dirty and runs cycle', async () => {
    const { syncEngine, syncScheduler, proLicensingEngine } = await import('@/pro/background');
    vi.spyOn(proLicensingEngine, 'getEntitlement').mockResolvedValue({
      isPro: true,
      tier: 'pro',
    });
    const syncNowSpy = vi.spyOn(syncEngine, 'syncNow').mockResolvedValue({
      success: true,
      timestamp: Date.now(),
    });

    await import('../index');

    expect(commandListeners.length).toBeGreaterThan(0);
    const commandHandler = commandListeners[0];
    // Trigger command immediately before storage resolves
    await commandHandler('save-to-read-later');

    // Dirty flag must be set in session storage immediately
    expect(mockSessionStorage['tabbellus_sync_dirty']).toBe(true);

    delayedStorageResolve(undefined);

    // Alarm or debounced cycle runs once ready
    await syncScheduler.runDebouncedCycle('timer');

    await vi.waitFor(() => {
      expect(syncNowSpy).toHaveBeenCalledTimes(1);
    });
  });
});
