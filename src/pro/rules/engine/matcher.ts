/**
 * ReDoS-Safe Tab Rule Condition Matcher
 *
 * Evaluates a single tab (url/title) against declarative `RuleCondition`
 * and `TabRule` definitions from `@/core/contracts/rules.ts`.
 *
 * SAFETY NOTES:
 * - `wildcard` patterns are converted to fully escaped, anchored RegExp
 *   objects (no raw user regex reaches the engine for glob matching).
 * - `regex` patterns undergo static complexity validation (rejecting nested
 *   quantifiers, alternation inside quantified groups, and backreferences),
 *   are capped at `MAX_REGEX_LENGTH` (250 chars), and are tested only
 *   against the first `MAX_REGEX_TARGET_LENGTH` (2,048 chars) of target strings.
 * - Compiled `RegExp` objects are cached per pattern and flags to avoid
 *   re-validation on every tab event.
 * - These static complexity checks and caps are a risk-reduction heuristic
 *   and NOT a formal proof of safety or a substitute for process/thread isolation.
 */

import { tryParseHost } from '@/lib/sessionUtils';
import type { ConditionField, RuleCondition, TabRule } from '@/core/contracts/rules';
import { validateRegex, MAX_REGEX_LENGTH } from './regexSafety';

export { MAX_REGEX_LENGTH };
export const MAX_REGEX_TARGET_LENGTH = 2048;

const regexCache = new Map<string, RegExp | null>();
const MAX_CACHE_SIZE = 500;

export function getCachedRegExp(pattern: string, caseSensitive: boolean): RegExp | null {
  const cacheKey = `${caseSensitive ? 's' : 'i'}:${pattern}`;
  if (regexCache.has(cacheKey)) {
    return regexCache.get(cacheKey) ?? null;
  }

  const validation = validateRegex(pattern);
  if (!validation.ok) {
    if (regexCache.size >= MAX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey !== undefined) regexCache.delete(firstKey);
    }
    regexCache.set(cacheKey, null);
    return null;
  }

  try {
    const compiled = new RegExp(pattern, caseSensitive ? '' : 'i');
    if (regexCache.size >= MAX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey !== undefined) regexCache.delete(firstKey);
    }
    regexCache.set(cacheKey, compiled);
    return compiled;
  } catch {
    regexCache.set(cacheKey, null);
    return null;
  }
}

export function clearRegexCache(): void {
  regexCache.clear();
}

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
        const regex = getCachedRegExp(trimmedValue, caseSensitive);
        if (!regex) return false;
        try {
          const truncatedTarget = target.slice(0, MAX_REGEX_TARGET_LENGTH);
          return regex.test(truncatedTarget);
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
