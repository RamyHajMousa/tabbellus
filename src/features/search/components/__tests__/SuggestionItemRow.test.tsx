import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SuggestionItemRow } from '../SuggestionItemRow';
import { Command as CommandPrimitive } from 'cmdk';
import type { DirectiveSuggestion } from '../../types';

describe('SuggestionItemRow Component (SSR)', () => {
    it('renders operator suggestion with label, description, and Tab hint', () => {
        const suggestion: DirectiveSuggestion = {
            id: 'op-in',
            label: 'in:',
            description: 'Filter by scope or workspace name',
            insertText: 'in:',
            category: 'operator',
            key: 'in',
        };

        const html = renderToString(
            <CommandPrimitive>
                <SuggestionItemRow suggestion={suggestion} onSelect={() => {}} />
            </CommandPrimitive>
        );

        expect(html).toContain('in:');
        expect(html).toContain('Filter by scope or workspace name');
        expect(html).toContain('Tab');
    });

    it('renders value suggestion with label and description', () => {
        const suggestion: DirectiveSuggestion = {
            id: 'val-is-audible',
            label: 'is:audible',
            description: 'Tabs playing audio',
            insertText: 'is:audible ',
            category: 'value',
            key: 'is',
        };

        const html = renderToString(
            <CommandPrimitive>
                <SuggestionItemRow suggestion={suggestion} onSelect={() => {}} />
            </CommandPrimitive>
        );

        expect(html).toContain('is:audible');
        expect(html).toContain('Tabs playing audio');
    });
});
