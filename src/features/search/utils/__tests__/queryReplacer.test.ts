import { describe, it, expect } from 'vitest';
import { applyDirectiveSuggestion } from '../queryReplacer';
import type { TrailingOperator, DirectiveSuggestion } from '../../types';

describe('queryReplacer (Directive Splicer & Caret Math)', () => {
    describe('end-of-query replacements', () => {
        it('replaces operator discovery key with complete operator token without trailing space', () => {
            const query = 'tab i';
            const op: TrailingOperator = {
                partialKey: 'i',
                partialValue: '',
                negated: false,
                startIndex: 4,
                endIndex: 5,
                rawToken: 'i',
                hasColon: false,
            };

            const suggestion: DirectiveSuggestion = {
                id: 'op-in',
                label: 'in:',
                insertText: 'in:',
                category: 'operator',
                key: 'in',
            };

            const { updatedQuery, nextCaretPosition } = applyDirectiveSuggestion(query, suggestion, op);

            expect(updatedQuery).toBe('tab in:');
            expect(nextCaretPosition).toBe(7);
        });

        it('replaces value completion token and appends a single trailing space', () => {
            const query = 'tab is:aud';
            const op: TrailingOperator = {
                key: 'is',
                partialValue: 'aud',
                negated: false,
                startIndex: 4,
                endIndex: 10,
                rawToken: 'is:aud',
                hasColon: true,
            };

            const suggestion: DirectiveSuggestion = {
                id: 'val-is-audible',
                label: 'is:audible',
                insertText: 'is:audible ',
                category: 'value',
                key: 'is',
            };

            const { updatedQuery, nextCaretPosition } = applyDirectiveSuggestion(query, suggestion, op);

            expect(updatedQuery).toBe('tab is:audible ');
            expect(nextCaretPosition).toBe(15);
        });

        it('replaces quoted space name at end of query', () => {
            const query = 'in:proj';
            const op: TrailingOperator = {
                key: 'in',
                partialValue: 'proj',
                negated: false,
                startIndex: 0,
                endIndex: 7,
                rawToken: 'in:proj',
                hasColon: true,
            };

            const suggestion: DirectiveSuggestion = {
                id: 'val-in-space-project alpha',
                label: 'in:"Project Alpha"',
                insertText: 'in:"Project Alpha" ',
                category: 'value',
                key: 'in',
            };

            const { updatedQuery, nextCaretPosition } = applyDirectiveSuggestion(query, suggestion, op);

            expect(updatedQuery).toBe('in:"Project Alpha" ');
            expect(nextCaretPosition).toBe(19);
        });

        it('replaces negated directive and preserves negation flag', () => {
            const query = '-is:aud';
            const op: TrailingOperator = {
                key: 'is',
                partialValue: 'aud',
                negated: true,
                startIndex: 0,
                endIndex: 7,
                rawToken: '-is:aud',
                hasColon: true,
            };

            const suggestion: DirectiveSuggestion = {
                id: 'val-is--audible',
                label: '-is:audible',
                insertText: '-is:audible ',
                category: 'value',
                key: 'is',
            };

            const { updatedQuery, nextCaretPosition } = applyDirectiveSuggestion(query, suggestion, op);

            expect(updatedQuery).toBe('-is:audible ');
            expect(nextCaretPosition).toBe(12);
        });
    });

    describe('mid-query replacements', () => {
        it('replaces token mid-query and avoids double spaces before subsequent words', () => {
            const query = 'react in:act vite';
            const op: TrailingOperator = {
                key: 'in',
                partialValue: 'act',
                negated: false,
                startIndex: 6,
                endIndex: 12,
                rawToken: 'in:act',
                hasColon: true,
            };

            const suggestion: DirectiveSuggestion = {
                id: 'val-in-scope-active',
                label: 'in:active',
                insertText: 'in:active ',
                category: 'value',
                key: 'in',
            };

            const { updatedQuery, nextCaretPosition } = applyDirectiveSuggestion(query, suggestion, op);

            expect(updatedQuery).toBe('react in:active vite');
            // 'react ' (6) + 'in:active ' (10) = 16
            expect(nextCaretPosition).toBe(16);
        });

        it('accepts raw string token for suggestion parameter', () => {
            const query = 'react is:mut vite';
            const op: TrailingOperator = {
                key: 'is',
                partialValue: 'mut',
                negated: false,
                startIndex: 6,
                endIndex: 12,
                rawToken: 'is:mut',
                hasColon: true,
            };

            const { updatedQuery, nextCaretPosition } = applyDirectiveSuggestion(query, 'is:muted', op);

            expect(updatedQuery).toBe('react is:muted vite');
            expect(nextCaretPosition).toBe(15);
        });
    });
});
