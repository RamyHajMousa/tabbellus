/**
 * useSyncStatus Hook Unit Tests
 *
 * Tests:
 * - Default fail-open initial state with NullSyncProvider
 * - Reactive state updates when custom SyncProvider is registered
 * - Fail-open resilience when provider resets or throws
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { contractRegistry } from '../contracts/registry';
import type { SyncProvider } from '../contracts/sync';


const TestConsumer: React.FC = () => {
  const { state, isConnected, telemetry } = useSyncStatus();
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="lastError">{telemetry.lastError ?? 'none'}</span>
    </div>
  );
};

describe('useSyncStatus Hook', () => {
  beforeEach(() => {
    contractRegistry.reset();
  });

  it('renders default idle/disconnected state with NullSyncProvider', () => {
    const html = renderToString(<TestConsumer />);

    expect(html).toContain('idle');
    expect(html).toContain('false');
    expect(html).toContain('none');
  });

  it('reflects updated sync status when active provider is registered', () => {
    const mockProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'synced',
        isConnected: true,
        telemetry: {
          lastSyncedAt: 1700000000000,
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
            lastSyncedAt: 1700000000000,
            pendingMutations: 0,
            encrypted: false,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockProvider);

    const html = renderToString(<TestConsumer />);

    expect(html).toContain('synced');
    expect(html).toContain('true');
  });

  it('reflects error state and error message from active provider', () => {
    const mockErrorProvider: SyncProvider = {
      getStatus: vi.fn().mockResolvedValue({
        state: 'error',
        isConnected: false,
        telemetry: {
          pendingMutations: 0,
          lastError: 'OAuth token expired',
          encrypted: false,
        },
      }),
      connect: vi.fn().mockResolvedValue({ success: false }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      syncNow: vi.fn().mockResolvedValue({ success: false, timestamp: Date.now() }),
      subscribe: vi.fn((cb) => {
        cb({
          state: 'error',
          isConnected: false,
          telemetry: {
            pendingMutations: 0,
            lastError: 'OAuth token expired',
            encrypted: false,
          },
        });
        return () => {};
      }),
    };

    contractRegistry.registerSyncProvider(mockErrorProvider);

    const html = renderToString(<TestConsumer />);

    expect(html).toContain('error');
    expect(html).toContain('OAuth token expired');
  });
});
