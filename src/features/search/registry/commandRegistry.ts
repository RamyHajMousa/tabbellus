import {
    FolderPlus,
    LayoutTemplate,
    Download,
    Zap,
    Copy,
    Trash2,
    Archive,
    Link,
    SunMoon,
    Sliders,
    Settings,
    HelpCircle,
} from 'lucide-react';
import { spaceService, readLaterService, dataService, tabService, formatSavedRam, openSupportHub } from '@/lib';
import { runDiscardSweep } from '@/background/discardService';
import { useAppStore } from '@/store/appStore';
import type { CommandAction, CommandCategory } from '../types';

export const COMMAND_CATEGORIES: CommandCategory[] = [
    'Spaces',
    'Tabs',
    'Read Later',
    'System',
    'Preferences',
];

export const COMMAND_REGISTRY: CommandAction[] = [
    // Spaces
    {
        id: 'create-empty-space',
        title: 'Create Empty Space',
        category: 'Spaces',
        keywords: ['new space', 'add space', 'create space', 'workspace', 'blank space'],
        icon: FolderPlus,
        run: async (context) => {
            const defaultName = `Workspace ${new Date().toLocaleDateString()}`;
            await spaceService.createEmptySpace(defaultName);
            context.setActiveView('spaces');
            context.toast(`Created empty space "${defaultName}"`);
        },
    },
    {
        id: 'capture-current-window',
        title: 'Capture Current Window as Space',
        category: 'Spaces',
        keywords: ['save window', 'capture space', 'save session', 'new space from tabs'],
        icon: LayoutTemplate,
        run: async (context) => {
            const defaultName = `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            await spaceService.captureCurrentWindow(defaultName);
            context.setActiveView('spaces');
            context.toast(`Captured window as "${defaultName}"`);
        },
    },
    {
        id: 'export-all-spaces',
        title: 'Export All Spaces to JSON',
        category: 'Spaces',
        keywords: ['backup', 'export backup', 'download json', 'save backup', 'export data'],
        icon: Download,
        run: async (context) => {
            await dataService.exportData();
            context.toast('Exported workspace data as JSON');
        },
    },

    // Tabs & Memory
    {
        id: 'discard-idle-tabs',
        title: 'Discard Idle Tabs Now',
        category: 'Tabs',
        keywords: ['hibernate', 'suspend', 'save memory', 'ram', 'free memory', 'clean tabs', 'sleep'],
        icon: Zap,
        run: async (context) => {
            const discarded = await runDiscardSweep(1);
            if (discarded > 0) {
                context.toast(`Discarded ${discarded} idle tab${discarded > 1 ? 's' : ''}`, {
                    description: `Reclaimed memory (${formatSavedRam(discarded)})`,
                });
            } else {
                context.toast('No idle tabs eligible for memory reclamation');
            }
        },
    },
    {
        id: 'close-duplicate-tabs',
        title: 'Close Duplicate Tabs',
        category: 'Tabs',
        keywords: ['deduplicate', 'remove duplicates', 'clean duplicates', 'tabs', 'close duplicate'],
        icon: Copy,
        run: async (context) => {
            const allTabs = typeof chrome !== 'undefined' && chrome.tabs?.query ? await chrome.tabs.query({}) : [];
            const { duplicates } = tabService.calculateDuplicates(allTabs);
            if (duplicates.length === 0) {
                context.toast('No duplicate tabs found');
                return;
            }
            const duplicateIds = duplicates.map((t) => t.id!).filter((id): id is number => id !== undefined);
            if (typeof chrome !== 'undefined' && chrome.tabs?.remove) {
                await chrome.tabs.remove(duplicateIds);
            }
            context.toast(`Closed ${duplicates.length} duplicate tab${duplicates.length > 1 ? 's' : ''}`);
        },
    },
    {
        id: 'close-unpinned-tabs',
        title: 'Close Unpinned Tabs',
        category: 'Tabs',
        keywords: ['close unpinned', 'clean window', 'close tabs', 'close all unpinned'],
        icon: Trash2,
        run: async (context) => {
            const tabs = typeof chrome !== 'undefined' && chrome.tabs?.query
                ? await chrome.tabs.query({ currentWindow: true, pinned: false })
                : [];
            const unpinnedIds = tabs.map((t) => t.id!).filter((id): id is number => id !== undefined);
            if (unpinnedIds.length === 0) {
                context.toast('No unpinned tabs to close in current window');
                return;
            }
            if (typeof chrome !== 'undefined' && chrome.tabs?.remove) {
                await chrome.tabs.remove(unpinnedIds);
            }
            context.toast(`Closed ${unpinnedIds.length} unpinned tab${unpinnedIds.length > 1 ? 's' : ''}`);
        },
    },

    // Read Later
    {
        id: 'archive-all-unread',
        title: 'Archive All Unread Items',
        category: 'Read Later',
        keywords: ['mark all read', 'archive read later', 'clear inbox', 'read all'],
        icon: Archive,
        run: async (context) => {
            const count = await readLaterService.archiveAllUnread();
            if (count > 0) {
                context.toast(`Archived ${count} unread item${count > 1 ? 's' : ''}`);
            } else {
                context.toast('No unread items to archive');
            }
        },
    },
    {
        id: 'clear-all-archived',
        title: 'Clear All Archived Items',
        category: 'Read Later',
        keywords: ['delete archived', 'empty archive', 'purge read later', 'clear archived'],
        icon: Trash2,
        run: async (context) => {
            const deleted = await readLaterService.clearAllArchived();
            if (deleted.length > 0) {
                context.toast(`Deleted ${deleted.length} archived item${deleted.length > 1 ? 's' : ''}`, {
                    onUndo: async () => {
                        await readLaterService.restoreItems(deleted);
                        context.toast(`Restored ${deleted.length} item${deleted.length > 1 ? 's' : ''}`);
                    },
                });
            } else {
                context.toast('No archived items to clear');
            }
        },
    },
    {
        id: 'copy-all-read-later-urls',
        title: 'Copy All Read Later URLs',
        category: 'Read Later',
        keywords: ['copy urls', 'export links', 'clipboard read later', 'share reading list'],
        icon: Link,
        run: async (context) => {
            const items = await readLaterService.getAllItems();
            if (items.length === 0) {
                context.toast('Read Later queue is empty');
                return;
            }
            const urlList = items.map((i) => i.url).join('\n');
            await context.copy(urlList);
            context.toast(`Copied ${items.length} URL${items.length > 1 ? 's' : ''} to clipboard`);
        },
    },

    // System & Preferences
    {
        id: 'toggle-theme',
        title: 'Toggle Light/Dark Theme',
        category: 'System',
        keywords: ['dark mode', 'light mode', 'switch theme', 'appearance', 'color scheme'],
        icon: SunMoon,
        run: (context) => {
            const currentTheme = useAppStore.getState().settings.theme;
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            useAppStore.getState().setTheme(nextTheme);
            context.toast(`Theme set to ${nextTheme === 'dark' ? 'Dark' : 'Light'}`);
        },
    },
    {
        id: 'toggle-url-subtitles',
        title: 'Toggle URL Subtitles',
        category: 'Preferences',
        keywords: ['show domain', 'hide url', 'tab url subtitles', 'density', 'toggle subtitles'],
        icon: Sliders,
        run: (context) => {
            const currentShowDomain = useAppStore.getState().settings.showDomain;
            const nextShowDomain = !currentShowDomain;
            useAppStore.getState().setShowDomain(nextShowDomain);
            context.toast(`URL subtitles ${nextShowDomain ? 'enabled' : 'hidden'}`);
        },
    },
    {
        id: 'open-settings',
        title: 'Open Settings',
        category: 'Preferences',
        keywords: ['preferences', 'options', 'config', 'configuration', 'settings'],
        icon: Settings,
        run: (context) => {
            context.setSettingsOpen(true);
        },
    },
    {
        id: 'open-support-hub',
        title: 'Open Support Hub',
        category: 'System',
        keywords: ['help', 'documentation', 'feedback', 'bug report', 'support', 'docs'],
        icon: HelpCircle,
        run: (context) => {
            openSupportHub();
            context.toast('Opening Support Hub');
        },
    },
];

/**
 * Filter registered commands using case-insensitive multi-token keyword/title/category matching.
 */
export function filterCommands(query: string, registry: CommandAction[] = COMMAND_REGISTRY): CommandAction[] {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
        return registry;
    }

    const tokens = trimmed.split(/\s+/).filter(Boolean);

    return registry.filter((command) => {
        const titleLower = command.title.toLowerCase();
        const categoryLower = command.category.toLowerCase();
        const keywordsJoined = command.keywords.join(' ').toLowerCase();
        const fullSearchableText = `${titleLower} ${categoryLower} ${keywordsJoined}`;

        return tokens.every((token) => fullSearchableText.includes(token));
    });
}
