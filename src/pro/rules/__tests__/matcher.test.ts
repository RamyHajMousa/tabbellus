import { describe, it, expect } from 'vitest';
import { RuleMatcher } from '../engine/matcher';
import type { RuleCondition, TabRule } from '@/core/contracts/rules';

describe('RuleMatcher.evaluateCondition', () => {
  describe('domain field extraction', () => {
    it('matches exact domain via equals', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'equals', value: 'github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://github.com/anthropics' }, condition)).toBe(true);
    });

    it('strips www. and lowercases when extracting the domain', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'equals', value: 'github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://WWW.GITHUB.com/foo' }, condition)).toBe(true);
    });

    it('does not match a different subdomain via equals', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'equals', value: 'github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://gist.github.com/foo' }, condition)).toBe(false);
    });

    it('matches subdomains via contains', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'contains', value: 'github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://gist.github.com/foo' }, condition)).toBe(true);
    });

    it('returns false when the url is missing for a domain condition', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'contains', value: 'github.com' };
      expect(RuleMatcher.evaluateCondition({}, condition)).toBe(false);
    });

    it('returns false when the url is unparsable', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'contains', value: 'github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'not-a-valid-url' }, condition)).toBe(false);
    });
  });

  describe('url and title fields', () => {
    it('matches url via startsWith', () => {
      const condition: RuleCondition = { field: 'url', operator: 'startsWith', value: 'https://github.com/' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://github.com/anthropics/claude' }, condition)).toBe(true);
    });

    it('matches title via contains, case-insensitive by default', () => {
      const condition: RuleCondition = { field: 'title', operator: 'contains', value: 'PULL REQUEST' };
      expect(RuleMatcher.evaluateCondition({ title: 'Open a pull request #42' }, condition)).toBe(true);
    });

    it('respects caseSensitive: true', () => {
      const condition: RuleCondition = {
        field: 'title',
        operator: 'contains',
        value: 'PULL REQUEST',
        caseSensitive: true,
      };
      expect(RuleMatcher.evaluateCondition({ title: 'Open a pull request #42' }, condition)).toBe(false);
    });

    it('returns false when the title is missing', () => {
      const condition: RuleCondition = { field: 'title', operator: 'contains', value: 'foo' };
      expect(RuleMatcher.evaluateCondition({}, condition)).toBe(false);
    });

    it('matches url via endsWith', () => {
      const condition: RuleCondition = { field: 'url', operator: 'endsWith', value: '/issues' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://github.com/org/repo/issues' }, condition)).toBe(true);
    });

    it('treats a blank condition value as never matching', () => {
      const condition: RuleCondition = { field: 'url', operator: 'contains', value: '   ' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://github.com/' }, condition)).toBe(false);
    });
  });

  describe('wildcard operator', () => {
    it('matches subdomains with a leading *.', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'wildcard', value: '*.github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://gist.github.com/x' }, condition)).toBe(true);
      expect(RuleMatcher.evaluateCondition({ url: 'https://api.github.com/x' }, condition)).toBe(true);
    });

    it('does not match the apex domain with a leading *. pattern', () => {
      const condition: RuleCondition = { field: 'domain', operator: 'wildcard', value: '*.github.com' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://github.com/x' }, condition)).toBe(false);
    });

    it('matches trailing wildcard path patterns like https://corp/*', () => {
      const condition: RuleCondition = { field: 'url', operator: 'wildcard', value: 'https://corp/*' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://corp/dashboard' }, condition)).toBe(true);
      expect(RuleMatcher.evaluateCondition({ url: 'https://corp/' }, condition)).toBe(true);
      expect(RuleMatcher.evaluateCondition({ url: 'https://other/dashboard' }, condition)).toBe(false);
    });

    it('escapes regex-special characters embedded in the literal pattern segments', () => {
      const condition: RuleCondition = { field: 'url', operator: 'wildcard', value: 'https://a.b.com/*' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://aXbXcom/path' }, condition)).toBe(false);
      expect(RuleMatcher.evaluateCondition({ url: 'https://a.b.com/path' }, condition)).toBe(true);
    });

    it('supports single-character ? wildcards', () => {
      const condition: RuleCondition = { field: 'url', operator: 'wildcard', value: 'https://site.com/page?' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://site.com/page1' }, condition)).toBe(true);
      expect(RuleMatcher.evaluateCondition({ url: 'https://site.com/page12' }, condition)).toBe(false);
    });
  });

  describe('regex operator', () => {
    it('matches a valid regex pattern', () => {
      const condition: RuleCondition = { field: 'url', operator: 'regex', value: '^https://.*\\.internal/.*$' };
      expect(RuleMatcher.evaluateCondition({ url: 'https://vpn.internal/portal' }, condition)).toBe(true);
      expect(RuleMatcher.evaluateCondition({ url: 'https://external.com/portal' }, condition)).toBe(false);
    });

    it('gracefully returns false on malformed regex syntax instead of throwing', () => {
      const condition: RuleCondition = { field: 'url', operator: 'regex', value: '(unclosed[' };
      expect(() => RuleMatcher.evaluateCondition({ url: 'https://example.com' }, condition)).not.toThrow();
      expect(RuleMatcher.evaluateCondition({ url: 'https://example.com' }, condition)).toBe(false);
    });

    it('rejects patterns longer than the 250-character ReDoS safety cap', () => {
      const longPattern = '(a+)+'.repeat(60); // far past 250 chars
      const condition: RuleCondition = { field: 'url', operator: 'regex', value: longPattern };
      expect(() => RuleMatcher.evaluateCondition({ url: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' }, condition)).not.toThrow();
      expect(RuleMatcher.evaluateCondition({ url: 'aaa' }, condition)).toBe(false);
    });

    it('respects caseSensitive: false by default', () => {
      const condition: RuleCondition = { field: 'title', operator: 'regex', value: 'invoice' };
      expect(RuleMatcher.evaluateCondition({ title: 'Your INVOICE is ready' }, condition)).toBe(true);
    });
  });
});

describe('RuleMatcher.evaluateRule', () => {
  const baseRule: Omit<TabRule, 'conditions' | 'matchAll'> = {
    id: 'r1',
    name: 'Test Rule',
    enabled: true,
    priority: 0,
    actions: [],
    createdAt: 0,
    updatedAt: 0,
  };

  it('returns false for a rule with no conditions regardless of matchAll', () => {
    expect(RuleMatcher.evaluateRule({ url: 'https://x.com' }, { ...baseRule, conditions: [], matchAll: true })).toBe(false);
    expect(RuleMatcher.evaluateRule({ url: 'https://x.com' }, { ...baseRule, conditions: [], matchAll: false })).toBe(false);
  });

  it('requires all conditions to pass when matchAll is true (AND)', () => {
    const rule: TabRule = {
      ...baseRule,
      matchAll: true,
      conditions: [
        { field: 'domain', operator: 'contains', value: 'github.com' },
        { field: 'url', operator: 'contains', value: '/pull/' },
      ],
    };

    expect(RuleMatcher.evaluateRule({ url: 'https://github.com/org/repo/pull/1' }, rule)).toBe(true);
    expect(RuleMatcher.evaluateRule({ url: 'https://github.com/org/repo/issues/1' }, rule)).toBe(false);
  });

  it('requires only one condition to pass when matchAll is false (OR)', () => {
    const rule: TabRule = {
      ...baseRule,
      matchAll: false,
      conditions: [
        { field: 'domain', operator: 'contains', value: 'github.com' },
        { field: 'domain', operator: 'contains', value: 'gitlab.com' },
      ],
    };

    expect(RuleMatcher.evaluateRule({ url: 'https://gitlab.com/org/repo' }, rule)).toBe(true);
    expect(RuleMatcher.evaluateRule({ url: 'https://bitbucket.org/org/repo' }, rule)).toBe(false);
  });
});
