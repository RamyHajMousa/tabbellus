import React from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Plus, AppWindow, XCircle, ArrowUpDown, Globe, ArrowDownAZ, Layers } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toaster';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { autoGroupByDomain } from '../utils/groupingUtils';

interface ActiveToolbarProps {
    tabs: chrome.tabs.Tab[];
    activeTabId?: number | null;
}

export const ActiveToolbar = React.memo<ActiveToolbarProps>(({ tabs, activeTabId }) => {
    const { toast } = useToast();

    const handleGoBack = () => {
        if (activeTabId) {
            chrome.tabs.goBack(activeTabId).catch(() => { });
        }
    };

    const handleGoForward = () => {
        if (activeTabId) {
            chrome.tabs.goForward(activeTabId).catch(() => { });
        }
    };

    const handleReload = () => {
        if (activeTabId) {
            chrome.tabs.reload(activeTabId).catch(() => { });
        }
    };

    const handleNewTab = () => {
        chrome.tabs.create({ active: true });
    };

    const handleNewWindow = async () => {
        try {
            await chrome.windows.create({ focused: true });
        } catch (err) {
            console.error('Failed to create new window:', err);
            toast('Failed to create new window', {
                description: err instanceof Error ? err.message : 'An unexpected error occurred.',
            });
        }
    };

    const handleCloseUnpinned = async () => {
        const unpinnedTabs = tabs.filter((t) => !t.pinned && t.id !== undefined);
        if (unpinnedTabs.length === 0) return;

        // Snapshot metadata for undo recovery
        const snapshot = unpinnedTabs.map((t) => ({
            url: t.url || '',
            title: t.title || '',
            index: t.index,
        }));

        const unpinnedIds = unpinnedTabs.map((t) => t.id!);

        try {
            await chrome.tabs.remove(unpinnedIds);

            toast(`Closed ${unpinnedTabs.length} unpinned tab${unpinnedTabs.length > 1 ? 's' : ''}`, {
                duration: 5000,
                onUndo: async () => {
                    for (const item of snapshot) {
                        if (item.url) {
                            await chrome.tabs.create({
                                url: item.url,
                                index: item.index,
                                active: false,
                            }).catch(() => { });
                        }
                    }
                },
            });
        } catch (err) {
            console.error('Failed to close unpinned tabs:', err);
        }
    };

    const getHost = (url?: string) => {
        if (!url) return '';
        try {
            return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            return '';
        }
    };

    const topologyAwareSort = async (
        unpinned: chrome.tabs.Tab[],
        sortFn: (a: chrome.tabs.Tab, b: chrome.tabs.Tab) => number,
        pinnedCount: number,
        toastMessage: string
    ) => {
        if (unpinned.length === 0) return;

        try {
            // ── Phase 1: Partition by groupId ──
            // Groups (groupId > 0) stay as contiguous blocks; ungrouped tabs (-1) are individual entities.
            const groupBuckets = new Map<number, chrome.tabs.Tab[]>();
            const ungroupedTabs: chrome.tabs.Tab[] = [];

            for (const tab of unpinned) {
                const gid = (tab.groupId === undefined || tab.groupId === -1 || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE)
                    ? -1
                    : tab.groupId;

                if (gid === -1) {
                    ungroupedTabs.push(tab);
                } else {
                    if (!groupBuckets.has(gid)) {
                        groupBuckets.set(gid, []);
                    }
                    groupBuckets.get(gid)!.push(tab);
                }
            }

            // ── Phase 2: Internal sort within each group bucket ──
            for (const bucket of groupBuckets.values()) {
                bucket.sort(sortFn);
            }

            // ── Phase 3: Build sortable entities ──
            // Each entity is either a group block (sorted by its first tab's key) or a single ungrouped tab.
            type SortEntity = { type: 'group'; gid: number; tabs: chrome.tabs.Tab[] } | { type: 'tab'; tab: chrome.tabs.Tab };

            const entities: SortEntity[] = [];

            for (const [gid, tabs] of groupBuckets) {
                entities.push({ type: 'group', gid, tabs });
            }
            for (const tab of ungroupedTabs) {
                entities.push({ type: 'tab', tab });
            }

            // Representative tab for sorting: first tab of a group, or the tab itself.
            const getRepresentative = (entity: SortEntity): chrome.tabs.Tab =>
                entity.type === 'group' ? entity.tabs[0] : entity.tab;

            entities.sort((a, b) => sortFn(getRepresentative(a), getRepresentative(b)));

            // ── Phase 4: Flatten into ordered ID array ──
            const flattenedIds: number[] = [];
            // Track group -> tabIds for the heal pass
            const groupHealMap = new Map<number, number[]>();

            for (const entity of entities) {
                if (entity.type === 'group') {
                    const ids: number[] = [];
                    for (const tab of entity.tabs) {
                        if (tab.id !== undefined) {
                            flattenedIds.push(tab.id);
                            ids.push(tab.id);
                        }
                    }
                    if (ids.length > 0) {
                        groupHealMap.set(entity.gid, ids);
                    }
                } else {
                    if (entity.tab.id !== undefined) {
                        flattenedIds.push(entity.tab.id);
                    }
                }
            }

            if (flattenedIds.length === 0) return;

            // ── Phase 5: Batch move ──
            // Single atomic call preserves relative order; Chrome processes the array left-to-right.
            await chrome.tabs.move(flattenedIds, { index: pinnedCount });

            // ── Phase 6: Heal group bindings ──
            // chrome.tabs.move may strip group membership; re-bind each group's tabs.
            for (const [gid, tabIds] of groupHealMap) {
                await chrome.tabs.group({ groupId: gid, tabIds }).catch(() => { });
            }

            toast(toastMessage);
        } catch (err) {
            console.error('Group-aware sort failed:', err);
        }
    };

    const handleSortByDomain = async () => {
        const pinnedCount = tabs.filter((t) => t.pinned).length;
        const unpinned = tabs.filter((t) => !t.pinned && t.id !== undefined);

        await topologyAwareSort(unpinned, (a, b) => {
            const domainA = getHost(a.url);
            const domainB = getHost(b.url);
            if (domainA !== domainB) {
                return domainA.localeCompare(domainB);
            }
            return (a.title || a.url || '').localeCompare(b.title || b.url || '');
        }, pinnedCount, "Tabs sorted by domain");
    };

    const handleSortAlphabetically = async () => {
        const pinnedCount = tabs.filter((t) => t.pinned).length;
        const unpinned = tabs.filter((t) => !t.pinned && t.id !== undefined);

        await topologyAwareSort(unpinned, (a, b) => {
            const titleA = (a.title || a.url || '').toLowerCase();
            const titleB = (b.title || b.url || '').toLowerCase();
            return titleA.localeCompare(titleB);
        }, pinnedCount, "Tabs sorted alphabetically");
    };

    const handleGroupByDomain = async () => {
        const { groupsCreated } = await autoGroupByDomain(tabs);
        if (groupsCreated > 0) {
            toast("Tabs Grouped", { description: `Successfully created ${groupsCreated} domain groups.` });
        } else {
            toast("No groupable domains found", { duration: 3000 });
        }
    };

    return (
        <div className="h-8 flex items-center justify-between px-3 bg-background border-b border-border flex-shrink-0 z-10 select-none">
            {/* Left Group Navigation */}
            <div className="flex items-center gap-0.5">
                <TooltipSimple content="New Tab" side="bottom">
                    <button
                        onClick={handleNewTab}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Open new tab"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="New Window" side="bottom">
                    <button
                        onClick={handleNewWindow}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Open new window"
                    >
                        <AppWindow className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Back" side="bottom">
                    <button
                        onClick={handleGoBack}
                        disabled={!activeTabId}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                        aria-label="Go back"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Forward" side="bottom">
                    <button
                        onClick={handleGoForward}
                        disabled={!activeTabId}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                        aria-label="Go forward"
                    >
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Reload" side="bottom">
                    <button
                        onClick={handleReload}
                        disabled={!activeTabId}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                        aria-label="Reload tab"
                    >
                        <RotateCw className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>

            {/* Right Group Actions */}
            <div className="flex items-center gap-0.5">
                <TooltipSimple content="Group by Domain" side="bottom">
                    <button
                        onClick={handleGroupByDomain}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors outline-none"
                        aria-label="Group by domain"
                    >
                        <Layers className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <DropdownMenu modal={false}>
                    <TooltipSimple content="Sort Tabs" side="bottom">
                        <DropdownMenuTrigger asChild>
                            <button
                                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors outline-none"
                                aria-label="Sort tabs"
                            >
                                <ArrowUpDown className="w-3.5 h-3.5" />
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipSimple>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={handleSortByDomain} className="cursor-pointer">
                            <Globe className="mr-2 h-4 w-4" />
                            Sort by Domain
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleSortAlphabetically} className="cursor-pointer">
                            <ArrowDownAZ className="mr-2 h-4 w-4" />
                            Sort Alphabetically (A-Z)
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <TooltipSimple content="Close All Unpinned" side="bottom">
                    <button
                        onClick={handleCloseUnpinned}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        aria-label="Close all unpinned tabs"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>
        </div>
    );
});
