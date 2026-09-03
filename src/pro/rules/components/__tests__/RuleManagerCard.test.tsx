/**
 * RuleManagerCard Unit Tests
 *
 * SSR/Portal note: this project has no jsdom/testing-library, so Radix
 * Dialog portal content cannot be exercised via `renderToString` (verified:
 * an open Radix Dialog renders empty output under Node SSR). RuleManagerCard
 * itself is a plain (non-portal) card, so its own markup renders correctly;
 * its nested `<RuleEditorModal>`/`<TemplatePickerModal>` render nothing while
 * closed, which is the default mount state exercised here. Interactive click
 * behavior (toggle, delete, reorder, apply-now) is covered by calling the
 * exact pure functions the component's handlers delegate to.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RuleManagerCard } from '../RuleManagerCard';
import { ToastProvider } from '@/components/ui/Toaster';
import { contractRegistry } from '@/core/contracts/registry';
import type { RulesContract, TabRule } from '@/core/contracts/rules';
import {
  insertRule,
  moveRulePriority,
  removeRuleById,
  runApplyRulesNow,
  summarizeRule,
  toggleRuleEnabled,
} from '../ruleListActions';

function makeRule(overrides: Partial<TabRule> = {}): TabRule {
  return {
    id: 'r1',
    name: 'Group GitHub',
    enabled: true,
    priority: 0,
    matchAll: false,
    conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
    actions: [{ type: 'group', groupName: 'Dev', groupColor: 'purple' }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeRulesProvider(rules: TabRule[], overrides: Partial<RulesContract> = {}): RulesContract {
  return {
    getRules: vi.fn().mockResolvedValue(rules),
    saveRules: vi.fn().mockResolvedValue(undefined),
    evaluateTab: vi.fn().mockResolvedValue({ matched: false, actions: [] }),
    executeActions: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((cb: (rules: TabRule[]) => void) => {
      cb(rules);
      return () => {};
    }),
    ...overrides,
  };
}

beforeEach(() => {
  contractRegistry.reset();
});

/** Extracts a single opening tag containing the given attribute substring, regardless of attribute order. */
function extractTagContaining(html: string, attrMatch: string): string {
  const escaped = attrMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<[^>]*${escaped}[^>]*>`));
  return match ? match[0] : '';
}

// ---------------------------------------------------------------------------
// Rendering: empty state vs. populated rules list
// ---------------------------------------------------------------------------

describe('RuleManagerCard rendering', () => {
  it('renders the empty state with create/browse CTAs when no rules exist', () => {
    contractRegistry.registerRulesProvider(makeRulesProvider([]));

    const html = renderToString(
      <ToastProvider>
        <RuleManagerCard />
      </ToastProvider>,
    );

    expect(html).toContain('Declarative Tab Rules &amp; Auto-Grouping');
    expect(html).toContain('No automation rules yet.');
    expect(html).toContain('Create Custom Rule');
    expect(html).toContain('Browse Starter Presets');
    expect(html).toContain('Apply Rules Now');
    expect(html).toContain('Templates');
    expect(html).toContain('New Rule');
  });

  it('renders each rule with its name and summary badges', () => {
    const rule = makeRule();
    contractRegistry.registerRulesProvider(makeRulesProvider([rule]));

    const html = renderToString(
      <ToastProvider>
        <RuleManagerCard />
      </ToastProvider>,
    );

    expect(html).toContain('Group GitHub');
    expect(html).toContain('1 condition');
    expect(html).toContain('Group: Dev [purple]');
    expect(html).not.toContain('No automation rules yet.');
  });

  it('reflects an enabled rule as a checked Switch and a disabled rule as unchecked', () => {
    const enabledRule = makeRule({ id: 'a', name: 'Enabled Rule', enabled: true, priority: 0 });
    const disabledRule = makeRule({ id: 'b', name: 'Disabled Rule', enabled: false, priority: 1 });
    contractRegistry.registerRulesProvider(makeRulesProvider([enabledRule, disabledRule]));

    const html = renderToString(
      <ToastProvider>
        <RuleManagerCard />
      </ToastProvider>,
    );

    expect(extractTagContaining(html, 'aria-label="Toggle Enabled Rule"')).toContain('data-state="checked"');
    expect(extractTagContaining(html, 'aria-label="Toggle Disabled Rule"')).toContain('data-state="unchecked"');
  });

  it('disables the up-reorder button on the first rule and the down-reorder button on the last', () => {
    const first = makeRule({ id: 'a', name: 'First Rule', priority: 0 });
    const second = makeRule({ id: 'b', name: 'Second Rule', priority: 1 });
    contractRegistry.registerRulesProvider(makeRulesProvider([first, second]));

    const html = renderToString(
      <ToastProvider>
        <RuleManagerCard />
      </ToastProvider>,
    );

    expect(extractTagContaining(html, 'aria-label="Move First Rule up"')).toContain('disabled=""');
    expect(extractTagContaining(html, 'aria-label="Move Second Rule down"')).toContain('disabled=""');
  });
});

// ---------------------------------------------------------------------------
// Behavior: the exact pure functions the component's handlers delegate to
// ---------------------------------------------------------------------------

describe('RuleManagerCard — toggle enable/disable', () => {
  it('toggleRuleEnabled flips only the targeted rule', () => {
    const a = makeRule({ id: 'a', enabled: true });
    const b = makeRule({ id: 'b', enabled: false });
    const result = toggleRuleEnabled([a, b], 'a');

    expect(result.find((r) => r.id === 'a')?.enabled).toBe(false);
    expect(result.find((r) => r.id === 'b')?.enabled).toBe(false);
  });
});

describe('RuleManagerCard — priority reordering', () => {
  it('moveRulePriority swaps a rule with its upward neighbor and re-normalizes priorities', () => {
    const a = makeRule({ id: 'a', priority: 0 });
    const b = makeRule({ id: 'b', priority: 1 });
    const c = makeRule({ id: 'c', priority: 2 });

    const result = moveRulePriority([a, b, c], 'c', 'up');
    const sorted = [...result].sort((x, y) => x.priority - y.priority);

    expect(sorted.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('moveRulePriority is a no-op at the list boundaries', () => {
    const a = makeRule({ id: 'a', priority: 0 });
    const b = makeRule({ id: 'b', priority: 1 });

    expect(moveRulePriority([a, b], 'a', 'up')).toEqual([a, b]);
    expect(moveRulePriority([a, b], 'b', 'down')).toEqual([a, b]);
  });

  it('moveRulePriority swaps positions strictly among active rules and preserves tombstones (Requirement 2)', () => {
    const a = makeRule({ id: 'a', priority: 0 });
    const tombstone = makeRule({ id: 'tomb', priority: 1, deletedAt: 12345 });
    const b = makeRule({ id: 'b', priority: 1 });

    const result = moveRulePriority([a, tombstone, b], 'b', 'up');
    const active = result.filter((r) => !r.deletedAt).sort((x, y) => x.priority - y.priority);

    expect(active.map((r) => r.id)).toEqual(['b', 'a']);
    expect(active[0].priority).toBe(0);
    expect(active[1].priority).toBe(1);
    expect(result.find((r) => r.id === 'tomb')?.deletedAt).toBe(12345);
  });
});

describe('RuleManagerCard — deletion with undo restoration', () => {
  it('removeRuleById soft-deletes the targeted rule with deletedAt timestamp', () => {
    const a = makeRule({ id: 'a' });
    const b = makeRule({ id: 'b' });
    const result = removeRuleById([a, b], 'a');
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === 'a')?.deletedAt).toBeDefined();
    expect(result.find((r) => r.id === 'b')?.deletedAt).toBeUndefined();
    expect(result.filter((r) => !r.deletedAt)).toEqual([b]);
  });

  it('insertRule (undo restore) appends the rule back with the lowest evaluation precedence', () => {
    const a = makeRule({ id: 'a', priority: 0 });
    const restored = makeRule({ id: 'b', priority: 1 });

    const result = insertRule([a], restored);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.find((r) => r.id === 'b')?.priority).toBe(1);
  });
});

describe('RuleManagerCard — Apply Rules Now', () => {
  it('runApplyRulesNow triggers applyRulesToWindow and reports matched-tab telemetry via toast', async () => {
    const applyRulesToWindow = vi.fn().mockResolvedValue({ processed: 5, matched: 3 });
    const toast = vi.fn();

    await runApplyRulesNow(applyRulesToWindow, toast);

    expect(applyRulesToWindow).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('Applied rules: 3 tabs organized');
  });

  it('runApplyRulesNow reports a failure toast when the sweep rejects', async () => {
    const applyRulesToWindow = vi.fn().mockRejectedValue(new Error('background unreachable'));
    const toast = vi.fn();

    await runApplyRulesNow(applyRulesToWindow, toast);

    expect(toast).toHaveBeenCalledWith('Failed to apply rules');
  });
});

describe('RuleManagerCard — summarizeRule badges', () => {
  it('builds a condition-count badge plus one badge per action', () => {
    const rule = makeRule({
      conditions: [
        { field: 'domain', operator: 'contains', value: 'github.com' },
        { field: 'url', operator: 'contains', value: '/pull/' },
      ],
      actions: [
        { type: 'group', groupName: 'Dev', groupColor: 'purple' },
        { type: 'pin' },
      ],
    });

    const { badges } = summarizeRule(rule);
    expect(badges).toEqual(['2 conditions', 'Group: Dev [purple]', 'Pin Tab']);
  });
});
