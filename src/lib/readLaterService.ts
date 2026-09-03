import { db, type ReadLaterItem } from './db';
import { contractRegistry } from '@/core/contracts/registry';

class ReadLaterService {
    /**
     * Retrieves a read later item by its ID.
     */
    async getItemById(itemId: number): Promise<ReadLaterItem | undefined> {
        return db.readLater.get(itemId);
    }

    /**
     * Soft deletes a read later item by its ID by setting deletedAt timestamp.
     */
    async deleteItem(itemId: number): Promise<void> {
        await db.readLater.update(itemId, { deletedAt: Date.now() });
        contractRegistry.notifyLocalMutation();
    }

    /**
     * Restores (un-deletes) a read later item record.
     */
    async restoreItem(itemOrId: ReadLaterItem | number): Promise<void> {
        if (typeof itemOrId === 'number') {
            await db.readLater.update(itemOrId, { deletedAt: undefined });
        } else {
            await db.readLater.put({ ...itemOrId, deletedAt: undefined });
        }
        contractRegistry.notifyLocalMutation();
    }

    /**
     * Restores (un-deletes) multiple read later item records inside an atomic transaction.
     */
    async restoreItems(itemsOrIds: (ReadLaterItem | number)[]): Promise<void> {
        await db.transaction('rw', db.readLater, async () => {
            for (const item of itemsOrIds) {
                if (typeof item === 'number') {
                    await db.readLater.update(item, { deletedAt: undefined });
                } else {
                    await db.readLater.put({ ...item, deletedAt: undefined });
                }
            }
        });
        contractRegistry.notifyLocalMutation();
    }

    /**
     * Query provider for useLiveQuery in ReadLaterList.
     * Excludes soft-deleted items.
     */
    getItemsByStatusQuery(status: ReadLaterItem['status']) {
        return () => db.readLater
            .where('status')
            .equals(status)
            .filter(item => !item.deletedAt)
            .reverse()
            .sortBy('addedAt');
    }

    /**
     * Query provider for unread count in ViewSwitcher.
     * Excludes soft-deleted items.
     */
    getUnreadCountQuery() {
        return () => db.readLater
            .where('status')
            .equals('unread')
            .filter(item => !item.deletedAt)
            .count();
    }

    /**
     * Fetches all active non-deleted read later items.
     */
    async getAllItems(): Promise<ReadLaterItem[]> {
        return db.readLater.filter(item => !item.deletedAt).toArray();
    }

    /**
     * Computes distinct domain hostnames from active items matching a given status.
     * Returns a sorted array of unique hostnames.
     */
    async getDistinctDomains(status: ReadLaterItem['status']): Promise<string[]> {
        const items = await db.readLater
            .where('status')
            .equals(status)
            .filter(item => !item.deletedAt)
            .toArray();
        const hosts = new Set<string>();
        for (const item of items) {
            try {
                hosts.add(new URL(item.url).hostname);
            } catch {
                // Skip malformed URLs
            }
        }
        return [...hosts].sort();
    }

    /**
     * Saves a Chrome tab to Read Later.
     * Guards against duplicate URLs already in the active queue (unread/read).
     * Defensively revives a tombstoned item if present and purges redundant tombstones.
     *
     * @returns The new or revived ReadLaterItem ID, or throws if duplicate active.
     */
    async addFromTab(tab: { url?: string; title?: string; favIconUrl?: string }): Promise<number> {
        const url = tab.url;
        if (!url) throw new Error('Cannot save a tab without a URL to Read Later.');

        const result = await db.transaction('rw', db.readLater, async () => {
            // 1. Check for existing active non-archived entries with the same URL
            const existingActive = await db.readLater
                .where('url')
                .equals(url)
                .filter(item => item.status !== 'archived' && !item.deletedAt)
                .first();

            if (existingActive) {
                throw new DuplicateReadLaterError(url);
            }

            // 2. Defensive Revival: Check for tombstoned items with identical URL
            const tombstonedItems = await db.readLater
                .where('url')
                .equals(url)
                .filter(item => !!item.deletedAt)
                .toArray();

            if (tombstonedItems.length > 0) {
                // Select at most one matching record to revive
                const primary = tombstonedItems[0];
                await db.readLater.update(primary.id!, {
                    title: tab.title || primary.title,
                    favicon: tab.favIconUrl || primary.favicon,
                    addedAt: Date.now(),
                    status: 'unread',
                    deletedAt: undefined,
                    updatedAt: Date.now(),
                });

                // Purge any redundant secondary tombstones with the same URL
                if (tombstonedItems.length > 1) {
                    const redundantIds = tombstonedItems
                        .slice(1)
                        .map(i => i.id!)
                        .filter(id => id !== undefined);
                    if (redundantIds.length > 0) {
                        await db.readLater.bulkDelete(redundantIds);
                    }
                }

                return primary.id!;
            }

            // 3. Fresh insert
            return await db.readLater.add({
                url,
                title: tab.title,
                favicon: tab.favIconUrl,
                addedAt: Date.now(),
                status: 'unread',
                updatedAt: Date.now(),
            });
        });
        contractRegistry.notifyLocalMutation();
        return result;
    }

    /**
     * Updates the status of a Read Later item.
     */
    async updateStatus(id: number, status: ReadLaterItem['status']): Promise<void> {
        await db.readLater.update(id, { status, updatedAt: Date.now() });
        contractRegistry.notifyLocalMutation();
    }

    /**
     * Marks all active unread items as archived inside an atomic transaction.
     */
    async archiveAllUnread(): Promise<number> {
        const unreadItems = await db.readLater
            .where('status')
            .equals('unread')
            .filter(item => !item.deletedAt)
            .toArray();
        if (unreadItems.length === 0) return 0;
        const now = Date.now();
        await db.transaction('rw', db.readLater, async () => {
            for (const item of unreadItems) {
                if (item.id) await db.readLater.update(item.id, { status: 'archived', updatedAt: now });
            }
        });
        contractRegistry.notifyLocalMutation();
        return unreadItems.length;
    }

    /**
     * Alias for archiveAllUnread.
     */
    async markAllAsRead(): Promise<number> {
        return this.archiveAllUnread();
    }

    /**
     * Clears (soft deletes) all archived items inside an atomic transaction.
     * Sets deletedAt timestamp on active archived items.
     * Returns the array of deleted item snapshots for undo recovery.
     */
    async clearAllArchived(): Promise<ReadLaterItem[]> {
        const archivedItems = await db.readLater
            .where('status')
            .equals('archived')
            .filter(item => !item.deletedAt)
            .toArray();
        if (archivedItems.length === 0) return [];

        const now = Date.now();
        await db.transaction('rw', db.readLater, async () => {
            for (const item of archivedItems) {
                if (item.id) {
                    await db.readLater.update(item.id, { deletedAt: now });
                    item.deletedAt = now;
                }
            }
        });
        contractRegistry.notifyLocalMutation();
        return archivedItems;
    }

    /**
     * Alias for clearAllArchived.
     */
    async clearAllRead(): Promise<ReadLaterItem[]> {
        return this.clearAllArchived();
    }

    /**
     * Migrates legacy/orphaned active items with status === 'read' to status === 'archived'.
     * Resolves ghost states blocking re-addition of URLs in the binary state machine.
     *
     * @returns Number of migrated records.
     */
    async migrateGhostStatesToArchive(): Promise<number> {
        const readItems = await db.readLater
            .where('status')
            .equals('read')
            .filter(item => !item.deletedAt)
            .toArray();
        if (readItems.length === 0) return 0;
        const ids = readItems.map(i => i.id!).filter(id => id !== undefined);
        await db.transaction('rw', db.readLater, async () => {
            for (const id of ids) {
                await db.readLater.update(id, { status: 'archived' });
            }
        });
        return ids.length;
    }
}

/**
 * Helper to execute ghost state migration on app/background startup.
 */
export const migrateGhostStatesToArchive = () => readLaterService.migrateGhostStatesToArchive();

/**
 * Thrown when a URL is already in Read Later (non-archived).
 */
export class DuplicateReadLaterError extends Error {
    constructor(public readonly url: string) {
        super(`"${url}" is already in Read Later.`);
        this.name = 'DuplicateReadLaterError';
    }
}

// Singleton Export
export const readLaterService = new ReadLaterService();
