/**
 * Pure helpers backing `TemplatePickerModal`.
 */

import type { TabRule } from '@/core/contracts/rules';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Instantiates a starter preset into a real `TabRule`: generates a fresh
 * UUID, appends it with the lowest evaluation precedence (highest
 * `priority` value, so it never reorders ahead of existing custom rules),
 * and stamps active `createdAt`/`updatedAt` timestamps.
 */
export function instantiateTemplate(
  template: Omit<TabRule, 'id' | 'createdAt' | 'updatedAt' | 'priority'>,
  existingRules: TabRule[],
): TabRule {
  const now = Date.now();
  const maxPriority = existingRules
    .filter((r) => !r.deletedAt)
    .reduce((max, r) => Math.max(max, r.priority), -1);

  return {
    ...template,
    id: createId(),
    priority: maxPriority + 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Runs the "Add Rule" 1-click flow: instantiates the template, hands it to
 * the caller's append handler, and reports confirmation via toast.
 * Extracted so the click handler's behavior is directly testable without
 * simulating a DOM click.
 */
export async function runAddTemplate(
  template: Omit<TabRule, 'id' | 'createdAt' | 'updatedAt' | 'priority'>,
  existingRules: TabRule[],
  onAddRule: (rule: TabRule) => void | Promise<void>,
  toast: (message: string) => void,
): Promise<TabRule> {
  const rule = instantiateTemplate(template, existingRules);
  await onAddRule(rule);
  toast(`Added "${rule.name}" rule`);
  return rule;
}
