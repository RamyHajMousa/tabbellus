/**
 * Pure form-state and validation helpers backing `RuleEditorModal`.
 *
 * Kept side-effect-free and independently testable — the component's
 * `useState`/`useEffect` wiring is a thin shell around these functions.
 */

import type { ActionType, ConditionField, ConditionOperator, RuleAction, RuleCondition, TabRule } from '@/core/contracts/rules';

export const CONDITION_FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'domain', label: 'Domain' },
  { value: 'title', label: 'Title' },
];

export const CONDITION_OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'startsWith' },
  { value: 'endsWith', label: 'endsWith' },
  { value: 'wildcard', label: 'wildcard' },
  { value: 'regex', label: 'regex' },
];

export const ACTION_TYPE_OPTIONS: { value: ActionType; label: string }[] = [
  { value: 'group', label: 'Auto-Group' },
  { value: 'space', label: 'Assign to Space' },
  { value: 'pin', label: 'Pin Tab' },
  { value: 'mute', label: 'Mute Audio' },
  { value: 'discard', label: 'Discard Tab' },
];

export const DEFAULT_CONDITION: RuleCondition = { field: 'domain', operator: 'contains', value: '' };
export const DEFAULT_ACTION: RuleAction = { type: 'pin' };

export interface RuleDraft {
  name: string;
  matchAll: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

/** Seeds editor form state from an existing rule (edit mode) or blank defaults (create mode). */
export function buildInitialDraft(rule: TabRule | null): RuleDraft {
  if (rule) {
    return {
      name: rule.name,
      matchAll: rule.matchAll,
      conditions: rule.conditions.length > 0 ? rule.conditions.map((c) => ({ ...c })) : [{ ...DEFAULT_CONDITION }],
      actions: rule.actions.length > 0 ? rule.actions.map((a) => ({ ...a })) : [{ ...DEFAULT_ACTION }],
    };
  }
  return {
    name: '',
    matchAll: false,
    conditions: [{ ...DEFAULT_CONDITION }],
    actions: [{ ...DEFAULT_ACTION }],
  };
}

/** Validates a regex pattern compiles. An empty pattern is treated as valid here — required-field checks are separate. */
export function isValidRegexPattern(pattern: string): boolean {
  if (!pattern) return true;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** True when a condition's regex operator carries syntactically invalid regex text worth surfacing to the user. */
export function isConditionRegexInvalid(condition: RuleCondition): boolean {
  return condition.operator === 'regex' && condition.value.trim() !== '' && !isValidRegexPattern(condition.value);
}

/**
 * Gates the Save button: requires a non-empty rule name, at least one
 * condition, every condition's value populated, and no invalid regex.
 */
export function validateRuleDraft(draft: Pick<RuleDraft, 'name' | 'conditions'>): boolean {
  if (!draft.name.trim()) return false;
  if (draft.conditions.length === 0) return false;

  for (const condition of draft.conditions) {
    if (!condition.value.trim()) return false;
    if (condition.operator === 'regex' && !isValidRegexPattern(condition.value)) return false;
  }

  return true;
}

export function addConditionRow(conditions: RuleCondition[]): RuleCondition[] {
  return [...conditions, { ...DEFAULT_CONDITION }];
}

export function updateConditionRow(conditions: RuleCondition[], index: number, condition: RuleCondition): RuleCondition[] {
  return conditions.map((c, i) => (i === index ? condition : c));
}

export function removeConditionRow(conditions: RuleCondition[], index: number): RuleCondition[] {
  return conditions.filter((_, i) => i !== index);
}

export function addActionRow(actions: RuleAction[]): RuleAction[] {
  return [...actions, { ...DEFAULT_ACTION }];
}

export function updateActionRow(actions: RuleAction[], index: number, action: RuleAction): RuleAction[] {
  return actions.map((a, i) => (i === index ? action : a));
}

export function removeActionRow(actions: RuleAction[], index: number): RuleAction[] {
  return actions.filter((_, i) => i !== index);
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Builds the final `TabRule` from the draft form state. Preserves `id`,
 * `priority`, and `createdAt` in edit mode; generates fresh identity and
 * timestamps in create mode (the caller/`insertRule` assigns the final
 * evaluation priority).
 */
export function buildRuleFromDraft(draft: RuleDraft, existingRule: TabRule | null): TabRule {
  const now = Date.now();

  if (existingRule) {
    return {
      ...existingRule,
      name: draft.name.trim(),
      matchAll: draft.matchAll,
      conditions: draft.conditions,
      actions: draft.actions,
      updatedAt: now,
    };
  }

  return {
    id: createId(),
    name: draft.name.trim(),
    enabled: true,
    priority: 0,
    matchAll: draft.matchAll,
    conditions: draft.conditions,
    actions: draft.actions,
    createdAt: now,
    updatedAt: now,
  };
}
