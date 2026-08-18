import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, CheckCircle2 } from 'lucide-react';
import { readLaterService, getReadLaterShortcutText } from '@/lib';
import { useClipboard } from '@/hooks/useClipboard';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useToast } from '@/components/ui/Toaster';
import { ReadLaterToolbar } from './components/ReadLaterToolbar';
import { ReadLaterItem } from './components/ReadLaterItem';
import { SpaceSelectorModal } from '@/features/spaces/components/SpaceSelectorModal';
import type { ReadLaterItem as ReadLaterItemType } from '@/lib/db';

export const ReadLaterList = () => {
    const [showArchived, setShowArchived] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [spaceSelectorOpen, setSpaceSelectorOpen] = useState(false);
    const [spaceSelectorItem, setSpaceSelectorItem] = useState<ReadLaterItemType | null>(null);
    const { toast } = useToast();
    const { copy } = useClipboard();

    // ── Data Queries ──────────────────────────────────────────────
    const items = useLiveQuery(
        readLaterService.getItemsByStatusQuery(showArchived ? 'archived' : 'unread'),
        [showArchived]
    );

    // ── Delete with Undo ──────────────────────────────────────────
    const { deleteWithUndo: deleteItem } = useUndoDelete({
        fetch: (id) => readLaterService.getItemById(id),
        delete: (id) => readLaterService.deleteItem(id),
        restore: (item) => readLaterService.restoreItem(item),
    });

    // ── Memoized Filter Pipeline ──────────────────────────────────
    const filteredItems = useMemo(() => {
        if (!items) return [];
        if (!searchQuery.trim()) return items;
        const q = searchQuery.toLowerCase().trim();
        return items.filter(item => {
            const titleMatch = item.title ? item.title.toLowerCase().includes(q) : false;
            const urlMatch = item.url.toLowerCase().includes(q);
            return titleMatch || urlMatch;
        });
    }, [items, searchQuery]);

    // ── Callbacks ─────────────────────────────────────────────────
    const handleToggleStatus = useCallback(async (id: number, currentStatus: ReadLaterItemType['status']) => {
        const newStatus: ReadLaterItemType['status'] = currentStatus === 'unread' ? 'archived' : 'unread';
        await readLaterService.updateStatus(id, newStatus);
    }, []);

    const handleDelete = useCallback(async (id: number) => {
        await deleteItem(id, "Item deleted");
    }, [deleteItem]);

    const handleOpen = useCallback(async (url: string, id: number) => {
        await chrome.tabs.create({ url, active: true });
        await readLaterService.updateStatus(id, 'archived');
    }, []);

    const handleSendToSpace = useCallback((item: ReadLaterItemType) => {
        setSpaceSelectorItem(item);
        setSpaceSelectorOpen(true);
    }, []);

    const handleArchiveAll = useCallback(async () => {
        const count = await readLaterService.archiveAllUnread();
        if (count > 0) {
            toast(`Archived ${count} item${count === 1 ? '' : 's'}`);
        }
    }, [toast]);

    const handleClearAllArchived = useCallback(async () => {
        const archivedItems = await readLaterService.clearAllArchived();
        const count = archivedItems.length;
        if (count > 0) {
            toast(`Cleared ${count} archived link${count === 1 ? '' : 's'}`, {
                duration: 5000,
                onUndo: async () => {
                    try {
                        await readLaterService.restoreItems(archivedItems);
                        toast(`Restored ${count} archived link${count === 1 ? '' : 's'}`);
                    } catch (err) {
                        console.error('Failed to restore archived links:', err);
                        toast('Failed to restore archived links');
                    }
                }
            });
        }
    }, [toast]);

    const handleCopyAllUrls = useCallback(() => {
        const visibleItems = filteredItems;
        if (!visibleItems.length) {
            toast('No links to copy', { description: 'There are no visible links to copy.' });
            return;
        }
        const text = visibleItems.map(item => item.url).join('\n');
        copy(text);
        const label = visibleItems.length === 1 ? '1 URL' : `${visibleItems.length} URLs`;
        toast(`Copied ${label} to clipboard`);
    }, [filteredItems, copy, toast]);

    const handleSearchChange = useCallback((query: string) => {
        setSearchQuery(query);
    }, []);

    const handleCloseSpaceSelector = useCallback(() => {
        setSpaceSelectorOpen(false);
        setSpaceSelectorItem(null);
    }, []);

    return (
        <div className="flex flex-col h-full bg-background select-none">
            {/* Header / Filter Toggle */}
            <div className="p-4 border-b border-border flex-shrink-0">
                <div className="flex bg-muted p-1 rounded-lg">
                    <button
                        onClick={() => { setShowArchived(false); setSearchQuery(''); }}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${!showArchived ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Unread
                    </button>
                    <button
                        onClick={() => { setShowArchived(true); setSearchQuery(''); }}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${showArchived ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Archived
                    </button>
                </div>
            </div>

            {/* Local Toolbar */}
            <ReadLaterToolbar
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                onCopyAllUrls={handleCopyAllUrls}
                onArchiveAll={handleArchiveAll}
                onClearAllArchived={handleClearAllArchived}
            />

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredItems.map((item) => (
                    <ReadLaterItem
                        key={item.id}
                        item={item}
                        onToggleStatus={handleToggleStatus}
                        onDelete={handleDelete}
                        onOpen={handleOpen}
                        onSendToSpace={handleSendToSpace}
                    />
                ))}

                {filteredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-center px-8">
                        {showArchived ? (
                            <Archive className="w-8 h-8 text-muted-foreground/20 mb-3" />
                        ) : (
                            <CheckCircle2 className="w-8 h-8 text-muted-foreground/20 mb-3" />
                        )}
                        <p className="text-sm font-medium text-muted-foreground">
                            {showArchived
                                ? (searchQuery ? `No archived items matching "${searchQuery}"` : "No archived items yet")
                                : (searchQuery ? `No unread items matching "${searchQuery}"` : "You're all caught up")
                            }
                        </p>
                        {!showArchived && !searchQuery && (
                            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-[240px] leading-relaxed">
                                Press <kbd className="px-1.5 py-0.5 text-xxs font-semibold text-foreground bg-muted border border-border rounded shadow-xs">{getReadLaterShortcutText()}</kbd> on any webpage to instantly save it here.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Space Selector Modal */}
            {spaceSelectorItem && (
                <SpaceSelectorModal
                    isOpen={spaceSelectorOpen}
                    onClose={handleCloseSpaceSelector}
                    mode="save"
                    tab={{
                        url: spaceSelectorItem.url,
                        title: spaceSelectorItem.title,
                        favicon: spaceSelectorItem.favicon,
                        spaceNames: [],
                    } satisfies import('@/lib/db').SavedTabResult}
                />
            )}
        </div>
    );
};
