/**
 * SyncEngine Lifecycle & Status Mirror Tests (Commit A)
 *
 * Verifies:
 * - A1: Construction has no side effects (no storage reads, no mutation subscriptions, no timers).
 * - A1: Explicit start() hydrates from storage; stop() cleans up.
 * - A1: Engine has no internal setTimeout auto-sync timer.
 * - A6: Every status update mirrors sanitized SyncStatus to chrome.storage.session 'tabbellus_sync_live_status'.
 * - A6: Mirror contains NO keys, passphrases, or tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine } from '../syncEngine';
import { contractRegistry } from '@/core/contracts/registry';

describe('SyncEngine Lifecycle & Status Mirror (Commit A)', () => {
  const mockLocalStorage: Record<string, unknown> = {};
  const mockSessionStorage: Record<string, unknown> = {};

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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', mockChrome);
    Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
    Object.keys(mockSessionStorage).forEach((k) => delete mockSessionStorage[k]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('A1: construction has NO side effects (no storage access, no mutation subscription, no timers)', () => {
    const subscribeSpy = vi.spyOn(contractRegistry, 'subscribeLocalMutation');
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    new SyncEngine();

    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(mockChrome.storage.local.get).not.toHaveBeenCalled();
    expect(mockChrome.storage.session.set).not.toHaveBeenCalled();

    subscribeSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  it('A1: start() explicitly hydrates state and mirrors initial status to session storage', async () => {
    mockLocalStorage['tabbellus_sync_state'] = {
      syncEnabled: true,
      lastSyncedAt: 123456789,
      isEncrypted: false,
    };

    const engine = new SyncEngine();
    await engine.start();

    const status = await engine.getStatus();
    expect(status.isConnected).toBe(true);
    expect(status.telemetry.lastSyncedAt).toBe(123456789);

    // Status mirror written to session storage
    expect(mockSessionStorage['tabbellus_sync_live_status']).toBeDefined();
    const mirrored = mockSessionStorage['tabbellus_sync_live_status'] as any;
    expect(mirrored.isConnected).toBe(true);
    expect(mirrored.telemetry.lastSyncedAt).toBe(123456789);
  });

  it('A6: every status change writes sanitized SyncStatus to session storage without secrets', async () => {
    const engine = new SyncEngine();
    await engine.start();

    // Trigger lockVault
    await engine.lockVault();

    const mirrored = mockSessionStorage['tabbellus_sync_live_status'] as any;
    expect(mirrored).toBeDefined();
    expect(mirrored.state).toBe('locked');
    expect(mirrored.telemetry).toBeDefined();

    // Verify sanitization: no secrets
    expect(mirrored.key).toBeUndefined();
    expect(mirrored.passphrase).toBeUndefined();
    expect(mirrored.token).toBeUndefined();
    expect(mirrored.authToken).toBeUndefined();
    expect(mirrored.salt).toBeUndefined();
  });

  it('A1: engine does not contain internal setTimeout autoSyncTimer or handleLocalMutation', () => {
    const engine = new SyncEngine() as any;
    expect(engine.autoSyncTimer).toBeUndefined();
    expect(engine.handleLocalMutation).toBeUndefined();
  });
});
