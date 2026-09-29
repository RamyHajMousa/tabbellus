import { describe, it, expect } from 'vitest';
import { validateRegex, MAX_REGEX_LENGTH } from '../engine/regexSafety';

describe('validateRegex', () => {
  describe('rejected patterns', () => {
    it('rejects nested quantifiers: (a+)+$', () => {
      const result = validateRegex('(a+)+$');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/nested quantifier/i);
      }
    });

    it('rejects alternation inside a quantified group: (a|a)*$', () => {
      const result = validateRegex('(a|a)*$');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/alternation inside a quantified group/i);
      }
    });

    it('rejects alternation inside a quantified group: (a|ab)+', () => {
      const result = validateRegex('(a|ab)+');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/alternation inside a quantified group/i);
      }
    });

    it('rejects nested range quantifiers: (.*a){20}', () => {
      const result = validateRegex('(.*a){20}');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/nested quantifier/i);
      }
    });

    it('rejects quantified character class inside a quantified group: ([a-z]+)*$', () => {
      const result = validateRegex('([a-z]+)*$');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/nested quantifier/i);
      }
    });

    it('rejects multiple quantifiers inside a quantified group: (\\w+\\s?)*$', () => {
      const result = validateRegex('(\\w+\\s?)*$');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/nested quantifier/i);
      }
    });

    it('rejects numeric backreferences: (a)\\1', () => {
      const result = validateRegex('(a)\\1');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/backreference/i);
      }
    });

    it('rejects named backreferences: (?<tag>a)\\k<tag>', () => {
      const result = validateRegex('(?<tag>a)\\k<tag>');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/backreference/i);
      }
    });

    it('rejects invalid regex syntax: (', () => {
      const result = validateRegex('(');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBeTruthy();
      }
    });

    it('rejects patterns exceeding the 250-character cap', () => {
      const longPattern = 'a'.repeat(MAX_REGEX_LENGTH + 1);
      const result = validateRegex(longPattern);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/exceeds maximum length/i);
      }
    });
    it('rejects deeply nested quantified groups: ((a)+)+', () => {
      const result = validateRegex('((a)+)+');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/nested quantifier/i);
      }
    });

    it('rejects alternation inside nested group when outer is quantified: ((a|b))*', () => {
      const result = validateRegex('((a|b))*');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/alternation inside a quantified group/i);
      }
    });

    it('rejects alternation inside non-capturing quantified group: (?:a|b)*', () => {
      const result = validateRegex('(?:a|b)*');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/alternation inside a quantified group/i);
      }
    });

    it('rejects alternation inside named quantified group: (?<name>a|b)+', () => {
      const result = validateRegex('(?<name>a|b)+');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/alternation inside a quantified group/i);
      }
    });

    it('rejects optional quantifier on group containing quantifier: (a+)?', () => {
      const result = validateRegex('(a+)?');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/nested quantifier/i);
      }
    });
  });

  describe('accepted patterns', () => {
    it('accepts URL with optional non-quantified group: ^https://(www\\.)?github\\.com/.*', () => {
      expect(validateRegex('^https://(www\\.)?github\\.com/.*')).toEqual({ ok: true });
    });

    it('accepts file extension pattern: \\.pdf$', () => {
      expect(validateRegex('\\.pdf$')).toEqual({ ok: true });
    });

    it('accepts unquantified alternation group: ^(mail|docs)\\.google\.com', () => {
      expect(validateRegex('^(mail|docs)\\.google\\.com')).toEqual({ ok: true });
    });

    it('accepts quantifier inside character class (literal): [a+]+', () => {
      expect(validateRegex('[a+]+')).toEqual({ ok: true });
    });

    it('accepts non-capturing group with optional quantifier: (?:foo)?bar', () => {
      expect(validateRegex('(?:foo)?bar')).toEqual({ ok: true });
    });

    it('accepts empty pattern (empty check handled separately)', () => {
      expect(validateRegex('')).toEqual({ ok: true });
    });

    it('accepts simple character ranges and anchors', () => {
      expect(validateRegex('^[a-zA-Z0-9_-]{3,16}$')).toEqual({ ok: true });
    });

    it('accepts escaped backslash before digit (not a backreference): \\\\1', () => {
      expect(validateRegex('\\\\1')).toEqual({ ok: true });
    });

    it('accepts unquantified lookahead containing quantifiers: (?=.*a).*', () => {
      expect(validateRegex('(?=.*a).*')).toEqual({ ok: true });
    });
  });
});
