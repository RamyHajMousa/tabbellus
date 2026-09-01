/**
 * RulesEngine Unit Tests
 *
 * Tests:
 * - Storage hydration on construction
 * - Priority-ordered, first-match-wins evaluation
 * - Disabled rules are skipped
 * - saveRules() persists via the storage layer, re-sorts, and notifies subscribers
 * - subscribe() dispatches the current snapshot immediately and on every update
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RulesEngine } from '../engine/rulesEngine';
import { loadRules, saveRules as persistRules, RULES_STORAGE_KEY } from '../storage/ruleStorage';
import type { TabRule } from '@/core/contracts/rules';

vi.mock('../storage/ruleStorage', () => ({
  loadRules: vi.fn(),
  saveRules: vi.fn(),
  RULES_STORAGE_KEY: 'tabbellus_tab_rules',
}));

const mockedLoadRules = vi.mocked(loadRules);
const mockedPersistRules = vi.mocked(persistRules);

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

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadRules.mockResolvedValue([]);
  mockedPersistRules.mockResolvedValue(undefined);
});

describe('RulesEngine hydration', () => {
  it('hydrates rules from storage sorted by ascending priority', async () => {
    mockedLoadRules.mockResolvedValue([
      makeRule({ id: 'low-priority', priority: 5 }),
      makeRule({ id: 'high-priority', priority: 1 }),
    ]);

    const engine = new RulesEngine();
    const rules = await engine.getRules();

    expect(rules.map((r) => r.id)).toEqual(['high-priority', 'low-priority']);
  });

  it('falls back to an empty rule set when storage hydration throws', async () => {
    mockedLoadRules.mockRejectedValue(new Error('Storage unavailable'));

    const engine = new RulesEngine();
    const rules = await engine.getRules();

    expect(rules).toEqual([]);
  });
});

describe('RulesEngine.evaluateTab — priority-ordered first-match-wins', () => {
  it('returns the actions of the highest-priority (lowest value) matching rule', async () => {
    mockedLoadRules.mockResolvedValue([
      makeRule({
        id: 'catch-all',
        priority: 10,
        conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
        actions: [{ type: 'pin' }],
      }),
      makeRule({
        id: 'specific',
        priority: 1,
        conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
        actions: [{ type: 'group', groupName: 'Dev' }],
      }),
    ]);

    const engine = new RulesEngine();
    const result = await engine.evaluateTab({ url: 'https://github.com/org/repo' });

    expect(result.matched).toBe(true);
    expect(result.ruleId).toBe('specific');
    expect(result.actions).toEqual([{ type: 'group', groupName: 'Dev' }]);
  });

  it('skips disabled rules even when they would otherwise match first', async () => {
    mockedLoadRules.mockResolvedValue([
      makeRule({
        id: 'disabled-first',
        priority: 0,
        enabled: false,
        conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
      }),
      makeRule({
        id: 'enabled-second',
        priority: 1,
        enabled: true,
        conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
        actions: [{ type: 'mute' }],
      }),
    ]);

    const engine = new RulesEngine();
    const result = await engine.evaluateTab({ url: 'https://github.com/x' });

    expect(result.ruleId).toBe('enabled-second');
  });

  it('returns matched: false with empty actions when nothing matches', async () => {
    mockedLoadRules.mockResolvedValue([
      makeRule({ conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }] }),
    ]);

    const engine = new RulesEngine();
    const result = await engine.evaluateTab({ url: 'https://example.com' });

    expect(result).toEqual({ matched: false, actions: [] });
  });
});

describe('RulesEngine.saveRules', () => {
  it('persists rules via the storage layer, re-sorted by priority', async () => {
    const engine = new RulesEngine();
    await engine.getRules(); // wait for initial hydration

    const unsorted = [makeRule({ id: 'b', priority: 2 }), makeRule({ id: 'a', priority: 1 })];
    await engine.saveRules(unsorted);

    expect(mockedPersistRules).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a', priority: 1 }),
      expect.objectContaining({ id: 'b', priority: 2 }),
    ]);

    const rules = await engine.getRules();
    expect(rules.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('RulesEngine.subscribe', () => {
  it('dispatches the current snapshot immediately on subscribe', async () => {
    mockedLoadRules.mockResolvedValue([makeRule({ id: 'a' })]);
    const engine = new RulesEngine();
    await engine.getRules(); // ensure hydration completed

    const callback = vi.fn();
    const unsubscribe = engine.subscribe(callback);

    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })]);
    expect(typeof unsubscribe).toBe('function');
  });

  it('notifies subscribers when rules are updated via saveRules', async () => {
    const engine = new RulesEngine();
    await engine.getRules();

    const callback = vi.fn();
    engine.subscribe(callback);
    callback.mockClear();

    await engine.saveRules([makeRule({ id: 'new-rule' })]);

    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'new-rule' })]);
  });

  it('stops receiving updates after unsubscribing', async () => {
    const engine = new RulesEngine();
    await engine.getRules();

    const callback = vi.fn();
    const unsubscribe = engine.subscribe(callback);
    callback.mockClear();
    unsubscribe();

    await engine.saveRules([makeRule()]);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('RulesEngine — cross-context storage sync', () => {
  const RULES_KEY = RULES_STORAGE_KEY;

  let onChangedHandler: ((changes: Record<string, unknown>, areaName: string) => void) | undefined;

  beforeEach(() => {
    onChangedHandler = undefined;
    (globalThis as any).chrome = {
      storage: {
        onChanged: {
          addListener: vi.fn((fn: typeof onChangedHandler) => {
            onChangedHandler = fn;
          }),
        },
      },
    };
  });

  it('re-hydrates from storage when the rules key changes (e.g. written by another JS execution context)', async () => {
    const engine = new RulesEngine();
    await engine.getRules(); // initial hydration (empty, per beforeEach default)

    const fromOtherContext = makeRule({ id: 'from-other-context' });
    mockedLoadRules.mockResolvedValueOnce([fromOtherContext]);

    onChangedHandler?.({ [RULES_KEY]: { newValue: [fromOtherContext] } }, 'sync');

    await vi.waitFor(async () => {
      const rules = await engine.getRules();
      expect(rules.map((r) => r.id)).toEqual(['from-other-context']);
    });
  });

  it('notifies existing subscribers when a storage change arrives', async () => {
    const engine = new RulesEngine();
    await engine.getRules();

    const callback = vi.fn();
    engine.subscribe(callback);
    callback.mockClear();

    const updated = makeRule({ id: 'notified' });
    mockedLoadRules.mockResolvedValueOnce([updated]);

    onChangedHandler?.({ [RULES_KEY]: { newValue: [updated] } }, 'local');

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledWith([expect.objectContaining({ id: 'notified' })]);
    });
  });

  it('ignores storage changes for unrelated keys', async () => {
    const engine = new RulesEngine();
    await engine.getRules();
    mockedLoadRules.mockClear();

    onChangedHandler?.({ 'tabbellus-settings': { newValue: {} } }, 'local');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedLoadRules).not.toHaveBeenCalled();
  });

  it('ignores changes from an unrelated storage area', async () => {
    const engine = new RulesEngine();
    await engine.getRules();
    mockedLoadRules.mockClear();

    onChangedHandler?.({ [RULES_KEY]: { newValue: [] } }, 'managed');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedLoadRules).not.toHaveBeenCalled();
  });

  it('does not throw when chrome.storage.onChanged is unavailable', () => {
    (globalThis as any).chrome = undefined;
    expect(() => new RulesEngine()).not.toThrow();
  });
});

describe('RulesEngine.executeActions', () => {
  it('delegates to RuleExecutor without throwing when chrome APIs are unavailable', async () => {
    (globalThis as any).chrome = {
      tabs: { update: vi.fn().mockResolvedValue(undefined) },
    };

    const engine = new RulesEngine();
    await expect(engine.executeActions(1, [{ type: 'pin' }])).resolves.toBeUndefined();
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
  });
});
