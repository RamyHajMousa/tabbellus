/**
 * ReDoS-Safe Static Regular Expression Validator
 *
 * Provides static validation of user-defined regular expressions to prevent
 * Regular Expression Denial of Service (ReDoS) attacks in single-threaded
 * extension contexts (such as the MV3 background service worker).
 *
 * SAFETY INVARIANTS:
 * - Reject nested quantifiers: a quantified group whose body contains a quantifier
 *   (e.g., `(a+)+`, `(.*a){20}`, `([a-z]+)*`, `(\w+\s?)*$`).
 * - Reject alternation inside a quantified group (e.g., `(a|a)*`, `(a|ab)+`).
 * - Reject backreferences (e.g., `\1`, `\k<name>`).
 * - Reject patterns failing compilation or exceeding MAX_REGEX_LENGTH (250 chars).
 * - Correctly treats quantifiers and alternations inside character classes `[...]`
 *   as literal characters.
 * - Recognizes non-capturing, named, and lookaround group headers without mistaking
 *   their syntax (e.g. `?` in `(?:`) for quantifiers.
 * - Prefers false positives (rejecting safe patterns) over false negatives.
 */

export const MAX_REGEX_LENGTH = 250;

export interface RegexValidationSuccess {
  ok: true;
}

export interface RegexValidationFailure {
  ok: false;
  reason: string;
}

export type RegexValidationResult = RegexValidationSuccess | RegexValidationFailure;

interface GroupFrame {
  hasQuantifier: boolean;
  hasAlternation: boolean;
}

/**
 * Returns the character length of a quantifier starting at pattern[pos],
 * or 0 if no quantifier begins at pos.
 * Handles greedy and lazy quantifiers: *, *?, +, +?, ?, ??, {n}, {n}?, {n,}, {n,}?, {n,m}, {n,m}?
 */
function getQuantifierLength(pattern: string, pos: number): number {
  if (pos >= pattern.length) return 0;

  const char = pattern[pos];
  if (char === '*' || char === '+' || char === '?') {
    let len = 1;
    if (pos + 1 < pattern.length && pattern[pos + 1] === '?') {
      len = 2;
    }
    return len;
  }

  if (char === '{') {
    const slice = pattern.slice(pos);
    const match = slice.match(/^\{\d+(?:,\d*)?\}/);
    if (match) {
      let len = match[0].length;
      if (pos + len < pattern.length && pattern[pos + len] === '?') {
        len += 1;
      }
      return len;
    }
  }

  return 0;
}

export function validateRegex(pattern: string): RegexValidationResult {
  if (typeof pattern !== 'string') {
    return { ok: false, reason: 'Pattern must be a string' };
  }

  if (pattern.length > MAX_REGEX_LENGTH) {
    return {
      ok: false,
      reason: `Pattern exceeds maximum length of ${MAX_REGEX_LENGTH} characters`,
    };
  }

  // An empty pattern is treated as valid (matches everything in regex, required-field checks are separate)
  if (pattern === '') {
    return { ok: true };
  }

  // 1. Verify standard syntax compilation
  try {
    new RegExp(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid regular expression syntax';
    return {
      ok: false,
      reason: message || 'Invalid regular expression syntax',
    };
  }

  // 2. Scan pattern for ReDoS constructs
  const groupStack: GroupFrame[] = [];
  let inCharClass = false;
  let i = 0;
  const len = pattern.length;

  while (i < len) {
    const char = pattern[i];

    // Handle escape sequences
    if (char === '\\') {
      const next = pattern[i + 1];

      // Check for backreferences outside character classes
      if (!inCharClass) {
        if (next >= '1' && next <= '9') {
          return { ok: false, reason: 'Backreferences are not permitted' };
        }
        if (next === 'k' && (pattern[i + 2] === '<' || pattern[i + 2] === "'")) {
          return { ok: false, reason: 'Backreferences are not permitted' };
        }
      }

      // Skip escape sequence (\ + escaped character)
      i += 2;
      continue;
    }

    // Inside character class: [...]
    if (inCharClass) {
      if (char === ']') {
        inCharClass = false;
      }
      // Everything inside [...] is literal (quantifiers, groups, alternations)
      i += 1;
      continue;
    }

    // Outside character class
    if (char === '[') {
      inCharClass = true;
      i += 1;
      continue;
    }

    if (char === '(') {
      // Check group type prefix
      let headerLen = 1;
      if (pattern[i + 1] === '?') {
        if (pattern[i + 2] === ':' || pattern[i + 2] === '=' || pattern[i + 2] === '!') {
          headerLen = 3; // '(?:', '(?=', '(?!'
        } else if (pattern.startsWith('(?<=', i) || pattern.startsWith('(?<!', i)) {
          headerLen = 4; // '(?<=', '(?<!'
        } else if (pattern[i + 2] === '<') {
          const closingAngle = pattern.indexOf('>', i + 3);
          if (closingAngle !== -1) {
            headerLen = closingAngle - i + 1; // '(?<name>'
          }
        }
      }

      groupStack.push({
        hasQuantifier: false,
        hasAlternation: false,
      });

      i += headerLen;
      continue;
    }

    if (char === ')') {
      const closedGroup = groupStack.pop();
      if (!closedGroup) {
        return { ok: false, reason: "Unmatched ')'" };
      }

      // Check if this group is quantified: )+, )*, )?, ){n,m}
      const qLen = getQuantifierLength(pattern, i + 1);

      if (qLen > 0) {
        // Group is quantified
        if (closedGroup.hasQuantifier) {
          return { ok: false, reason: 'Nested quantifiers are not permitted' };
        }
        if (closedGroup.hasAlternation) {
          return { ok: false, reason: 'Alternation inside a quantified group is not permitted' };
        }

        // Parent group now contains a quantified element
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasQuantifier = true;
        }

        i += 1 + qLen;
        continue;
      } else {
        // Group is not quantified; bubble up state to enclosing parent
        if (groupStack.length > 0) {
          const parent = groupStack[groupStack.length - 1];
          parent.hasQuantifier = parent.hasQuantifier || closedGroup.hasQuantifier;
          parent.hasAlternation = parent.hasAlternation || closedGroup.hasAlternation;
        }

        i += 1;
        continue;
      }
    }

    if (char === '|') {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasAlternation = true;
      }
      i += 1;
      continue;
    }

    // Check if the current character is a quantifier on a preceding token (e.g. a*, a+, a?, a{2}, \w+, [a-z]+)
    const qLen = getQuantifierLength(pattern, i);
    if (qLen > 0) {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasQuantifier = true;
      }
      i += qLen;
      continue;
    }

    // Ordinary character
    i += 1;
  }

  return { ok: true };
}
