import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FilterChipTray } from '../FilterChipTray';
import type { SearchFilterDirective } from '../../types';

describe('FilterChipTray Component', () => {
    it('returns empty output when filters is empty', () => {
        const html = renderToString(
            <FilterChipTray filters={[]} onRemoveFilter={() => {}} />
        );
        expect(html).toBe('');
    });

    it('renders chips with tabIndex="-1" on remove buttons to prevent cmdk trapping', () => {
        const filters: SearchFilterDirective[] = [
            {
                key: 'in',
                value: 'active',
                negated: false,
                rawToken: 'in:active',
            },
            {
                key: 'domain',
                value: 'github.com',
                negated: false,
                rawToken: 'domain:github.com',
            },
        ];

        const html = renderToString(
            <FilterChipTray filters={filters} onRemoveFilter={() => {}} />
        );

        expect(html).toContain('in:');
        expect(html).toContain('active');
        expect(html).toContain('domain:');
        expect(html).toContain('github.com');
        expect(html).toContain('tabindex="-1"');
        expect(html).toContain('aria-label="Remove filter in:active"');
        expect(html).toContain('aria-label="Remove filter domain:github.com"');
        expect(html).toContain('border-border');
    });

    it('renders negated chips with subtle red styling and leading dash', () => {
        const filters: SearchFilterDirective[] = [
            {
                key: 'domain',
                value: 'youtube.com',
                negated: true,
                rawToken: '-domain:youtube.com',
            },
        ];

        const html = renderToString(
            <FilterChipTray filters={filters} onRemoveFilter={() => {}} />
        );

        expect(html).toContain('-domain:');
        expect(html).toContain('youtube.com');
        expect(html).toContain('border-destructive/30');
        expect(html).toContain('text-destructive');
    });
});
