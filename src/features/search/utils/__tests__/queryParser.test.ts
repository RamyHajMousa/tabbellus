import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../queryParser';

describe('parseSearchQuery (Lexer & AST Parser)', () => {
    describe('pure text queries', () => {
        it('returns empty result for empty string or whitespace', () => {
            expect(parseSearchQuery('')).toEqual({
                rawText: '',
                terms: [],
                filters: [],
                trailingOperator: undefined,
            });

            expect(parseSearchQuery('   ')).toEqual({
                rawText: '',
                terms: [],
                filters: [],
                trailingOperator: undefined,
            });
        });

        it('parses single and multiple unquoted terms', () => {
            const result = parseSearchQuery('react vite typescript');
            expect(result.terms).toEqual(['react', 'vite', 'typescript']);
            expect(result.rawText).toBe('react vite typescript');
            expect(result.filters).toHaveLength(0);
            expect(result.trailingOperator).toBeUndefined();
        });

        it('parses quoted terms with spaces', () => {
            const result = parseSearchQuery('"state management" zustand');
            expect(result.terms).toEqual(['state management', 'zustand']);
            expect(result.rawText).toBe('state management zustand');
            expect(result.filters).toHaveLength(0);
        });

        it('does not confuse URLs or non-filter colons with filter directives', () => {
            const result = parseSearchQuery('https://github.com/facebook/react note:123');
            expect(result.terms).toEqual(['https://github.com/facebook/react', 'note:123']);
            expect(result.rawText).toBe('https://github.com/facebook/react note:123');
            expect(result.filters).toHaveLength(0);
        });
    });

    describe('single and multi-directive parsing', () => {
        it('parses single standard directive', () => {
            const result = parseSearchQuery('domain:github.com');
            expect(result.filters).toEqual([
                {
                    key: 'domain',
                    value: 'github.com',
                    negated: false,
                    rawToken: 'domain:github.com',
                },
            ]);
            expect(result.terms).toEqual([]);
            expect(result.rawText).toBe('');
            expect(result.trailingOperator).toEqual({
                key: 'domain',
                partialValue: 'github.com',
                negated: false,
                startIndex: 0,
                endIndex: 17,
                rawToken: 'domain:github.com',
                hasColon: true,
            });
        });

        it('parses mixed free terms and directives in any order', () => {
            const result = parseSearchQuery('auth domain:github.com in:active pull requests');
            expect(result.terms).toEqual(['auth', 'pull', 'requests']);
            expect(result.rawText).toBe('auth pull requests');
            expect(result.filters).toEqual([
                {
                    key: 'domain',
                    value: 'github.com',
                    negated: false,
                    rawToken: 'domain:github.com',
                },
                {
                    key: 'in',
                    value: 'active',
                    negated: false,
                    rawToken: 'in:active',
                },
            ]);
            expect(result.trailingOperator).toBeUndefined();
        });

        it('supports site: synonym for domain:', () => {
            const result = parseSearchQuery('site:docs.google.com');
            expect(result.filters).toEqual([
                {
                    key: 'site',
                    value: 'docs.google.com',
                    negated: false,
                    rawToken: 'site:docs.google.com',
                },
            ]);
        });
    });

    describe('quoted values and unclosed quotes', () => {
        it('parses quoted values containing spaces', () => {
            const result = parseSearchQuery('in:"Project Alpha" search');
            expect(result.filters).toEqual([
                {
                    key: 'in',
                    value: 'Project Alpha',
                    negated: false,
                    rawToken: 'in:"Project Alpha"',
                },
            ]);
            expect(result.terms).toEqual(['search']);
            expect(result.rawText).toBe('search');
        });

        it('recovers unclosed quotes gracefully during active typing', () => {
            const result = parseSearchQuery('in:"Proj');
            expect(result.filters).toEqual([
                {
                    key: 'in',
                    value: 'Proj',
                    negated: false,
                    rawToken: 'in:"Proj',
                },
            ]);
            expect(result.terms).toEqual([]);
            expect(result.rawText).toBe('');
            expect(result.trailingOperator).toEqual({
                key: 'in',
                partialValue: 'Proj',
                negated: false,
                startIndex: 0,
                endIndex: 8,
                rawToken: 'in:"Proj',
                hasColon: true,
            });
        });
    });

    describe('negation prefix (-)', () => {
        it('parses negated directive and captures leading dash in rawToken', () => {
            const result = parseSearchQuery('-domain:youtube.com');
            expect(result.filters).toEqual([
                {
                    key: 'domain',
                    value: 'youtube.com',
                    negated: true,
                    rawToken: '-domain:youtube.com',
                },
            ]);
        });

        it('parses negated quoted directive', () => {
            const result = parseSearchQuery('-in:"Work Space" test');
            expect(result.filters).toEqual([
                {
                    key: 'in',
                    value: 'Work Space',
                    negated: true,
                    rawToken: '-in:"Work Space"',
                },
            ]);
            expect(result.terms).toEqual(['test']);
        });

        it('does not treat negative numbers or standalone dashes as negated operators', () => {
            const result = parseSearchQuery('-10 -word');
            expect(result.terms).toEqual(['-10', '-word']);
            expect(result.filters).toHaveLength(0);
        });
    });

    describe('case insensitivity', () => {
        it('normalizes uppercase and mixed-case operator keys', () => {
            const result = parseSearchQuery('DOMAIN:github.com IS:AUDIBLE IN:Active');
            expect(result.filters).toEqual([
                {
                    key: 'domain',
                    value: 'github.com',
                    negated: false,
                    rawToken: 'DOMAIN:github.com',
                },
                {
                    key: 'is',
                    value: 'AUDIBLE',
                    negated: false,
                    rawToken: 'IS:AUDIBLE',
                },
                {
                    key: 'in',
                    value: 'Active',
                    negated: false,
                    rawToken: 'IN:Active',
                },
            ]);
        });
    });

    describe('trailing operators for autocomplete', () => {
        it('detects trailing operator with empty value when cursor is on colon', () => {
            const result = parseSearchQuery('github in:');
            expect(result.trailingOperator).toEqual({
                key: 'in',
                partialValue: '',
                negated: false,
                startIndex: 7,
                endIndex: 10,
                rawToken: 'in:',
                hasColon: true,
            });
            // Empty value directive should not be added to active filters
            expect(result.filters).toHaveLength(0);
            expect(result.terms).toEqual(['github']);
        });

        it('detects trailing operator with partial value being typed', () => {
            const result = parseSearchQuery('tab is:aud');
            expect(result.trailingOperator).toEqual({
                key: 'is',
                partialValue: 'aud',
                negated: false,
                startIndex: 4,
                endIndex: 10,
                rawToken: 'is:aud',
                hasColon: true,
            });
            expect(result.filters).toEqual([
                {
                    key: 'is',
                    value: 'aud',
                    negated: false,
                    rawToken: 'is:aud',
                },
            ]);
        });

        it('detects operator discovery mode when cursor types incomplete operator key without colon', () => {
            const result = parseSearchQuery('tab i');
            expect(result.trailingOperator).toEqual({
                partialKey: 'i',
                partialValue: '',
                negated: false,
                startIndex: 4,
                endIndex: 5,
                rawToken: 'i',
                hasColon: false,
            });
            expect(result.terms).toEqual(['tab', 'i']);
        });

        it('detects negated operator discovery mode', () => {
            const result = parseSearchQuery('-d');
            expect(result.trailingOperator).toEqual({
                partialKey: 'd',
                partialValue: '',
                negated: true,
                startIndex: 0,
                endIndex: 2,
                rawToken: '-d',
                hasColon: false,
            });
        });

        it('clears trailing operator if input ends with trailing whitespace', () => {
            const result = parseSearchQuery('is:audible ');
            expect(result.trailingOperator).toBeUndefined();
            expect(result.filters).toHaveLength(1);

            const result2 = parseSearchQuery('tab i ');
            expect(result2.trailingOperator).toBeUndefined();
        });
    });
});
