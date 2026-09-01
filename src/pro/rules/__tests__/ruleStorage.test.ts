/**
 * Tab Rule Storage Tests
 *
 * Tests the storage layer with mocked chrome.storage APIs:
 * - Sync storage write/read round-trip
 * - Quota error local fallback
 * - Rule reordering persistence
 * - Clearing rules from both stores
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveRules, loadRules, clearRules } from '../storage/ruleStorage';
import type { TabRule } from '@/core/contracts/rules';

const localStore: Record<string, unknown> = {};
const syncStore: Record<string, unknown> = {};

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
  Object.keys(localStore).forEach((k) => delete localStore[k]);
  Object.keys(syncStore).forEach((k) => delete syncStore[k]);

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: localStore[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(localStore, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete localStore[key];
        }),
      },
      sync: {
        get: vi.fn(async (key: string) => ({ [key]: syncStore[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(syncStore, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete syncStore[key];
        }),
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ruleStorage', () => {
  it('saves and loads rules via sync storage', async () => {
    const rules = [makeRule({ id: 'a' }), makeRule({ id: 'b', priority: 1 })];
    await saveRules(rules);

    expect(syncStore['tabbellus_tab_rules']).toEqual(rules);

    const loaded = await loadRules();
    expect(loaded).toEqual(rules);
  });

  it('falls back to local storage when sync write fails (quota exceeded)', async () => {
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(
      new Error('QUOTA_BYTES_PER_ITEM quota exceeded'),
    );

    const rules = [makeRule()];
    await saveRules(rules);

    expect(localStore['tabbellus_tab_rules']).toEqual(rules);
    expect(syncStore['tabbellus_tab_rules']).toBeUndefined();
  });

  it('falls back to local storage on a permission rejection', async () => {
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(new Error('Permission denied'));

    const rules = [makeRule()];
    await saveRules(rules);

    expect(localStore['tabbellus_tab_rules']).toEqual(rules);
  });

  it('loads from local storage when sync has no data', async () => {
    const rules = [makeRule()];
    localStore['tabbellus_tab_rules'] = rules;

    const loaded = await loadRules();
    expect(loaded).toEqual(rules);
  });

  it('returns an empty array when no rules exist in either store', async () => {
    const loaded = await loadRules();
    expect(loaded).toEqual([]);
  });

  it('persists reordered rules (new priority values) on subsequent saves', async () => {
    const initial = [makeRule({ id: 'a', priority: 0 }), makeRule({ id: 'b', priority: 1 })];
    await saveRules(initial);

    const reordered = [
      { ...initial[1], priority: 0 },
      { ...initial[0], priority: 1 },
    ];
    await saveRules(reordered);

    const loaded = await loadRules();
    expect(loaded.map((r) => r.id)).toEqual(['b', 'a']);
    expect(loaded.map((r) => r.priority)).toEqual([0, 1]);
  });

  it('clears rules from both sync and local storage', async () => {
    syncStore['tabbellus_tab_rules'] = [makeRule()];
    localStore['tabbellus_tab_rules'] = [makeRule()];

    await clearRules();

    expect(syncStore['tabbellus_tab_rules']).toBeUndefined();
    expect(localStore['tabbellus_tab_rules']).toBeUndefined();
  });
});
