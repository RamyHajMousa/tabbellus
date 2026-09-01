/**
 * ReDoS-Safe Tab Rule Condition Matcher
 *
 * Evaluates a single tab (url/title) against declarative `RuleCondition`
 * and `TabRule` definitions from `@/core/contracts/rules.ts`.
 *
 * SAFETY NOTES:
 * - `wildcard` patterns are converted to fully escaped, anchored RegExp
 *   objects (no raw user regex reaches the engine for glob matching).
 * - `regex` patterns are capped at `MAX_REGEX_LENGTH` characters and
 *   compiled inside a try/catch to gracefully swallow syntax errors.
 *   The length cap bounds pattern complexity as a risk-reduction heuristic;
 *   it is not a runtime execution timeout guarantee against catastrophic
 *   backtracking.
 */

import { tryParseHost } from '@/lib/sessionUtils';
import type { ConditionField, RuleCondition, TabRule } from '@/core/contracts/rules';

const MAX_REGEX_LENGTH = 250;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converts a glob pattern (`*` / `?`) into a safe, fully-anchored RegExp. */
function wildcardToRegExp(pattern: string, caseSensitive: boolean): RegExp | null {
  try {
    const escaped = escapeRegExp(pattern)
      .replace(/\\\*/g, '.*')
      .replace(/\\\?/g, '.');
    return new RegExp(`^${escaped}$`, caseSensitive ? '' : 'i');
  } catch {
    return null;
  }
}

export class RuleMatcher {
  /**
   * Extracts the raw (un-normalized) field value from a tab for a given condition field.
   * Returns `null` when the field is unavailable (e.g., missing title, unparsable URL).
   */
  private static extractField(tab: { url?: string; title?: string }, field: ConditionField): string | null {
    switch (field) {
      case 'url':
        return tab.url ?? null;
      case 'title':
        return tab.title ?? null;
      case 'domain': {
        if (!tab.url) return null;
        const host = tryParseHost(tab.url);
        return host || null;
      }
      default:
        return null;
    }
  }

  static evaluateCondition(tab: { url?: string; title?: string }, condition: RuleCondition): boolean {
    const target = RuleMatcher.extractField(tab, condition.field);
    if (target === null) return false;

    const caseSensitive = Boolean(condition.caseSensitive);
    const trimmedValue = condition.value.trim();
    if (!trimmedValue) return false;

    switch (condition.operator) {
      case 'equals': {
        const a = caseSensitive ? target.trim() : target.trim().toLowerCase();
        const b = caseSensitive ? trimmedValue : trimmedValue.toLowerCase();
        return a === b;
      }
      case 'contains': {
        const a = caseSensitive ? target : target.toLowerCase();
        const b = caseSensitive ? trimmedValue : trimmedValue.toLowerCase();
        return a.includes(b);
      }
      case 'startsWith': {
        const a = caseSensitive ? target : target.toLowerCase();
        const b = caseSensitive ? trimmedValue : trimmedValue.toLowerCase();
        return a.startsWith(b);
      }
      case 'endsWith': {
        const a = caseSensitive ? target : target.toLowerCase();
        const b = caseSensitive ? trimmedValue : trimmedValue.toLowerCase();
        return a.endsWith(b);
      }
      case 'wildcard': {
        const regex = wildcardToRegExp(trimmedValue, caseSensitive);
        if (!regex) return false;
        try {
          return regex.test(target.trim());
        } catch {
          return false;
        }
      }
      case 'regex': {
        if (trimmedValue.length > MAX_REGEX_LENGTH) return false;
        try {
          const regex = new RegExp(trimmedValue, caseSensitive ? '' : 'i');
          return regex.test(target);
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  }

  /**
   * Evaluates all conditions for a rule according to `rule.matchAll` (AND vs. OR).
   * A rule with zero conditions never matches — an empty condition set is
   * treated as an incomplete/unconfigured rule, not a catch-all.
   */
  static evaluateRule(tab: { url?: string; title?: string }, rule: TabRule): boolean {
    if (!rule.conditions || rule.conditions.length === 0) return false;

    return rule.matchAll
      ? rule.conditions.every((condition) => RuleMatcher.evaluateCondition(tab, condition))
      : rule.conditions.some((condition) => RuleMatcher.evaluateCondition(tab, condition));
  }
}
