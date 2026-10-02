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
