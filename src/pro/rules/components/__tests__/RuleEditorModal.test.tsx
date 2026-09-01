/**
 * RuleEditorModal Unit Tests
 *
 * SSR/Portal note: this project has no jsdom/testing-library and Radix
 * Dialog portal content renders empty under Node `renderToString` (verified
 * empirically — see RuleManagerCard.test.tsx). All form population,
 * condition/action list mutation, regex validation, and save-gate logic
 * lives in `ruleEditorLogic.ts` as pure functions, exercised directly here.
 * A single closed-state SSR smoke test confirms the component itself
 * mounts without throwing.
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RuleEditorModal } from '../RuleEditorModal';
import type { RuleAction, RuleCondition, TabRule } from '@/core/contracts/rules';
import {
  addActionRow,
  addConditionRow,
  buildInitialDraft,
  buildRuleFromDraft,
  DEFAULT_ACTION,
  DEFAULT_CONDITION,
  isConditionRegexInvalid,
  isValidRegexPattern,
  removeActionRow,
  removeConditionRow,
  updateActionRow,
  updateConditionRow,
  validateRuleDraft,
} from '../ruleEditorLogic';

function makeRule(overrides: Partial<TabRule> = {}): TabRule {
  return {
    id: 'existing-id',
    name: 'Existing Rule',
    enabled: true,
    priority: 3,
    matchAll: true,
    conditions: [{ field: 'url', operator: 'startsWith', value: 'https://github.com/' }],
    actions: [{ type: 'pin' }],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe('RuleEditorModal — SSR smoke test', () => {
  it('renders without throwing while closed', () => {
    expect(() =>
      renderToString(<RuleEditorModal open={false} onOpenChange={() => {}} rule={null} onSave={() => {}} />),
    ).not.toThrow();
  });
});

describe('buildInitialDraft — form population', () => {
  it('seeds blank defaults in create mode', () => {
    const draft = buildInitialDraft(null);

    expect(draft.name).toBe('');
    expect(draft.matchAll).toBe(false);
    expect(draft.conditions).toEqual([DEFAULT_CONDITION]);
    expect(draft.actions).toEqual([DEFAULT_ACTION]);
  });

  it('seeds form fields from the existing rule in edit mode', () => {
    const rule = makeRule();
    const draft = buildInitialDraft(rule);

    expect(draft.name).toBe('Existing Rule');
    expect(draft.matchAll).toBe(true);
    expect(draft.conditions).toEqual(rule.conditions);
    expect(draft.actions).toEqual(rule.actions);
  });

  it('falls back to one default condition/action row when editing a rule with none', () => {
    const rule = makeRule({ conditions: [], actions: [] });
    const draft = buildInitialDraft(rule);

    expect(draft.conditions).toEqual([DEFAULT_CONDITION]);
    expect(draft.actions).toEqual([DEFAULT_ACTION]);
  });

  it('does not mutate the source rule arrays', () => {
    const rule = makeRule();
    const draft = buildInitialDraft(rule);
    draft.conditions[0].value = 'mutated';

    expect(rule.conditions[0].value).toBe('https://github.com/');
  });
});

describe('Condition row list operations', () => {
  it('appends a default blank condition row', () => {
    const result = addConditionRow([DEFAULT_CONDITION]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(DEFAULT_CONDITION);
  });

  it('updates only the targeted condition row', () => {
    const conditions: RuleCondition[] = [
      { field: 'domain', operator: 'contains', value: 'a.com' },
      { field: 'domain', operator: 'contains', value: 'b.com' },
    ];
    const result = updateConditionRow(conditions, 1, { field: 'title', operator: 'equals', value: 'Changed' });

    expect(result[0]).toEqual(conditions[0]);
    expect(result[1]).toEqual({ field: 'title', operator: 'equals', value: 'Changed' });
  });

  it('removes only the targeted condition row', () => {
    const conditions: RuleCondition[] = [
      { field: 'domain', operator: 'contains', value: 'a.com' },
      { field: 'domain', operator: 'contains', value: 'b.com' },
    ];
    expect(removeConditionRow(conditions, 0)).toEqual([conditions[1]]);
  });
});

describe('Regex validation feedback', () => {
  it('isValidRegexPattern accepts well-formed patterns and an empty string', () => {
    expect(isValidRegexPattern('')).toBe(true);
    expect(isValidRegexPattern('^https://.*\\.internal/.*$')).toBe(true);
  });

  it('isValidRegexPattern rejects malformed syntax', () => {
    expect(isValidRegexPattern('(unclosed[')).toBe(false);
  });

  it('isConditionRegexInvalid only flags non-empty regex operator conditions with bad syntax', () => {
    expect(isConditionRegexInvalid({ field: 'url', operator: 'regex', value: '(unclosed[' })).toBe(true);
    expect(isConditionRegexInvalid({ field: 'url', operator: 'regex', value: '^valid$' })).toBe(false);
    expect(isConditionRegexInvalid({ field: 'url', operator: 'regex', value: '' })).toBe(false);
    expect(isConditionRegexInvalid({ field: 'url', operator: 'contains', value: '(unclosed[' })).toBe(false);
  });
});

describe('Action row list operations', () => {
  it('appends a default pin action row', () => {
    const result = addActionRow([DEFAULT_ACTION]);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(DEFAULT_ACTION);
  });

  it('configures a group action with a name and Chrome color swatch', () => {
    const actions: RuleAction[] = [{ type: 'group' }];
    const named = updateActionRow(actions, 0, { type: 'group', groupName: 'Dev' });
    const colored = updateActionRow(named, 0, { type: 'group', groupName: 'Dev', groupColor: 'purple' });

    expect(colored[0]).toEqual({ type: 'group', groupName: 'Dev', groupColor: 'purple' });
  });

  it('removes only the targeted action row', () => {
    const actions: RuleAction[] = [{ type: 'pin' }, { type: 'mute' }];
    expect(removeActionRow(actions, 0)).toEqual([{ type: 'mute' }]);
  });
});

describe('validateRuleDraft — Save button gate', () => {
  it('rejects a blank rule name', () => {
    expect(validateRuleDraft({ name: '   ', conditions: [{ field: 'url', operator: 'contains', value: 'x' }] })).toBe(false);
  });

  it('rejects an empty conditions list', () => {
    expect(validateRuleDraft({ name: 'My Rule', conditions: [] })).toBe(false);
  });

  it('rejects a condition with an empty value', () => {
    expect(
      validateRuleDraft({ name: 'My Rule', conditions: [{ field: 'url', operator: 'contains', value: '   ' }] }),
    ).toBe(false);
  });

  it('rejects when any regex condition has invalid syntax', () => {
    expect(
      validateRuleDraft({
        name: 'My Rule',
        conditions: [
          { field: 'url', operator: 'contains', value: 'ok' },
          { field: 'url', operator: 'regex', value: '(unclosed[' },
        ],
      }),
    ).toBe(false);
  });

  it('accepts a fully valid draft', () => {
    expect(
      validateRuleDraft({
        name: 'My Rule',
        conditions: [{ field: 'domain', operator: 'contains', value: 'github.com' }],
      }),
    ).toBe(true);
  });
});

describe('buildRuleFromDraft', () => {
  it('generates a fresh id and timestamps in create mode', () => {
    const draft = { name: '  New Rule  ', matchAll: false, conditions: [], actions: [] };
    const rule = buildRuleFromDraft(draft, null);

    expect(rule.id).toBeTruthy();
    expect(rule.name).toBe('New Rule');
    expect(rule.enabled).toBe(true);
    expect(rule.createdAt).toBe(rule.updatedAt);
  });

  it('preserves id, priority, and createdAt while refreshing updatedAt in edit mode', () => {
    const existing = makeRule();
    const draft = { name: 'Renamed', matchAll: false, conditions: [], actions: [] };
    const rule = buildRuleFromDraft(draft, existing);

    expect(rule.id).toBe(existing.id);
    expect(rule.priority).toBe(existing.priority);
    expect(rule.createdAt).toBe(existing.createdAt);
    expect(rule.name).toBe('Renamed');
    expect(rule.updatedAt).toBeGreaterThanOrEqual(existing.updatedAt);
  });
});

describe('updateActionRow — space actions', () => {
  it('updates an action with spaceId and spaceName', () => {
    const actions: RuleAction[] = [{ type: 'space' }];
    const updated = updateActionRow(actions, 0, {
      type: 'space',
      spaceId: 42,
      spaceName: 'Design Workspace',
    });

    expect(updated[0]).toEqual({
      type: 'space',
      spaceId: 42,
      spaceName: 'Design Workspace',
    });
  });
});
