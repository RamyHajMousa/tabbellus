/**
 * useRules Hook Unit Tests
 *
 * Tests:
 * - Default fail-open state when no Pro rules provider is registered
 * - Reactive snapshot updates when the active rules provider changes
 * - saveRules() delegates to the active provider
 * - applyRulesToWindow() messages the background dispatcher, with fail-open fallback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useRules } from '../hooks/useRules';
import { contractRegistry } from '../contracts/registry';
import type { RulesContract, TabRule } from '../contracts/rules';

function makeRulesProvider(overrides: Partial<RulesContract> = {}): RulesContract {
  return {
    getRules: vi.fn().mockResolvedValue([]),
    saveRules: vi.fn().mockResolvedValue(undefined),
    evaluateTab: vi.fn().mockResolvedValue({ matched: false, actions: [] }),
    executeActions: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
      cb([]);
      return () => {};
    }),
    ...overrides,
  };
}

function makeRule(overrides: Partial<TabRule> = {}): TabRule {
  return {
    id: 'r1',
    name: 'Rule',
    enabled: true,
    priority: 0,
    matchAll: false,
    conditions: [{ field: 'domain', operator: 'contains', value: 'example.com' }],
    actions: [{ type: 'pin' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** Captures a hook's return value by rendering a probe component via SSR. */
function captureHook<T>(useHook: () => T): T {
  let captured: T | undefined;
  const Probe: React.FC = () => {
    captured = useHook();
    return null;
  };
  renderToString(<Probe />);
  return captured as T;
}

describe('useRules Hook', () => {
  beforeEach(() => {
    contractRegistry.reset();
    delete (globalThis as any).chrome;
  });

  it('returns an empty rule set and loading:false with NullRulesEngine by default', () => {
    const result = captureHook(useRules);

    expect(result.rules).toEqual([]);
    expect(result.loading).toBe(false);
    expect(typeof result.saveRules).toBe('function');
    expect(typeof result.applyRulesToWindow).toBe('function');
  });

  it('reflects the active provider rules snapshot reactively', () => {
    const rule = makeRule({ id: 'active-rule' });
    const provider = makeRulesProvider({
      subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
        cb([rule]);
        return () => {};
      }),
    });

    contractRegistry.registerRulesProvider(provider);

    const result = captureHook(useRules);
    expect(result.rules).toEqual([rule]);
  });

  it('updates the snapshot when a different provider is registered afterward', () => {
    const first = captureHook(useRules);
    expect(first.rules).toEqual([]);

    const rule = makeRule({ id: 'r2' });
    contractRegistry.registerRulesProvider(
      makeRulesProvider({
        subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
          cb([rule]);
          return () => {};
        }),
      }),
    );

    const second = captureHook(useRules);
    expect(second.rules).toEqual([rule]);
  });

  it('saveRules() delegates to the active provider', async () => {
    const saveRules = vi.fn().mockResolvedValue(undefined);
    contractRegistry.registerRulesProvider(makeRulesProvider({ saveRules }));

    const result = captureHook(useRules);
    const updated = [makeRule({ id: 'x' })];
    await result.saveRules(updated);

    expect(saveRules).toHaveBeenCalledWith(updated);
  });

  it('saveRules() swallows provider errors without throwing', async () => {
    const saveRules = vi.fn().mockRejectedValue(new Error('boom'));
    contractRegistry.registerRulesProvider(makeRulesProvider({ saveRules }));

    const result = captureHook(useRules);
    await expect(result.saveRules([])).resolves.toBeUndefined();
  });

  it('applyRulesToWindow() sends APPLY_RULES_TO_WINDOW to the background dispatcher', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ processed: 3, matched: 1 });
    (globalThis as any).chrome = { runtime: { sendMessage } };

    const result = captureHook(useRules);
    const telemetry = await result.applyRulesToWindow(42);

    expect(sendMessage).toHaveBeenCalledWith({ type: 'APPLY_RULES_TO_WINDOW', windowId: 42 });
    expect(telemetry).toEqual({ processed: 3, matched: 1 });
  });

  it('applyRulesToWindow() omits windowId when not provided', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ processed: 0, matched: 0 });
    (globalThis as any).chrome = { runtime: { sendMessage } };

    const result = captureHook(useRules);
    await result.applyRulesToWindow();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'APPLY_RULES_TO_WINDOW', windowId: undefined });
  });

  it('applyRulesToWindow() fails open with zeroed telemetry when chrome.runtime is unavailable', async () => {
    delete (globalThis as any).chrome;

    const result = captureHook(useRules);
    const telemetry = await result.applyRulesToWindow();

    expect(telemetry).toEqual({ processed: 0, matched: 0 });
  });

  it('applyRulesToWindow() fails open with zeroed telemetry when the message send rejects', async () => {
    (globalThis as any).chrome = { runtime: { sendMessage: vi.fn().mockRejectedValue(new Error('no receiver')) } };

    const result = captureHook(useRules);
    const telemetry = await result.applyRulesToWindow();

    expect(telemetry).toEqual({ processed: 0, matched: 0 });
  });

  it('applyRulesToWindow() fails open when the response payload is malformed', async () => {
    (globalThis as any).chrome = { runtime: { sendMessage: vi.fn().mockResolvedValue({ unexpected: true }) } };

    const result = captureHook(useRules);
    const telemetry = await result.applyRulesToWindow();

    expect(telemetry).toEqual({ processed: 0, matched: 0 });
  });
});
