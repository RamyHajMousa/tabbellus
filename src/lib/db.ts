import Dexie, { type Table } from 'dexie';

export interface Space {
    id?: number;
    name: string;
    createdAt: number;
    deletedAt?: number; // Soft delete timestamp
    isPinned?: boolean;
    color?: string;
}

export interface Tab {
    id?: number;
    spaceId: number;
    url: string;
    title?: string;
    favicon?: string;
    order: number;
}

export interface ReadLaterItem {
    id?: number;
    url: string;
    title?: string;
    favicon?: string;
    addedAt: number;
    status: 'unread' | 'read' | 'archived';
}

export interface SpaceWithTabs {
    space: Space;
    tabs: Tab[];
}

export interface SavedTabResult {
    url: string;
    title?: string;
    favicon?: string;
    spaceNames: string[];
}

export class TabBellusDB extends Dexie {
    spaces!: Table<Space>;
    tabs!: Table<Tab>;
    readLater!: Table<ReadLaterItem>;

    constructor() {
        super('TabBellusDB');
        this.version(3).stores({
            spaces: '++id, name, createdAt, deletedAt, isPinned',
            tabs: '++id, spaceId, url, order, [spaceId+order]',
            readLater: '++id, url, title, addedAt, status' // Added title to index if useful for search, favicon not indexed usually
        }).upgrade(() => {
            // Optional: Migration logic if needed, but adding columns is usually safe in Dexie without explicit upgrade for purely new fields if not strictly typed in previous stores without default. 
            // Actually, simply defining the new schema version is enough for Dexie to handle the store update.
        });
    }

    // Soft delete a space
    async softDeleteSpace(id: number) {
        return this.spaces.update(id, { deletedAt: Date.now() });
    }

    // Restore a soft-deleted space
    async undoDeleteSpace(id: number) {
        return this.spaces.update(id, { deletedAt: undefined });
    }

    // Hard delete a space and its tabs
    async hardDeleteSpace(id: number) {
        return this.transaction('rw', this.spaces, this.tabs, async () => {
            await this.tabs.where({ spaceId: id }).delete();
            await this.spaces.delete(id);
        });
    }
}


// Singleton Instance
export const db = new TabBellusDB();
