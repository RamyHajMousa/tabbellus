import {
    FolderPlus,
    LayoutTemplate,
    Unlink,
    Download,
    Package,
    Zap,
    Copy,
    Layers,
    FolderOpen,
    Globe,
    ArrowDownAZ,
    Plus,
    AppWindow,
    LayoutList,
    VolumeX,
    Volume2,
    RotateCw,
    Trash2,
    BookmarkPlus,
    Archive,
    Link,
    BookOpen,
    SunMoon,
    Sliders,
    Settings,
    Keyboard,
    Sparkles,
} from 'lucide-react';
import {
    spaceService,
    readLaterService,
    dataService,
    tabService,
    formatSavedRam,
    openShortcutsSettings,
    getReadLaterShortcutText,
} from '@/lib';
import { autoGroupByDomain } from '@/features/tabs/utils/groupingUtils';
import { runDiscardSweep } from '@/background/discardService';
import { useAppStore } from '@/store/appStore';
import { contractRegistry } from '@/core/contracts/registry';
import type { CommandAction, CommandCategory } from '../types';

export const COMMAND_CATEGORIES: CommandCategory[] = [
    'Spaces & Workspaces',
    'Tab Management & Memory',
    'Audio & Tab Control',
    'Read Later & Ingestion',
    'Navigation & System',
];

export const COMMAND_REGISTRY: CommandAction[] = [
    // ══════════════════════════════════════════════════════════════════
    // 1. SPACES & WORKSPACES (5 Commands)
    // ══════════════════════════════════════════════════════════════════
    {
        id: 'create-empty-space',
        title: 'Create Empty Space',
        category: 'Spaces & Workspaces',
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
        category: 'Spaces & Workspaces',
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
        id: 'unlink-current-space',
        title: 'Unlink Space from Current Window',
        category: 'Spaces & Workspaces',
        keywords: ['unlink window', 'release space', 'unbind space', 'detach space'],
        icon: Unlink,
        run: async (context) => {
            if (typeof chrome !== 'undefined' && chrome.windows?.getCurrent) {
                const win = await chrome.windows.getCurrent();
                if (win && win.id) {
                    useAppStore.getState().unregisterWindow(win.id);
                    context.toast('Unlinked space from current window');
                    return;
                }
            }
            context.toast('No linked space to unlink in this window');
        },
    },
    {
        id: 'export-all-spaces',
        title: 'Export All Spaces to JSON',
        category: 'Spaces & Workspaces',
        keywords: ['backup', 'export backup', 'download json', 'save backup', 'export data'],
        icon: Download,
        run: async (context) => {
            await dataService.exportData();
            context.toast('Exported workspace data as JSON');
        },
    },
    {
        id: 'switch-view-spaces',
        title: 'Switch View: Saved Spaces',
        category: 'Spaces & Workspaces',
        keywords: ['go to spaces', 'view spaces', 'open spaces view', 'saved spaces'],
        icon: Package,
        run: (context) => {
            context.setActiveView('spaces');
            context.toast('Switched to Spaces view');
        },
    },

    // ══════════════════════════════════════════════════════════════════
    // 2. TAB MANAGEMENT & MEMORY (10 Commands)
    // ══════════════════════════════════════════════════════════════════
    {
        id: 'apply-tab-rules',
        title: 'Apply Tab Rules to Window',
        description: 'Evaluate active tab rules and auto-group or route window tabs',
        category: 'Tab Management & Memory',
        keywords: ['rules', 'auto group', 'organize', 'tab rules', 'match', 'automate'],
        icon: Sparkles,
        isPro: true,
        run: async (context) => {
            const entitlement = contractRegistry.getEntitlementSnapshot();
            if (!entitlement.isPro) {
                context.setSearchOpen(false);
                context.toast('TabBellus Pro Feature', {
                    description: 'Tab Rules and automation require an active Pro license.',
                    action: {
                        label: 'Upgrade',
                        onClick: () => {
                            context.setSettingsOpen(true);
                        },
                    },
                });
                return;
            }

            try {
                if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
                    context.toast('Tab Rules Error', { description: 'Chrome runtime is unavailable.' });
                    return;
                }
                const response = await chrome.runtime.sendMessage({ type: 'APPLY_RULES_TO_WINDOW' });
                const processed = typeof response?.processed === 'number' ? response.processed : 0;
                const matched = typeof response?.matched === 'number' ? response.matched : 0;
                context.toast('Tab Rules Applied', {
                    description: `Organized ${matched} of ${processed} tabs in this window.`,
                });
            } catch (error) {
                console.error('[commandRegistry] Failed to apply tab rules:', error);
                context.toast('Failed to apply tab rules', {
                    description: error instanceof Error ? error.message : 'An unexpected error occurred.',
                });
            }
        },
    },
    {
        id: 'discard-idle-tabs',
        title: 'Discard Idle Tabs Now',
        category: 'Tab Management & Memory',
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
        category: 'Tab Management & Memory',
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
        id: 'group-by-domain',
        title: 'Group Tabs by Domain',
        category: 'Tab Management & Memory',
        keywords: ['auto group', 'domain group', 'cluster tabs', 'organize tabs'],
        icon: Layers,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
                context.toast('Chrome tabs API unavailable');
                return;
            }
            const currentTabs = await chrome.tabs.query({ currentWindow: true });
            const { groupsCreated } = await autoGroupByDomain(currentTabs);
            if (groupsCreated > 0) {
                context.toast('Tabs Grouped', {
                    description: `Created ${groupsCreated} domain group${groupsCreated > 1 ? 's' : ''}.`,
                });
            } else {
                context.toast('No groupable domains found', { duration: 3000 });
            }
        },
    },
    {
        id: 'ungroup-all-tabs',
        title: 'Ungroup All Tabs in Window',
        category: 'Tab Management & Memory',
        keywords: ['ungroup', 'flatten groups', 'remove tab groups', 'dissolve groups'],
        icon: FolderOpen,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.ungroup) {
                context.toast('Tab groups API unavailable');
                return;
            }
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const groupedTabIds = tabs
                .filter((t) => t.groupId !== undefined && t.groupId > 0 && t.id !== undefined)
                .map((t) => t.id!);

            if (groupedTabIds.length > 0) {
                await chrome.tabs.ungroup(groupedTabIds);
                context.toast(`Ungrouped ${groupedTabIds.length} tab${groupedTabIds.length > 1 ? 's' : ''}`);
            } else {
                context.toast('No tab groups to ungroup in current window');
            }
        },
    },
    {
        id: 'sort-tabs-domain',
        title: 'Sort Window Tabs by Domain',
        category: 'Tab Management & Memory',
        keywords: ['sort domain', 'order by host', 'organize domain', 'domain sort'],
        icon: Globe,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.move) {
                context.toast('Tabs API unavailable');
                return;
            }
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const unpinned = tabs.filter((t) => !t.pinned && t.id !== undefined);
            if (unpinned.length === 0) {
                context.toast('No unpinned tabs to sort');
                return;
            }

            const getHost = (url?: string) => {
                if (!url) return '';
                try {
                    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
                } catch {
                    return '';
                }
            };

            unpinned.sort((a, b) => {
                const domainA = getHost(a.url);
                const domainB = getHost(b.url);
                if (domainA !== domainB) {
                    return domainA.localeCompare(domainB);
                }
                return (a.title || a.url || '').localeCompare(b.title || b.url || '');
            });

            const pinnedCount = tabs.filter((t) => t.pinned).length;
            const tabIds = unpinned.map((t) => t.id!);
            await chrome.tabs.move(tabIds, { index: pinnedCount });
            context.toast('Tabs sorted by domain');
        },
    },
    {
        id: 'sort-tabs-alpha',
        title: 'Sort Window Tabs Alphabetically (A-Z)',
        category: 'Tab Management & Memory',
        keywords: ['sort title', 'sort alphabetically', 'alphabetical order', 'order tabs a-z'],
        icon: ArrowDownAZ,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.move) {
                context.toast('Tabs API unavailable');
                return;
            }
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const unpinned = tabs.filter((t) => !t.pinned && t.id !== undefined);
            if (unpinned.length === 0) {
                context.toast('No unpinned tabs to sort');
                return;
            }

            unpinned.sort((a, b) => {
                const titleA = (a.title || a.url || '').toLowerCase();
                const titleB = (b.title || b.url || '').toLowerCase();
                return titleA.localeCompare(titleB);
            });

            const pinnedCount = tabs.filter((t) => t.pinned).length;
            const tabIds = unpinned.map((t) => t.id!);
            await chrome.tabs.move(tabIds, { index: pinnedCount });
            context.toast('Tabs sorted alphabetically');
        },
    },
    {
        id: 'new-tab',
        title: 'Open New Tab',
        category: 'Tab Management & Memory',
        keywords: ['create tab', 'add tab', 'new blank tab', 'plus tab'],
        icon: Plus,
        run: async (context) => {
            if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
                await chrome.tabs.create({ active: true });
            }
            context.toast('Opened new tab');
        },
    },
    {
        id: 'new-window',
        title: 'Open New Window',
        category: 'Tab Management & Memory',
        keywords: ['create window', 'add window', 'new browser window'],
        icon: AppWindow,
        run: async (context) => {
            if (typeof chrome !== 'undefined' && chrome.windows?.create) {
                await chrome.windows.create({ focused: true });
            }
            context.toast('Opened new window');
        },
    },
    {
        id: 'switch-view-active',
        title: 'Switch View: Active Session',
        category: 'Tab Management & Memory',
        keywords: ['go to active', 'view active', 'open active session', 'active tabs tree'],
        icon: LayoutList,
        run: (context) => {
            context.setActiveView('active');
            context.toast('Switched to Active Session view');
        },
    },

    // ══════════════════════════════════════════════════════════════════
    // 3. AUDIO & TAB CONTROL (4 Commands)
    // ══════════════════════════════════════════════════════════════════
    {
        id: 'mute-audible-tabs',
        title: 'Mute All Audible Tabs',
        category: 'Audio & Tab Control',
        keywords: ['mute audio', 'silence tabs', 'mute playing', 'stop noise', 'quiet'],
        icon: VolumeX,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.update) {
                context.toast('Tabs API unavailable');
                return;
            }
            const audibleTabs = await chrome.tabs.query({ currentWindow: true, audible: true });
            if (audibleTabs.length === 0) {
                context.toast('No audible tabs currently playing sound');
                return;
            }
            for (const tab of audibleTabs) {
                if (tab.id) {
                    await chrome.tabs.update(tab.id, { muted: true }).catch(() => {});
                }
            }
            context.toast(`Muted ${audibleTabs.length} audible tab${audibleTabs.length > 1 ? 's' : ''}`);
        },
    },
    {
        id: 'unmute-all-tabs',
        title: 'Unmute All Tabs',
        category: 'Audio & Tab Control',
        keywords: ['unmute audio', 'restore sound', 'enable audio'],
        icon: Volume2,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.update) {
                context.toast('Tabs API unavailable');
                return;
            }
            const tabs = await chrome.tabs.query({ currentWindow: true, muted: true });
            if (tabs.length === 0) {
                context.toast('No muted tabs in this window');
                return;
            }
            for (const tab of tabs) {
                if (tab.id) {
                    await chrome.tabs.update(tab.id, { muted: false }).catch(() => {});
                }
            }
            context.toast(`Unmuted ${tabs.length} tab${tabs.length > 1 ? 's' : ''}`);
        },
    },
    {
        id: 'reload-all-tabs',
        title: 'Reload All Tabs in Window',
        category: 'Audio & Tab Control',
        keywords: ['refresh all', 'reload window', 'reload tabs', 'refresh window'],
        icon: RotateCw,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.reload) {
                context.toast('Tabs API unavailable');
                return;
            }
            const tabs = await chrome.tabs.query({ currentWindow: true });
            for (const tab of tabs) {
                if (tab.id) {
                    chrome.tabs.reload(tab.id).catch(() => {});
                }
            }
            context.toast(`Reloading ${tabs.length} tab${tabs.length > 1 ? 's' : ''}`);
        },
    },
    {
        id: 'close-unpinned-tabs',
        title: 'Close Unpinned Tabs',
        category: 'Audio & Tab Control',
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

    // ══════════════════════════════════════════════════════════════════
    // 4. READ LATER & INGESTION (4 Commands)
    // ══════════════════════════════════════════════════════════════════
    {
        id: 'save-active-tab-read-later',
        title: 'Save Active Tab to Read Later',
        category: 'Read Later & Ingestion',
        keywords: ['save tab', 'read later', 'bookmark reading', 'defer tab', 'pocket'],
        shortcut: getReadLaterShortcutText(),
        icon: BookmarkPlus,
        run: async (context) => {
            if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
                context.toast('Tabs API unavailable');
                return;
            }
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!activeTab || !activeTab.url) {
                context.toast('No active tab URL to save');
                return;
            }
            try {
                await readLaterService.addFromTab({
                    url: activeTab.url,
                    title: activeTab.title,
                    favIconUrl: activeTab.favIconUrl,
                });
                context.toast(`Saved to Read Later`, {
                    description: activeTab.title || activeTab.url,
                });
            } catch (err: any) {
                if (err?.name === 'DuplicateReadLaterError') {
                    context.toast('Link is already in your Read Later list');
                } else {
                    context.toast(err?.message || 'Failed to save to Read Later');
                }
            }
        },
    },
    {
        id: 'archive-all-unread',
        title: 'Archive All Unread Items',
        category: 'Read Later & Ingestion',
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
        category: 'Read Later & Ingestion',
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
        category: 'Read Later & Ingestion',
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

    // ══════════════════════════════════════════════════════════════════
    // 5. NAVIGATION & SYSTEM (5 Commands)
    // ══════════════════════════════════════════════════════════════════
    {
        id: 'switch-view-read-later',
        title: 'Switch View: Read Later',
        category: 'Navigation & System',
        keywords: ['go to read later', 'view read later', 'reading list', 'inbox view'],
        icon: BookOpen,
        run: (context) => {
            context.setActiveView('read-later');
            context.toast('Switched to Read Later view');
        },
    },
    {
        id: 'toggle-theme',
        title: 'Toggle Light/Dark Theme',
        category: 'Navigation & System',
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
        category: 'Navigation & System',
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
        category: 'Navigation & System',
        keywords: ['preferences', 'options', 'config', 'configuration', 'settings'],
        icon: Settings,
        run: (context) => {
            context.setSettingsOpen(true);
        },
    },
    {
        id: 'open-shortcuts-settings',
        title: 'Configure Keyboard Shortcuts',
        category: 'Navigation & System',
        keywords: ['hotkeys', 'shortcuts', 'keybindings', 'commands', 'keyboard'],
        icon: Keyboard,
        run: (context) => {
            openShortcutsSettings();
            context.toast('Opening keyboard shortcuts settings');
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
