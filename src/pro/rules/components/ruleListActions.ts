/**
 * Pure list-mutation helpers backing `RuleManagerCard`.
 *
 * Kept side-effect-free and independently testable — the component wires
 * these into `useUndoDelete`, `<Switch>`, and the reorder buttons rather
 * than mutating rule arrays inline.
 */

import type { TabRule } from '@/core/contracts/rules';

export function sortByPriority(rules: TabRule[]): TabRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

/** Flips `rule.enabled` for the target rule, leaving all others untouched. */
export function toggleRuleEnabled(rules: TabRule[], ruleId: string): TabRule[] {
  return rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled, updatedAt: Date.now() } : r));
}

/**
 * Swaps a rule's evaluation order with its immediate neighbor and
 * re-normalizes priority to sequential indices (0..n-1) matching the new
 * sorted order. No-ops at the list boundaries.
 * Strictly operates among active rules (omitting soft-deleted tombstones).
 */
export function moveRulePriority(rules: TabRule[], ruleId: string, direction: 'up' | 'down'): TabRule[] {
  const activeRules = rules.filter((r) => !r.deletedAt);
  const tombstones = rules.filter((r) => Boolean(r.deletedAt));
  const sorted = sortByPriority(activeRules);
  const index = sorted.findIndex((r) => r.id === ruleId);
  if (index === -1) return rules;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return rules;

  const reordered = [...sorted];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

  const now = Date.now();
  const updatedActive = reordered.map((r, i) => ({
    ...r,
    priority: i,
    updatedAt: i === index || i === targetIndex ? now : r.updatedAt,
  }));

  return [...updatedActive, ...tombstones];
}

/**
 * Marks a rule as soft-deleted by setting deletedAt and updatedAt timestamps
 * rather than destroying the object, enabling tombstone propagation across devices.
 */
export function removeRuleById(rules: TabRule[], ruleId: string): TabRule[] {
  const now = Date.now();
  return rules.map((r) => (r.id === ruleId ? { ...r, deletedAt: now, updatedAt: now } : r));
}

/**
 * Inserts (or replaces, if the id already exists — used by undo-restore) a
 * rule. New rules are appended with the lowest evaluation precedence
 * (highest `priority` value), so they never silently reorder ahead of a
 * user's existing custom rules. Clears deletedAt if restoring a soft-deleted rule.
 */
export function insertRule(rules: TabRule[], rule: TabRule): TabRule[] {
  const restored: TabRule = {
    ...rule,
    deletedAt: undefined,
    updatedAt: Date.now(),
  };
  const withoutExisting = rules.filter((r) => r.id !== rule.id);
  const alreadyHadPriority = rules.some((r) => r.id === rule.id);
  if (alreadyHadPriority) {
    return [...withoutExisting, restored];
  }
  const maxPriority = withoutExisting
    .filter((r) => !r.deletedAt)
    .reduce((max, r) => Math.max(max, r.priority), -1);
  return [...withoutExisting, { ...restored, priority: maxPriority + 1 }];
}

export interface RuleSummary {
  badges: string[];
}

/** Builds the compact summary tags shown on each rule row (e.g. "2 conditions", "Group: Dev [purple]"). */
export function summarizeRule(rule: TabRule): RuleSummary {
  const badges: string[] = [];
  const conditionCount = rule.conditions.length;
  badges.push(`${conditionCount} condition${conditionCount === 1 ? '' : 's'}`);

  for (const action of rule.actions) {
    switch (action.type) {
      case 'group':
        badges.push(`Group: ${action.groupName || 'Unnamed'}${action.groupColor ? ` [${action.groupColor}]` : ''}`);
        break;
      case 'space':
        badges.push(`Space: ${action.spaceName || 'Unassigned'}`);
        break;
      case 'pin':
        badges.push('Pin Tab');
        break;
      case 'mute':
        badges.push('Mute Audio');
        break;
      case 'discard':
        badges.push('Discard Tab');
        break;
      default:
        break;
    }
  }

  return { badges };
}

/**
 * Runs the "Apply Rules Now" flow: invokes the batch sweep and reports
 * telemetry (or failure) via toast. Extracted so the click handler's
 * behavior is directly testable without simulating a DOM click.
 */
export async function runApplyRulesNow(
  applyRulesToWindow: () => Promise<{ processed: number; matched: number }>,
  toast: (message: string) => void,
): Promise<void> {
  try {
    const result = await applyRulesToWindow();
    toast(`Applied rules: ${result.matched} tabs organized`);
  } catch {
    toast('Failed to apply rules');
  }
}
