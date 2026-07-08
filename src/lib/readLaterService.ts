import { db, type ReadLaterItem } from './db';

class ReadLaterService {
    /**
     * Retrieves a read later item by its ID.
     */
    async getItemById(itemId: number): Promise<ReadLaterItem | undefined> {
        return db.readLater.get(itemId);
    }

    /**
     * Deletes a read later item by its ID.
     */
    async deleteItem(itemId: number): Promise<void> {
        await db.readLater.delete(itemId);
    }

    /**
     * Restores (adds back) a read later item record.
     */
    async restoreItem(item: ReadLaterItem): Promise<void> {
        await db.readLater.add(item);
    }

    /**
     * Query provider for useLiveQuery in ReadLaterList.
     */
    getItemsByStatusQuery(status: ReadLaterItem['status']) {
        return () => db.readLater
            .where('status')
            .equals(status)
            .reverse()
            .sortBy('addedAt');
    }

    /**
     * Query provider for unread count in ViewSwitcher.
     */
    getUnreadCountQuery() {
        return () => db.readLater.where('status').equals('unread').count();
    }

    /**
     * Fetches all read later items.
     */
    async getAllItems(): Promise<ReadLaterItem[]> {
        return db.readLater.toArray();
    }
    /**
     * Saves a Chrome tab to Read Later.
     * Guards against duplicate URLs already in the queue (unread/read).
     *
     * @returns The new ReadLaterItem ID, or throws if duplicate.
     */
    async addFromTab(tab: { url?: string; title?: string; favIconUrl?: string }): Promise<number> {
        const url = tab.url;
        if (!url) throw new Error('Cannot save a tab without a URL to Read Later.');

        // Check for existing non-archived entries with the same URL
        const existing = await db.readLater
            .where('url')
            .equals(url)
            .and(item => item.status !== 'archived')
            .first();

        if (existing) {
            throw new DuplicateReadLaterError(url);
        }

        return db.readLater.add({
            url,
            title: tab.title,
            favicon: tab.favIconUrl,
            addedAt: Date.now(),
            status: 'unread',
        });
    }

    /**
     * Updates the status of a Read Later item.
     */
    async updateStatus(id: number, status: ReadLaterItem['status']): Promise<void> {
        await db.readLater.update(id, { status });
    }
}

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
