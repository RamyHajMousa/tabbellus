/**
 * SyncSettingsCard Unit Tests
 *
 * Tests:
 * - Rendering in disconnected state with "Connect Google Drive" CTA
 * - Rendering in connected state with status pill, telemetry, and action buttons
 * - Rendering syncing state with active indicator
 * - Rendering offline / error notices
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SyncSettingsCard } from '../SyncSettingsCard';
import { ToastProvider } from '@/components/ui/Toaster';
import { contractRegistry } from '@/core/contracts/registry';
import type { SyncProvider } from '@/core/contracts/sync';


describe('SyncSettingsCard Component', () => {
  beforeEach(() => {
    contractRegistry.reset();
  });

  it('renders disconnected state by default with connect action', () => {
    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('Google Drive Cloud Sync');
    expect(html).toContain('Disconnected');
    expect(html).toContain('Connect Google Drive');
    expect(html).toContain('Bring Your Own Cloud (BYOC)');
  });

  it('renders connected state with telemetry and action controls', () => {
    const mockConnectedProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'synced',
        isConnected: true,
        telemetry: {
          lastSyncedAt: Date.now() - 60000, // 1 minute ago
          pendingMutations: 0,
          encrypted: false,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'synced',
          isConnected: true,
          telemetry: {
            lastSyncedAt: Date.now() - 60000,
            pendingMutations: 0,
            encrypted: false,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockConnectedProvider);

    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('Google Drive Cloud Sync');
    expect(html).toContain('Synced');
    expect(html).toContain('appDataFolder');
    expect(html).toContain('Sync Now');
    expect(html).toContain('Disconnect');
  });

  it('renders syncing state with loading pill', () => {
    const mockSyncingProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'syncing',
        isConnected: true,
        telemetry: {
          pendingMutations: 0,
          encrypted: false,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'syncing',
          isConnected: true,
          telemetry: {
            pendingMutations: 0,
            encrypted: false,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockSyncingProvider);

    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('Syncing…');
  });

  it('renders error notice when telemetry contains lastError', () => {
    const mockErrorProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'error',
        isConnected: true,
        telemetry: {
          pendingMutations: 0,
          lastError: 'Google Drive quota exceeded',
          encrypted: false,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: false, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'error',
          isConnected: true,
          telemetry: {
            pendingMutations: 0,
            lastError: 'Google Drive quota exceeded',
            encrypted: false,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockErrorProvider);

    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('Error');
    expect(html).toContain('Google Drive quota exceeded');
  });

  it('renders locked state with "Vault Locked" badge and "Unlock Vault" button', () => {
    const mockLockedProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'locked',
        isConnected: true,
        telemetry: {
          pendingMutations: 0,
          encrypted: true,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: false, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'locked',
          isConnected: true,
          telemetry: {
            pendingMutations: 0,
            encrypted: true,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockLockedProvider);

    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('Vault Locked');
    expect(html).toContain('Unlock Vault');
    expect(html).toContain('Vault is locked on this device');
  });

  it('renders active E2EE state with "E2E Encrypted" badge and "Lock" action', () => {
    const mockEncryptedProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'synced',
        isConnected: true,
        telemetry: {
          lastSyncedAt: Date.now() - 30000,
          pendingMutations: 0,
          encrypted: true,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'synced',
          isConnected: true,
          telemetry: {
            lastSyncedAt: Date.now() - 30000,
            pendingMutations: 0,
            encrypted: true,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockEncryptedProvider);

    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('E2E Encrypted');
    expect(html).toContain('Lock');
    expect(html).toContain('Disable E2EE');
    expect(html).toContain('Zero-Knowledge E2EE active');
    expect(html).toContain('appDataFolder (E2EE)');
  });

  it('renders standard unencrypted state with "Standard Sync" badge and "Enable E2EE" action', () => {
    const mockStandardProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'synced',
        isConnected: true,
        telemetry: {
          pendingMutations: 0,
          encrypted: false,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: true }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: true, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'synced',
          isConnected: true,
          telemetry: {
            pendingMutations: 0,
            encrypted: false,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockStandardProvider);

    const html = renderToString(
      <ToastProvider>
        <SyncSettingsCard />
      </ToastProvider>,
    );

    expect(html).toContain('Standard Sync');
    expect(html).toContain('Enable E2EE');
    expect(html).toContain('appDataFolder');
  });
});

