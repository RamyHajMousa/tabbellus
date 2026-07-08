import { useEffect, useState, useCallback } from 'react';
import { LayoutTemplate, Package, BookOpen, History, Globe } from 'lucide-react';
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from '@/components/ui/Command';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { spaceService, tabService, readLaterService } from '@/lib';
import type { Space, ReadLaterItem, SavedTabResult } from '@/lib/db';
import { DialogTitle, DialogDescription } from '@/components/ui/Dialog';



export const OmniSearch = () => {
    const { isSearchOpen, setSearchOpen } = useUIStore();
    const activeSpaces = useAppStore((state) => state.activeSpaces);
    const recentSearches = useAppStore((state) => state.recentSearches);
    const addRecentSearch = useAppStore((state) => state.addRecentSearch);

    const [search, setSearch] = useState('');
    const [activeTabs, setActiveTabs] = useState<chrome.tabs.Tab[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [readLater, setReadLater] = useState<ReadLaterItem[]>([]);
    const [savedTabs, setSavedTabs] = useState<SavedTabResult[]>([]);

    useEffect(() => {
        if (!isSearchOpen) {
            setSearch('');
        }
    }, [isSearchOpen]);

    // Keyboard shortcut: Ctrl+K / Cmd+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(!isSearchOpen);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isSearchOpen, setSearchOpen]);

    // Fetch data when dialog opens
    useEffect(() => {
        if (!isSearchOpen) return;

        // Fetch all tabs
        chrome.tabs.query({}).then(setActiveTabs).catch(() => setActiveTabs([]));

        // Fetch spaces using spaceService
        spaceService.getNonDeletedSpaces()
            .then(setSpaces)
            .catch(() => setSpaces([]));

        // Fetch grouped saved tabs using spaceService
        spaceService.getSavedTabsGroupedByUrl()
            .then(setSavedTabs)
            .catch(() => setSavedTabs([]));

        // Fetch read later items using readLaterService
        readLaterService.getAllItems()
            .then(setReadLater)
            .catch(() => setReadLater([]));
    }, [isSearchOpen]);

    const handleSelectTab = useCallback(async (tab: chrome.tabs.Tab) => {
        if (search) addRecentSearch(search);
        setSearchOpen(false);
        if (tab.windowId && tab.id) {
            await chrome.windows.update(tab.windowId, { focused: true }).catch(() => { });
            await chrome.tabs.update(tab.id, { active: true }).catch(() => { });
        }
    }, [setSearchOpen, search, addRecentSearch]);

    const handleSelectSpace = useCallback(async (space: Space) => {
        if (search) addRecentSearch(search);
        setSearchOpen(false);
        if (!space.id) return;

        const activeWindowId = activeSpaces[space.id];
        if (activeWindowId) {
            // Focus existing window
            await chrome.windows.update(activeWindowId, { focused: true }).catch(() => {
                // If window doesn't exist, restore
                spaceService.restoreSpace(space.id!);
            });
        } else {
            await spaceService.restoreSpace(space.id);
        }
    }, [setSearchOpen, activeSpaces, search, addRecentSearch]);

    const handleSelectReadLater = useCallback(async (item: ReadLaterItem) => {
        if (search) addRecentSearch(search);
        setSearchOpen(false);
        await chrome.tabs.create({ url: item.url, active: true });
    }, [setSearchOpen, search, addRecentSearch]);

    const handleSelectSavedTab = useCallback(async (tab: SavedTabResult) => {
        if (search) addRecentSearch(search);
        setSearchOpen(false);
        await tabService.focusOrCreate(tab.url).catch(() => { });
    }, [setSearchOpen, search, addRecentSearch]);

    return (
        <CommandDialog open={isSearchOpen} onOpenChange={setSearchOpen}>
            <DialogTitle className="sr-only">OmniSearch</DialogTitle>
            <DialogDescription className="sr-only">Search across tabs, spaces, and read later items</DialogDescription>
            <CommandInput
                placeholder="Search tabs, spaces, read later..."
                value={search}
                onValueChange={setSearch}
            />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

                {search.length === 0 && recentSearches.length > 0 && (
                    <CommandGroup heading="Recent Searches">
                        {recentSearches.map((term) => (
                            <CommandItem
                                key={term}
                                value={`recent ${term}`}
                                onSelect={() => setSearch(term)}
                            >
                                <History className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span>{term}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {spaces.length > 0 && (
                    <CommandGroup heading="Spaces">
                        {spaces.slice(0, 10).map((space) => (
                            <CommandItem
                                key={`space-${space.id}`}
                                value={`space ${space.name}`}
                                onSelect={() => handleSelectSpace(space)}
                            >
                                <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span className="truncate">{space.name}</span>
                                {space.id && activeSpaces[space.id] && (
                                    <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
                                )}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {savedTabs.length > 0 && (
                    <CommandGroup heading="Saved Tabs">
                        {savedTabs.map((tab) => (
                            <CommandItem
                                key={`saved-${tab.url}`}
                                value={`savedtab ${tab.title || ''} ${tab.url} ${tab.spaceNames.join(' ')}`}
                                onSelect={() => handleSelectSavedTab(tab)}
                            >
                                {tab.favicon ? (
                                    <img
                                        src={tab.favicon}
                                        alt=""
                                        className="mr-2 h-4 w-4 rounded-sm flex-shrink-0"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                ) : null}
                                <Globe className={`mr-2 h-4 w-4 text-muted-foreground flex-shrink-0 ${tab.favicon ? 'hidden' : ''}`} />
                                <span className="truncate">{tab.title || tab.url}</span>
                                <span className="ml-auto pl-2 text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                                    In: {tab.spaceNames.join(', ')}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {readLater.length > 0 && (
                    <CommandGroup heading="Read Later">
                        {readLater.slice(0, 10).map((item) => (
                            <CommandItem
                                key={`rl-${item.id}`}
                                value={`readlater ${item.title} ${item.url}`}
                                onSelect={() => handleSelectReadLater(item)}
                            >
                                <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span className="truncate">{item.title || item.url}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                {activeTabs.length > 0 && (
                    <CommandGroup heading="Active Tabs">
                        {activeTabs.slice(0, 10).map((tab) => (
                            <CommandItem
                                key={`tab-${tab.id}`}
                                value={`tab ${tab.title} ${tab.url}`}
                                onSelect={() => handleSelectTab(tab)}
                            >
                                <LayoutTemplate className="mr-2 h-4 w-4 text-muted-foreground" />
                                <span className="truncate">{tab.title || tab.url}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
            </CommandList>
        </CommandDialog>
    );
};
