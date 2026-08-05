import React from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Plus, XCircle, ArrowUpDown, Globe, ArrowDownAZ, Layers } from 'lucide-react';
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

        // Constraint 1: Partitioning
        const buckets = new Map<number, chrome.tabs.Tab[]>();
        unpinned.forEach(tab => {
            const gid = (tab.groupId === undefined || tab.groupId === -1 || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) 
                ? -1 
                : tab.groupId;
            if (!buckets.has(gid)) {
                buckets.set(gid, []);
            }
            buckets.get(gid)!.push(tab);
        });

        // Constraint 2: Internal Bucket Sorting
        for (const bucket of buckets.values()) {
            bucket.sort(sortFn);
        }

        // Constraint 3: Group Order Sorting
        const gids = Array.from(buckets.keys());
        gids.sort((a, b) => {
            if (a === -1) return -1;
            if (b === -1) return 1;
            const tabA = buckets.get(a)![0];
            const tabB = buckets.get(b)![0];
            return sortFn(tabA, tabB);
        });

        // Constraint 4: Contiguous Reassembly
        const sorted: chrome.tabs.Tab[] = [];
        for (const gid of gids) {
            sorted.push(...buckets.get(gid)!);
        }

        // Constraint 5: Execution
        for (let i = 0; i < sorted.length; i++) {
            const tab = sorted[i];
            await chrome.tabs.move(tab.id!, { index: pinnedCount + i }).catch(() => { });
        }

        toast(toastMessage);
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

                <DropdownMenu>
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
