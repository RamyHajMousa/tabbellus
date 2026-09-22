import { describe, it, expect } from 'vitest';
import { getDirectiveSuggestions } from '../suggestionEngine';
import type { TrailingOperator } from '../../types';

describe('suggestionEngine (Directive Autocomplete & Dynamic Typeahead)', () => {
    describe('edge cases and fallbacks', () => {
        it('returns empty array when trailingOperator is undefined', () => {
            expect(getDirectiveSuggestions(undefined)).toEqual([]);
        });

        it('returns empty array when trailingOperator has unknown operator key', () => {
            const op: TrailingOperator = {
                key: 'unknown' as any,
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 8,
                rawToken: 'unknown:',
                hasColon: true,
            };
            expect(getDirectiveSuggestions(op)).toEqual([]);
        });
    });

    describe('Operator Discovery Mode (typing before colon)', () => {
        it('suggests in: and is: when user types "i"', () => {
            const op: TrailingOperator = {
                partialKey: 'i',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 1,
                rawToken: 'i',
                hasColon: false,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.length).toBe(2);
            expect(suggestions.map((s) => s.label)).toEqual(['in:', 'is:']);
            expect(suggestions.map((s) => s.insertText)).toEqual(['in:', 'is:']);
            expect(suggestions[0].category).toBe('operator');
        });

        it('suggests domain: when user types "d"', () => {
            const op: TrailingOperator = {
                partialKey: 'd',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 1,
                rawToken: 'd',
                hasColon: false,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.map((s) => s.label)).toEqual(['domain:']);
            expect(suggestions[0].insertText).toBe('domain:');
        });

        it('suggests before: when user types "b"', () => {
            const op: TrailingOperator = {
                partialKey: 'b',
                partialValue: '',
                negated: false,
                startIndex: 5,
                endIndex: 6,
                rawToken: 'b',
                hasColon: false,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.map((s) => s.label)).toEqual(['before:']);
            expect(suggestions[0].insertText).toBe('before:');
        });

        it('preserves negation prefix in operator discovery mode (e.g. "-i")', () => {
            const op: TrailingOperator = {
                partialKey: 'i',
                partialValue: '',
                negated: true,
                startIndex: 0,
                endIndex: 2,
                rawToken: '-i',
                hasColon: false,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.map((s) => s.label)).toEqual(['-in:', '-is:']);
            expect(suggestions.map((s) => s.insertText)).toEqual(['-in:', '-is:']);
        });

        it('clamps all operator matches to maximum budget of 6 items when partialKey is empty', () => {
            const op: TrailingOperator = {
                partialKey: '',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 0,
                rawToken: '',
                hasColon: false,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.length).toBe(6);
        });
    });

    describe('Value Completion Mode: is:', () => {
        it('returns capability tokens with descriptions for empty is:', () => {
            const op: TrailingOperator = {
                key: 'is',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 3,
                rawToken: 'is:',
                hasColon: true,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.length).toBe(6); // clamped to budget
            expect(suggestions[0]).toEqual({
                id: 'val-is-audible',
                label: 'is:audible',
                description: 'Tabs playing audio',
                insertText: 'is:audible ',
                category: 'value',
                key: 'is',
            });
        });

        it('filters capability tokens based on partialValue', () => {
            const op: TrailingOperator = {
                key: 'is',
                partialValue: 'aud',
                negated: false,
                startIndex: 0,
                endIndex: 6,
                rawToken: 'is:aud',
                hasColon: true,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('is:audible');
            expect(suggestions[0].insertText).toBe('is:audible ');
        });

        it('preserves negation prefix for is: capability suggestions', () => {
            const op: TrailingOperator = {
                key: 'is',
                partialValue: 'pin',
                negated: true,
                startIndex: 0,
                endIndex: 7,
                rawToken: '-is:pin',
                hasColon: true,
            };

            const suggestions = getDirectiveSuggestions(op);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('-is:pinned');
            expect(suggestions[0].insertText).toBe('-is:pinned ');
        });
    });

    describe('Value Completion Mode: in:', () => {
        it('returns static scopes when no context spaces are provided', () => {
            const op: TrailingOperator = {
                key: 'in',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 3,
                rawToken: 'in:',
                hasColon: true,
            };

            const suggestions = getDirectiveSuggestions(op);
            const labels = suggestions.map((s) => s.label);
            expect(labels).toContain('in:active');
            expect(labels).toContain('in:spaces');
            expect(labels).toContain('in:readlater');
            expect(labels).toContain('in:bookmarks');
        });

        it('includes dynamic space names and quotes names containing whitespace', () => {
            const op: TrailingOperator = {
                key: 'in',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 3,
                rawToken: 'in:',
                hasColon: true,
            };

            const context = {
                spaces: [
                    { name: 'Work' },
                    { name: 'Project Alpha' },
                ],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            const insertTexts = suggestions.map((s) => s.insertText);

            expect(insertTexts).toContain('in:Work ');
            expect(insertTexts).toContain('in:"Project Alpha" ');
        });

        it('filters both static scopes and dynamic spaces by partialValue', () => {
            const op: TrailingOperator = {
                key: 'in',
                partialValue: 'alpha',
                negated: false,
                startIndex: 0,
                endIndex: 8,
                rawToken: 'in:alpha',
                hasColon: true,
            };

            const context = {
                spaces: [{ name: 'Project Alpha' }, { name: 'Work' }],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('in:"Project Alpha"');
            expect(suggestions[0].insertText).toBe('in:"Project Alpha" ');
        });

        it('sanitizes double quotes in space names to protect lexer', () => {
            const op: TrailingOperator = {
                key: 'in',
                partialValue: 'cool',
                negated: false,
                startIndex: 0,
                endIndex: 7,
                rawToken: 'in:cool',
                hasColon: true,
            };

            const context = {
                spaces: [{ name: 'My "Cool" Space' }],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('in:"My Cool Space"');
            expect(suggestions[0].insertText).toBe('in:"My Cool Space" ');
        });

        it('preserves negation prefix for space names and scopes', () => {
            const op: TrailingOperator = {
                key: 'in',
                partialValue: 'proj',
                negated: true,
                startIndex: 0,
                endIndex: 8,
                rawToken: '-in:proj',
                hasColon: true,
            };

            const context = {
                spaces: [{ name: 'Project Alpha' }],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('-in:"Project Alpha"');
            expect(suggestions[0].insertText).toBe('-in:"Project Alpha" ');
        });
    });

    describe('Value Completion Mode: domain: and site:', () => {
        it('extracts unique hostnames from open tabs (max 5 hostnames)', () => {
            const op: TrailingOperator = {
                key: 'domain',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 7,
                rawToken: 'domain:',
                hasColon: true,
            };

            const context = {
                openTabs: [
                    { url: 'https://github.com/facebook/react' },
                    { url: 'https://github.com/vitejs/vite' },
                    { url: 'https://www.google.com/search?q=tabbellus' },
                    { url: 'https://developer.mozilla.org/en-US/' },
                    { url: 'https://news.ycombinator.com/' },
                    { url: 'https://reddit.com/r/typescript' },
                    { url: 'https://stackoverflow.com/questions' },
                ],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            // Capped at 5 domains and total budget 6
            expect(suggestions.length).toBe(5);
            expect(suggestions[0].label).toBe('domain:github.com');
            expect(suggestions[0].insertText).toBe('domain:github.com ');
            expect(suggestions[1].label).toBe('domain:google.com'); // www. stripped
        });

        it('supports site: synonym for domain:', () => {
            const op: TrailingOperator = {
                key: 'site',
                partialValue: 'git',
                negated: false,
                startIndex: 0,
                endIndex: 8,
                rawToken: 'site:git',
                hasColon: true,
            };

            const context = {
                openTabs: [
                    { url: 'https://github.com/facebook/react' },
                    { url: 'https://google.com' },
                ],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('site:github.com');
            expect(suggestions[0].insertText).toBe('site:github.com ');
        });

        it('preserves negation prefix for domain:', () => {
            const op: TrailingOperator = {
                key: 'domain',
                partialValue: 'you',
                negated: true,
                startIndex: 0,
                endIndex: 11,
                rawToken: '-domain:you',
                hasColon: true,
            };

            const context = {
                openTabs: [{ url: 'https://youtube.com/watch?v=123' }],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            expect(suggestions.length).toBe(1);
            expect(suggestions[0].label).toBe('-domain:youtube.com');
            expect(suggestions[0].insertText).toBe('-domain:youtube.com ');
        });
    });

    describe('Clamping budget', () => {
        it('clamps total suggestions to at most 6 items regardless of matches', () => {
            const op: TrailingOperator = {
                key: 'in',
                partialValue: '',
                negated: false,
                startIndex: 0,
                endIndex: 3,
                rawToken: 'in:',
                hasColon: true,
            };

            const context = {
                spaces: [
                    { name: 'Space 1' },
                    { name: 'Space 2' },
                    { name: 'Space 3' },
                    { name: 'Space 4' },
                    { name: 'Space 5' },
                    { name: 'Space 6' },
                ],
            };

            const suggestions = getDirectiveSuggestions(op, context);
            expect(suggestions.length).toBe(6);
        });
    });
});
