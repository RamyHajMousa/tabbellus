import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    COMMAND_REGISTRY,
    COMMAND_CATEGORIES,
    filterCommands,
} from '../registry/commandRegistry';
import { useAppStore } from '@/store/appStore';
import { spaceService, readLaterService, dataService } from '@/lib';
import * as discardService from '@/background/discardService';
import * as groupingUtils from '@/features/tabs/utils/groupingUtils';
import type { CommandContext } from '../types';

describe('Command Registry & Filter Engine', () => {
    let mockContext: CommandContext;

    beforeEach(() => {
        vi.restoreAllMocks();

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
            activeView: 'spaces',
            activeSpaces: { 1: 101 },
        });

        // Setup global chrome mocks
        (globalThis as any).chrome = {
            tabs: {
                query: vi.fn().mockResolvedValue([]),
                create: vi.fn().mockResolvedValue({ id: 1 }),
                remove: vi.fn().mockResolvedValue(undefined),
                update: vi.fn().mockResolvedValue({ id: 1 }),
                reload: vi.fn().mockResolvedValue(undefined),
                move: vi.fn().mockResolvedValue([]),
                ungroup: vi.fn().mockResolvedValue(undefined),
            },
            windows: {
                getCurrent: vi.fn().mockResolvedValue({ id: 101 }),
                create: vi.fn().mockResolvedValue({ id: 102 }),
                update: vi.fn().mockResolvedValue({ id: 101 }),
            },
        };

        mockContext = {
            toast: vi.fn(),
            setSearchOpen: vi.fn(),
            setSettingsOpen: vi.fn(),
            setHistoryOpen: vi.fn(),
            setActiveView: vi.fn(),
            copy: vi.fn().mockResolvedValue(true),
        };
    });

    it('should have all 28 registered commands with valid unique metadata', () => {
        expect(COMMAND_REGISTRY.length).toBe(28);

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

    it('should register apply-tab-rules with isPro: true under Tab Management & Memory', () => {
        const cmd = COMMAND_REGISTRY.find((c) => c.id === 'apply-tab-rules')!;
        expect(cmd).toBeDefined();
        expect(cmd.title).toBe('Apply Tab Rules to Window');
        expect(cmd.category).toBe('Tab Management & Memory');
        expect(cmd.isPro).toBe(true);
        expect(cmd.keywords).toEqual(
            expect.arrayContaining(['rules', 'auto group', 'organize', 'tab rules', 'match', 'automate'])
        );
    });

    it('should partition commands precisely across the 5 categories', () => {
        const counts: Record<string, number> = {};
        for (const cmd of COMMAND_REGISTRY) {
            counts[cmd.category] = (counts[cmd.category] || 0) + 1;
        }

        expect(counts['Spaces & Workspaces']).toBe(5);
        expect(counts['Tab Management & Memory']).toBe(10);
        expect(counts['Audio & Tab Control']).toBe(4);
        expect(counts['Read Later & Ingestion']).toBe(4);
        expect(counts['Navigation & System']).toBe(5);
    });

    describe('filterCommands', () => {
        it('should return all 28 commands when query is empty or whitespace', () => {
            expect(filterCommands('')).toHaveLength(28);
            expect(filterCommands('   ')).toHaveLength(28);
        });

        it('should filter commands by title (case-insensitive)', () => {
            const results = filterCommands('discard');
            expect(results.some((c) => c.id === 'discard-idle-tabs')).toBe(true);
        });

        it('should filter commands by keyword synonym', () => {
            const memoryResults = filterCommands('ram');
            expect(memoryResults.some((c) => c.id === 'discard-idle-tabs')).toBe(true);

            const audioResults = filterCommands('silence');
            expect(audioResults.some((c) => c.id === 'mute-audible-tabs')).toBe(true);

            const backupResults = filterCommands('backup');
            expect(backupResults.some((c) => c.id === 'export-all-spaces')).toBe(true);
        });

        it('should filter commands by category name', () => {
            const audioCategoryResults = filterCommands('Audio');
            expect(audioCategoryResults.length).toBeGreaterThanOrEqual(4);
            expect(audioCategoryResults.some((c) => c.id === 'mute-audible-tabs')).toBe(true);
        });

        it('should return empty array for non-matching queries', () => {
            const results = filterCommands('xyznonexistentquery999');
            expect(results).toEqual([]);
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 1: SPACES & WORKSPACES (5 Automated Execution Tests)
    // ══════════════════════════════════════════════════════════════════════
    describe('Spaces & Workspaces Execution', () => {
        it('should execute "create-empty-space"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'create-empty-space')!;
            const spy = vi.spyOn(spaceService, 'createEmptySpace').mockResolvedValue(1);

            await cmd.run(mockContext);

            expect(spy).toHaveBeenCalled();
            expect(mockContext.setActiveView).toHaveBeenCalledWith('spaces');
            expect(mockContext.toast).toHaveBeenCalledWith(expect.stringContaining('Created empty space'));
        });

        it('should execute "capture-current-window"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'capture-current-window')!;
            const spy = vi.spyOn(spaceService, 'captureCurrentWindow').mockResolvedValue(undefined as any);

            await cmd.run(mockContext);

            expect(spy).toHaveBeenCalled();
            expect(mockContext.setActiveView).toHaveBeenCalledWith('spaces');
            expect(mockContext.toast).toHaveBeenCalledWith(expect.stringContaining('Captured window as'));
        });

        it('should execute "unlink-current-space"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'unlink-current-space')!;

            await cmd.run(mockContext);

            expect(useAppStore.getState().activeSpaces[1]).toBeUndefined();
            expect(mockContext.toast).toHaveBeenCalledWith('Unlinked space from current window');
        });

        it('should execute "export-all-spaces"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'export-all-spaces')!;
            const spy = vi.spyOn(dataService, 'exportData').mockResolvedValue(undefined as any);

            await cmd.run(mockContext);

            expect(spy).toHaveBeenCalled();
            expect(mockContext.toast).toHaveBeenCalledWith('Exported workspace data as JSON');
        });

        it('should execute "switch-view-spaces"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'switch-view-spaces')!;

            await cmd.run(mockContext);

            expect(mockContext.setActiveView).toHaveBeenCalledWith('spaces');
            expect(mockContext.toast).toHaveBeenCalledWith('Switched to Spaces view');
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 2: TAB MANAGEMENT & MEMORY (9 Automated Execution Tests)
    // ══════════════════════════════════════════════════════════════════════
    describe('Tab Management & Memory Execution', () => {
        it('should execute "apply-tab-rules" when Free Tier by dismissing palette and prompting upgrade', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'apply-tab-rules')!;
            const { contractRegistry } = await import('@/core/contracts/registry');
            vi.spyOn(contractRegistry, 'getEntitlementSnapshot').mockReturnValue({
                isPro: false,
                tier: 'free',
                loading: false,
            });

            await cmd.run(mockContext);

            expect(mockContext.setSearchOpen).toHaveBeenCalledWith(false);
            expect(mockContext.toast).toHaveBeenCalledWith(
                'TabBellus Pro Feature',
                expect.objectContaining({
                    description: 'Tab Rules and automation require an active Pro license.',
                    action: expect.objectContaining({ label: 'Upgrade' }),
                })
            );
        });

        it('should execute "apply-tab-rules" when Pro Tier by dispatching runtime message and reporting stats', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'apply-tab-rules')!;
            const { contractRegistry } = await import('@/core/contracts/registry');
            vi.spyOn(contractRegistry, 'getEntitlementSnapshot').mockReturnValue({
                isPro: true,
                tier: 'pro',
                loading: false,
            });

            (globalThis as any).chrome = {
                ...(globalThis as any).chrome,
                runtime: {
                    sendMessage: vi.fn().mockResolvedValue({ processed: 8, matched: 3 }),
                },
            };

            await cmd.run(mockContext);

            expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
                type: 'APPLY_RULES_TO_WINDOW',
            });
            expect(mockContext.toast).toHaveBeenCalledWith(
                'Tab Rules Applied',
                expect.objectContaining({
                    description: 'Organized 3 of 8 tabs in this window.',
                })
            );
        });

        it('should execute "discard-idle-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'discard-idle-tabs')!;
            vi.spyOn(discardService, 'runDiscardSweep').mockResolvedValue(3);

            await cmd.run(mockContext);

            expect(mockContext.toast).toHaveBeenCalledWith(
                expect.stringContaining('Discarded 3 idle tabs'),
                expect.objectContaining({ description: expect.stringContaining('Reclaimed memory') })
            );
        });

        it('should execute "close-duplicate-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'close-duplicate-tabs')!;
            const mockTabs = [
                { id: 1, url: 'https://a.com', pinned: true, active: false, index: 0 },
                { id: 2, url: 'https://a.com', pinned: false, active: false, index: 1 },
            ];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.remove).toHaveBeenCalledWith([2]);
            expect(mockContext.toast).toHaveBeenCalledWith('Closed 1 duplicate tab');
        });

        it('should execute "group-by-domain"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'group-by-domain')!;
            vi.spyOn(groupingUtils, 'autoGroupByDomain').mockResolvedValue({ groupsCreated: 2 });

            await cmd.run(mockContext);

            expect(mockContext.toast).toHaveBeenCalledWith(
                'Tabs Grouped',
                expect.objectContaining({ description: 'Created 2 domain groups.' })
            );
        });

        it('should execute "ungroup-all-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'ungroup-all-tabs')!;
            const mockTabs = [
                { id: 1, groupId: 5 },
                { id: 2, groupId: 5 },
                { id: 3, groupId: -1 },
            ];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.ungroup).toHaveBeenCalledWith([1, 2]);
            expect(mockContext.toast).toHaveBeenCalledWith('Ungrouped 2 tabs');
        });

        it('should execute "sort-tabs-domain"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'sort-tabs-domain')!;
            const mockTabs = [
                { id: 1, pinned: true, url: 'https://z.com', title: 'Z' },
                { id: 2, pinned: false, url: 'https://b.com', title: 'B' },
                { id: 3, pinned: false, url: 'https://a.com', title: 'A' },
            ];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.move).toHaveBeenCalledWith([3, 2], { index: 1 });
            expect(mockContext.toast).toHaveBeenCalledWith('Tabs sorted by domain');
        });

        it('should execute "sort-tabs-alpha"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'sort-tabs-alpha')!;
            const mockTabs = [
                { id: 1, pinned: false, url: 'https://b.com', title: 'Beta' },
                { id: 2, pinned: false, url: 'https://a.com', title: 'Alpha' },
            ];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.move).toHaveBeenCalledWith([2, 1], { index: 0 });
            expect(mockContext.toast).toHaveBeenCalledWith('Tabs sorted alphabetically');
        });

        it('should execute "new-tab"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'new-tab')!;

            await cmd.run(mockContext);

            expect(chrome.tabs.create).toHaveBeenCalledWith({ active: true });
            expect(mockContext.toast).toHaveBeenCalledWith('Opened new tab');
        });

        it('should execute "new-window"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'new-window')!;

            await cmd.run(mockContext);

            expect(chrome.windows.create).toHaveBeenCalledWith({ focused: true });
            expect(mockContext.toast).toHaveBeenCalledWith('Opened new window');
        });

        it('should execute "switch-view-active"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'switch-view-active')!;

            await cmd.run(mockContext);

            expect(mockContext.setActiveView).toHaveBeenCalledWith('active');
            expect(mockContext.toast).toHaveBeenCalledWith('Switched to Active Session view');
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 3: AUDIO & TAB CONTROL (4 Automated Execution Tests)
    // ══════════════════════════════════════════════════════════════════════
    describe('Audio & Tab Control Execution', () => {
        it('should execute "mute-audible-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'mute-audible-tabs')!;
            const mockTabs = [{ id: 10, audible: true }, { id: 11, audible: true }];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.update).toHaveBeenCalledWith(10, { muted: true });
            expect(chrome.tabs.update).toHaveBeenCalledWith(11, { muted: true });
            expect(mockContext.toast).toHaveBeenCalledWith('Muted 2 audible tabs');
        });

        it('should execute "unmute-all-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'unmute-all-tabs')!;
            const mockTabs = [{ id: 20, muted: true }];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.update).toHaveBeenCalledWith(20, { muted: false });
            expect(mockContext.toast).toHaveBeenCalledWith('Unmuted 1 tab');
        });

        it('should execute "reload-all-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'reload-all-tabs')!;
            const mockTabs = [{ id: 30 }, { id: 31 }];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.reload).toHaveBeenCalledWith(30);
            expect(chrome.tabs.reload).toHaveBeenCalledWith(31);
            expect(mockContext.toast).toHaveBeenCalledWith('Reloading 2 tabs');
        });

        it('should execute "close-unpinned-tabs"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'close-unpinned-tabs')!;
            const mockTabs = [{ id: 40 }, { id: 41 }];
            vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);

            await cmd.run(mockContext);

            expect(chrome.tabs.remove).toHaveBeenCalledWith([40, 41]);
            expect(mockContext.toast).toHaveBeenCalledWith('Closed 2 unpinned tabs');
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 4: READ LATER & INGESTION (4 Automated Execution Tests)
    // ══════════════════════════════════════════════════════════════════════
    describe('Read Later & Ingestion Execution', () => {
        it('should execute "save-active-tab-read-later"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'save-active-tab-read-later')!;
            const mockActiveTab = { id: 50, url: 'https://article.com', title: 'Great Article', favIconUrl: 'https://article.com/favicon.ico' };
            vi.mocked(chrome.tabs.query).mockResolvedValue([mockActiveTab] as any);
            const spy = vi.spyOn(readLaterService, 'addFromTab').mockResolvedValue(1);

            await cmd.run(mockContext);

            expect(spy).toHaveBeenCalledWith({
                url: 'https://article.com',
                title: 'Great Article',
                favIconUrl: 'https://article.com/favicon.ico',
            });
            expect(mockContext.toast).toHaveBeenCalledWith('Saved to Read Later', expect.objectContaining({ description: 'Great Article' }));
        });

        it('should execute "archive-all-unread"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'archive-all-unread')!;
            vi.spyOn(readLaterService, 'archiveAllUnread').mockResolvedValue(5);

            await cmd.run(mockContext);

            expect(mockContext.toast).toHaveBeenCalledWith('Archived 5 unread items');
        });

        it('should execute "clear-all-archived"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'clear-all-archived')!;
            const mockDeleted = [{ id: 1, url: 'https://a.com', title: 'A', status: 'archived' as const, addedAt: Date.now() }];
            vi.spyOn(readLaterService, 'clearAllArchived').mockResolvedValue(mockDeleted);

            await cmd.run(mockContext);

            expect(mockContext.toast).toHaveBeenCalledWith(
                'Deleted 1 archived item',
                expect.objectContaining({ onUndo: expect.any(Function) })
            );
        });

        it('should execute "copy-all-read-later-urls"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'copy-all-read-later-urls')!;
            const mockItems = [
                { id: 1, url: 'https://a.com', title: 'A', status: 'unread' as const, addedAt: Date.now() },
                { id: 2, url: 'https://b.com', title: 'B', status: 'unread' as const, addedAt: Date.now() },
            ];
            vi.spyOn(readLaterService, 'getAllItems').mockResolvedValue(mockItems);

            await cmd.run(mockContext);

            expect(mockContext.copy).toHaveBeenCalledWith('https://a.com\nhttps://b.com');
            expect(mockContext.toast).toHaveBeenCalledWith('Copied 2 URLs to clipboard');
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // CATEGORY 5: NAVIGATION & SYSTEM (5 Automated Execution Tests)
    // ══════════════════════════════════════════════════════════════════════
    describe('Navigation & System Execution', () => {
        it('should execute "switch-view-read-later"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'switch-view-read-later')!;

            await cmd.run(mockContext);

            expect(mockContext.setActiveView).toHaveBeenCalledWith('read-later');
            expect(mockContext.toast).toHaveBeenCalledWith('Switched to Read Later view');
        });

        it('should execute "toggle-theme"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'toggle-theme')!;

            await cmd.run(mockContext);

            expect(useAppStore.getState().settings.theme).toBe('dark');
            expect(mockContext.toast).toHaveBeenCalledWith('Theme set to Dark');
        });

        it('should execute "toggle-url-subtitles"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'toggle-url-subtitles')!;

            await cmd.run(mockContext);

            expect(useAppStore.getState().settings.showDomain).toBe(false);
            expect(mockContext.toast).toHaveBeenCalledWith('URL subtitles hidden');
        });

        it('should execute "open-settings"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'open-settings')!;

            await cmd.run(mockContext);

            expect(mockContext.setSettingsOpen).toHaveBeenCalledWith(true);
        });

        it('should execute "open-shortcuts-settings"', async () => {
            const cmd = COMMAND_REGISTRY.find((c) => c.id === 'open-shortcuts-settings')!;

            await cmd.run(mockContext);

            expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts', active: true });
            expect(mockContext.toast).toHaveBeenCalledWith('Opening keyboard shortcuts settings');
        });
    });
});
