/**
 * CommandItemRow Unit Tests
 *
 * Tests:
 * - Rendering PRO badge pill when command.isPro is true
 * - Omitting PRO badge pill when command.isPro is falsy
 * - Rendering command title and shortcut
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CommandItemRow } from '../CommandItemRow';
import { Command as CommandPrimitive } from 'cmdk';
import type { CommandAction } from '../../types';

const DummyIcon: React.FC<{ className?: string }> = () => null;

describe('CommandItemRow Component', () => {
    it('renders PRO badge pill when command.isPro is true', () => {
        const cmd: CommandAction = {
            id: 'apply-tab-rules',
            title: 'Apply Tab Rules to Window',
            category: 'Tab Management & Memory',
            keywords: ['rules'],
            icon: DummyIcon,
            isPro: true,
            run: () => {},
        };

        const html = renderToString(
            <CommandPrimitive>
                <CommandItemRow command={cmd} onSelect={() => {}} />
            </CommandPrimitive>
        );

        expect(html).toContain('PRO');
        expect(html).toContain('border-primary/20');
        expect(html).toContain('Apply Tab Rules to Window');
    });

    it('does not render PRO badge pill when command.isPro is false or undefined', () => {
        const cmd: CommandAction = {
            id: 'discard-idle-tabs',
            title: 'Discard Idle Tabs Now',
            category: 'Tab Management & Memory',
            keywords: ['ram'],
            shortcut: 'Alt+D',
            icon: DummyIcon,
            run: () => {},
        };

        const html = renderToString(
            <CommandPrimitive>
                <CommandItemRow command={cmd} onSelect={() => {}} />
            </CommandPrimitive>
        );

        expect(html).not.toContain('>PRO<');
        expect(html).toContain('Discard Idle Tabs Now');
        expect(html).toContain('Alt+D');
    });
});
