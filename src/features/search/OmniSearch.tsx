import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Search, Terminal, History, ChevronRight, X } from 'lucide-react';
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from '@/components/ui/Command';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { spaceService, tabService } from '@/lib';
import { DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { partitionSearchQuery } from './utils/searchUtils';
import { useOmniSearchData } from './hooks/useOmniSearchData';
import { useCommandExecutor } from './hooks/useCommandExecutor';
import { COMMAND_REGISTRY, COMMAND_CATEGORIES, filterCommands } from './registry/commandRegistry';
import { SearchItemRow } from './components/SearchItemRow';
import { CommandItemRow } from './components/CommandItemRow';
import { SearchSectionHeader } from './components/SearchSectionHeader';
import { TopSiteRow, PinnedSpaceRow, RecentSessionRow } from './components/LaunchpadRows';
import { useLaunchpadData } from './hooks/useLaunchpadData';
import { FilterChipTray } from './components/FilterChipTray';
import type {
    TabSearchResult,
    SpaceSearchResult,
    SavedTabSearchResult,
    ReadLaterSearchResult,
    BookmarkSearchResult,
    CommandAction,
    TopSiteItem,
    RecentSessionItem,
    SearchFilterDirective,
} from './types';

export const OmniSearch: React.FC = () => {
    const { isSearchOpen, setSearchOpen } = useUIStore();
    const activeSpaces = useAppStore((state) => state.activeSpaces);
    const recentSearches = useAppStore((state) => state.recentSearches);
    const addRecentSearch = useAppStore((state) => state.addRecentSearch);

    const [rawValue, setRawValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const { mode, query } = useMemo(() => partitionSearchQuery(rawValue), [rawValue]);

    const {
        filteredActiveTabs,
        filteredSpaces,
        filteredSavedTabs,
        filteredReadLater,
        filteredBookmarks,
        totalResultsCount,
        parsedQuery,
    } = useOmniSearchData(isSearchOpen && mode === 'search' && query.length > 0, query);

    const {
        topSites,
        pinnedSpaces,
        recentSessions,
    } = useLaunchpadData(isSearchOpen && mode === 'search' && query.length === 0);

    const { executeCommand } = useCommandExecutor();

    // Filter commands in command mode
    const filteredCommands = useMemo(() => {
        if (mode !== 'command') return [];
        return filterCommands(query, COMMAND_REGISTRY);
    }, [mode, query]);

    // Group commands by category
    const groupedCommands = useMemo(() => {
        if (mode !== 'command') return new Map<string, CommandAction[]>();

        const map = new Map<string, CommandAction[]>();
        for (const cat of COMMAND_CATEGORIES) {
            const matches = filteredCommands.filter((c) => c.category === cat);
            if (matches.length > 0) {
                map.set(cat, matches);
            }
        }
        return map;
    }, [mode, filteredCommands]);

    // Clear input on dialog close
    useEffect(() => {
        if (!isSearchOpen) {
            setRawValue('');
        }
    }, [isSearchOpen]);

    // Keyboard shortcut: Ctrl+K / Cmd+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setSearchOpen(!isSearchOpen);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, setSearchOpen]);

    // Remove filter token cleanly from raw input
    const handleRemoveFilter = useCallback((directive: SearchFilterDirective) => {
        setRawValue((prev) => {
            const token = directive.rawToken;
            const idx = prev.indexOf(token);
            if (idx === -1) return prev;
            const before = prev.slice(0, idx).trimEnd();
            const after = prev.slice(idx + token.length).trimStart();
            return before && after ? `${before} ${after}` : before || after;
        });
    }, []);

    // Handle Backspace when in command mode to easily escape back to search
    const handleInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Backspace' && (rawValue === '>' || rawValue === '')) {
                setRawValue('');
            }
        },
        [rawValue]
    );

    // Entity Selection Handlers
    const handleSelectTab = useCallback(
        async (tab: TabSearchResult) => {
            if (query) addRecentSearch(query);
            setSearchOpen(false);
            if (tab.windowId && tab.id) {
                await chrome.windows?.update(tab.windowId, { focused: true }).catch(() => {});
                await chrome.tabs?.update(tab.id, { active: true }).catch(() => {});
            }
        },
        [setSearchOpen, query, addRecentSearch]
    );

    const handleSelectSpace = useCallback(
        async (space: SpaceSearchResult) => {
            if (query) addRecentSearch(query);
            setSearchOpen(false);
            if (!space.id) return;

            const activeWindowId = activeSpaces[space.id];
            if (activeWindowId) {
                await chrome.windows?.update(activeWindowId, { focused: true }).catch(() => {
                    spaceService.restoreSpace(space.id);
                });
            } else {
                await spaceService.restoreSpace(space.id);
            }
        },
        [setSearchOpen, activeSpaces, query, addRecentSearch]
    );

    const handleSelectUrlItem = useCallback(
        async (item: SavedTabSearchResult | ReadLaterSearchResult | BookmarkSearchResult) => {
            if (query) addRecentSearch(query);
            setSearchOpen(false);
            await tabService.focusOrCreate(item.url).catch(() => {});
        },
        [setSearchOpen, query, addRecentSearch]
    );

    const handleSelectTopSite = useCallback(
        async (site: TopSiteItem) => {
            setSearchOpen(false);
            await tabService.focusOrCreate(site.url).catch(() => {});
        },
        [setSearchOpen]
    );

    const handleSelectRecentSession = useCallback(
        async (item: RecentSessionItem) => {
            setSearchOpen(false);
            if (item.sessionId && typeof chrome !== 'undefined' && chrome.sessions?.restore) {
                try {
                    await chrome.sessions.restore(item.sessionId);
                } catch {
                    if (item.url) {
                        await tabService.focusOrCreate(item.url).catch(() => {});
                    }
                }
            } else if (item.url) {
                await tabService.focusOrCreate(item.url).catch(() => {});
            }
        },
        [setSearchOpen]
    );

    const handleSelectCommand = useCallback(
        async (command: CommandAction) => {
            await executeCommand(command);
        },
        [executeCommand]
    );

    const toggleMode = useCallback(() => {
        if (mode === 'command') {
            setRawValue('');
        } else {
            setRawValue('> ');
        }
        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                const len = inputRef.current.value.length;
                inputRef.current.setSelectionRange(len, len);
            }
        });
    }, [mode]);

    return (
        <CommandDialog
            open={isSearchOpen}
            onOpenChange={setSearchOpen}
            shouldFilter={false}
        >
            <DialogTitle className="sr-only">OmniSearch 2.0</DialogTitle>
            <DialogDescription className="sr-only">
                Search tabs, spaces, bookmarks, read later items or execute workspace commands
            </DialogDescription>

            <CommandInput
                ref={inputRef}
                placeholder={
                    mode === 'command'
                        ? 'Type a command or action (e.g. discard, theme, backup)...'
                        : 'Search tabs, spaces, bookmarks, read later... (Type > for commands)'
                }
                value={rawValue}
                onValueChange={setRawValue}
                onKeyDown={handleInputKeyDown}
                icon={
                    mode === 'command' ? (
                        <Terminal className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                        <Search className="h-4 w-4 shrink-0 opacity-50" />
                    )
                }
                rightElement={
                    <div className="flex-shrink-0 flex items-center gap-1.5">
                        {mode === 'command' ? (
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="text-xxs font-mono bg-primary text-primary-foreground font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                                aria-label="Click to exit command mode"
                            >
                                <span>&gt; Commands</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={toggleMode}
                                className="text-xxs font-mono text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/50 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                                aria-label="Switch to Command Mode"
                            >
                                <span>&gt; Commands</span>
                                <ChevronRight className="h-3 w-3" />
                            </button>
                        )}

                        <TooltipSimple content="Close (Esc)" side="bottom">
                            <button
                                type="button"
                                onClick={() => setSearchOpen(false)}
                                className="h-6 w-6 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                aria-label="Close search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </TooltipSimple>
                    </div>
                }
            />

            {mode === 'search' && parsedQuery.filters.length > 0 && (
                <FilterChipTray
                    filters={parsedQuery.filters}
                    onRemoveFilter={handleRemoveFilter}
                />
            )}

            <CommandList className="max-h-[360px] overflow-y-auto">
                {/* Mode Empty States */}
                {mode === 'search' && totalResultsCount === 0 && query.length > 0 && (
                    <CommandEmpty>No matching tabs, spaces, or bookmarks found.</CommandEmpty>
                )}

                {mode === 'command' && filteredCommands.length === 0 && (
                    <CommandEmpty>No matching commands found.</CommandEmpty>
                )}

                {/* SEARCH MODE: Recent Searches */}
                {mode === 'search' && query.length === 0 && recentSearches.length > 0 && (
                    <CommandGroup heading={<SearchSectionHeader title="Recent Searches" count={recentSearches.length} /> as any}>
                        {recentSearches.map((term) => (
                            <CommandItem
                                key={`recent-${term}`}
                                value={`recent ${term}`}
                                onSelect={() => setRawValue(term)}
                                className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
                            >
                                <History className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-xs text-foreground font-normal">{term}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {/* SEARCH MODE (ZERO STATE): Intelligent Launchpad */}
                {mode === 'search' && query.length === 0 && (
                    <>
                        {topSites.length > 0 && (
                            <CommandGroup heading={<SearchSectionHeader title="Frequent Sites" count={topSites.length} /> as any}>
                                {topSites.map((site) => (
                                    <TopSiteRow
                                        key={`top-${site.url}`}
                                        site={site}
                                        onSelect={() => handleSelectTopSite(site)}
                                    />
                                ))}
                            </CommandGroup>
                        )}

                        {pinnedSpaces.length > 0 && (
                            <CommandGroup heading={<SearchSectionHeader title="Pinned Spaces" count={pinnedSpaces.length} /> as any}>
                                {pinnedSpaces.map((space) => (
                                    <PinnedSpaceRow
                                        key={`pinned-${space.id}`}
                                        space={space}
                                        isActive={Boolean(space.id && activeSpaces[space.id])}
                                        onSelect={() => handleSelectSpace(space)}
                                    />
                                ))}
                            </CommandGroup>
                        )}

                        {recentSessions.length > 0 && (
                            <CommandGroup heading={<SearchSectionHeader title="Recently Closed" count={recentSessions.length} /> as any}>
                                {recentSessions.map((session, idx) => (
                                    <RecentSessionRow
                                        key={`recentsess-${session.sessionId || idx}-${session.lastModified}`}
                                        session={session}
                                        onSelect={() => handleSelectRecentSession(session)}
                                    />
                                ))}
                            </CommandGroup>
                        )}
                    </>
                )}

                {/* SEARCH MODE: Active Tabs */}
                {mode === 'search' && filteredActiveTabs.length > 0 && (
                    <CommandGroup heading={<SearchSectionHeader title="Active Tabs" count={filteredActiveTabs.length} /> as any}>
                        {filteredActiveTabs.map((tab) => (
                            <SearchItemRow
                                key={`tab-${tab.id}`}
                                item={tab}
                                onSelect={() => handleSelectTab(tab)}
                            />
                        ))}
                    </CommandGroup>
                )}

                {/* SEARCH MODE: Spaces */}
                {mode === 'search' && filteredSpaces.length > 0 && (
                    <CommandGroup heading={<SearchSectionHeader title="Saved Spaces" count={filteredSpaces.length} /> as any}>
                        {filteredSpaces.map((space) => (
                            <SearchItemRow
                                key={`space-${space.id}`}
                                item={space}
                                isActiveSpace={Boolean(space.id && activeSpaces[space.id])}
                                onSelect={() => handleSelectSpace(space)}
                            />
                        ))}
                    </CommandGroup>
                )}

                {/* SEARCH MODE: Saved Space Tabs */}
                {mode === 'search' && filteredSavedTabs.length > 0 && (
                    <CommandGroup heading={<SearchSectionHeader title="Space Tabs" count={filteredSavedTabs.length} /> as any}>
                        {filteredSavedTabs.map((tab) => (
                            <SearchItemRow
                                key={`saved-${tab.url}`}
                                item={tab}
                                onSelect={() => handleSelectUrlItem(tab)}
                            />
                        ))}
                    </CommandGroup>
                )}

                {/* SEARCH MODE: Read Later */}
                {mode === 'search' && filteredReadLater.length > 0 && (
                    <CommandGroup heading={<SearchSectionHeader title="Read Later" count={filteredReadLater.length} /> as any}>
                        {filteredReadLater.map((item) => (
                            <SearchItemRow
                                key={`rl-${item.id}`}
                                item={item}
                                onSelect={() => handleSelectUrlItem(item)}
                            />
                        ))}
                    </CommandGroup>
                )}

                {/* SEARCH MODE: Bookmarks */}
                {mode === 'search' && filteredBookmarks.length > 0 && (
                    <CommandGroup heading={<SearchSectionHeader title="Bookmarks" count={filteredBookmarks.length} /> as any}>
                        {filteredBookmarks.map((bm) => (
                            <SearchItemRow
                                key={`bm-${bm.id}`}
                                item={bm}
                                onSelect={() => handleSelectUrlItem(bm)}
                            />
                        ))}
                    </CommandGroup>
                )}

                {/* COMMAND MODE: Grouped Action Registry */}
                {mode === 'command' && (
                    <>
                        {Array.from(groupedCommands.entries()).map(([category, commands]) => (
                            <CommandGroup
                                key={`cat-${category}`}
                                heading={<SearchSectionHeader title={category} count={commands.length} /> as any}
                            >
                                {commands.map((cmd) => (
                                    <CommandItemRow
                                        key={cmd.id}
                                        command={cmd}
                                        onSelect={() => handleSelectCommand(cmd)}
                                    />
                                ))}
                            </CommandGroup>
                        ))}
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
};
