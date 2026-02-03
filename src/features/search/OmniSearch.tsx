import { useEffect, useState, useCallback } from 'react';
import { LayoutTemplate, Package, BookOpen } from 'lucide-react';
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
import { db, spaceService } from '@/lib';
import type { Space, ReadLaterItem } from '@/lib/db';
import { DialogTitle, DialogDescription } from '@/components/ui/Dialog';

export const OmniSearch = () => {
    const { isSearchOpen, setSearchOpen } = useUIStore();
    const activeSpaces = useAppStore((state) => state.activeSpaces);

    const [activeTabs, setActiveTabs] = useState<chrome.tabs.Tab[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [readLater, setReadLater] = useState<ReadLaterItem[]>([]);

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

        // Fetch spaces
        db.spaces.filter(s => !s.deletedAt).toArray().then(setSpaces).catch(() => setSpaces([]));

        // Fetch read later items
        db.readLater.toArray().then(setReadLater).catch(() => setReadLater([]));
    }, [isSearchOpen]);

    const handleSelectTab = useCallback(async (tab: chrome.tabs.Tab) => {
        setSearchOpen(false);
        if (tab.windowId && tab.id) {
            await chrome.windows.update(tab.windowId, { focused: true }).catch(() => { });
            await chrome.tabs.update(tab.id, { active: true }).catch(() => { });
        }
    }, [setSearchOpen]);

    const handleSelectSpace = useCallback(async (space: Space) => {
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
    }, [setSearchOpen, activeSpaces]);

    const handleSelectReadLater = useCallback(async (item: ReadLaterItem) => {
        setSearchOpen(false);
        await chrome.tabs.create({ url: item.url, active: true });
    }, [setSearchOpen]);

    return (
        <CommandDialog open={isSearchOpen} onOpenChange={setSearchOpen}>
            <DialogTitle className="sr-only">OmniSearch</DialogTitle>
            <DialogDescription className="sr-only">Search across tabs, spaces, and read later items</DialogDescription>
            <CommandInput placeholder="Search tabs, spaces, read later..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

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
            </CommandList>
        </CommandDialog>
    );
};
