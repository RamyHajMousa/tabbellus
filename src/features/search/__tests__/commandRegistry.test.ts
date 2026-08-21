import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    COMMAND_REGISTRY,
    COMMAND_CATEGORIES,
    filterCommands,
} from '../registry/commandRegistry';
import { useAppStore } from '@/store/appStore';
import type { CommandContext } from '../types';

describe('Command Registry & Filter Engine', () => {
    beforeEach(() => {
        useAppStore.setState({
            settings: {
                theme: 'light',
                badgeMode: 'read-later',
                showDomain: true,
                readLaterOpenBehavior: 'foreground',
                readLaterAutoArchive: true,
                autoDiscardInterval: 0,
                spaceRestoreTrigger: 'single',
                duplicateTabBehavior: 'focus-existing',
            },
            theme: 'light',
            showDomain: true,
            badgeMode: 'read-later',
        });
    });

    it('should have all registered commands with valid unique metadata', () => {
        expect(COMMAND_REGISTRY.length).toBeGreaterThanOrEqual(13);

        const seenIds = new Set<string>();

        for (const cmd of COMMAND_REGISTRY) {
            expect(cmd.id).toBeTruthy();
            expect(seenIds.has(cmd.id)).toBe(false);
            seenIds.add(cmd.id);

            expect(cmd.title).toBeTruthy();
            expect(COMMAND_CATEGORIES).toContain(cmd.category);
            expect(Array.isArray(cmd.keywords)).toBe(true);
            expect(cmd.keywords.length).toBeGreaterThan(0);
            expect(cmd.icon).toBeDefined();
            expect(typeof cmd.run).toBe('function');
        }
    });

    it('should contain all required categories', () => {
        const categoriesInRegistry = new Set(COMMAND_REGISTRY.map((c) => c.category));
        for (const cat of COMMAND_CATEGORIES) {
            expect(categoriesInRegistry.has(cat)).toBe(true);
        }
    });

    describe('filterCommands', () => {
        it('should return all commands when query is empty or whitespace', () => {
            expect(filterCommands('')).toEqual(COMMAND_REGISTRY);
            expect(filterCommands('   ')).toEqual(COMMAND_REGISTRY);
        });

        it('should filter commands by title (case-insensitive)', () => {
            const results = filterCommands('discard');
            expect(results.some((c) => c.id === 'discard-idle-tabs')).toBe(true);
        });

        it('should filter commands by keyword synonym', () => {
            const memoryResults = filterCommands('ram');
            expect(memoryResults.some((c) => c.id === 'discard-idle-tabs')).toBe(true);

            const backupResults = filterCommands('backup');
            expect(backupResults.some((c) => c.id === 'export-all-spaces')).toBe(true);
        });

        it('should filter commands by category name', () => {
            const spacesResults = filterCommands('Spaces');
            expect(spacesResults.length).toBeGreaterThanOrEqual(3);
            expect(spacesResults.every((c) => c.category === 'Spaces' || c.keywords.includes('spaces'))).toBe(true);
        });

        it('should return empty array for non-matching queries', () => {
            const results = filterCommands('xyznonexistentquery999');
            expect(results).toEqual([]);
        });
    });

    describe('Command Execution', () => {
        it('should execute toggle-theme command and update state', async () => {
            const themeCmd = COMMAND_REGISTRY.find((c) => c.id === 'toggle-theme');
            expect(themeCmd).toBeDefined();

            const mockContext: CommandContext = {
                toast: vi.fn(),
                setSearchOpen: vi.fn(),
                setSettingsOpen: vi.fn(),
                setActiveView: vi.fn(),
                copy: vi.fn().mockResolvedValue(true),
            };

            await themeCmd!.run(mockContext);

            expect(useAppStore.getState().settings.theme).toBe('dark');
            expect(mockContext.toast).toHaveBeenCalledWith('Theme set to Dark');
        });

        it('should execute toggle-url-subtitles command and toggle showDomain', async () => {
            const subtitlesCmd = COMMAND_REGISTRY.find((c) => c.id === 'toggle-url-subtitles');
            expect(subtitlesCmd).toBeDefined();

            const mockContext: CommandContext = {
                toast: vi.fn(),
                setSearchOpen: vi.fn(),
                setSettingsOpen: vi.fn(),
                setActiveView: vi.fn(),
                copy: vi.fn().mockResolvedValue(true),
            };

            await subtitlesCmd!.run(mockContext);

            expect(useAppStore.getState().settings.showDomain).toBe(false);
            expect(mockContext.toast).toHaveBeenCalledWith('URL subtitles hidden');
        });

        it('should execute open-settings command', async () => {
            const settingsCmd = COMMAND_REGISTRY.find((c) => c.id === 'open-settings');
            expect(settingsCmd).toBeDefined();

            const mockContext: CommandContext = {
                toast: vi.fn(),
                setSearchOpen: vi.fn(),
                setSettingsOpen: vi.fn(),
                setActiveView: vi.fn(),
                copy: vi.fn().mockResolvedValue(true),
            };

            await settingsCmd!.run(mockContext);

            expect(mockContext.setSettingsOpen).toHaveBeenCalledWith(true);
        });
    });
});
