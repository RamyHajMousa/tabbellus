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
    deletedAt?: number; // Soft delete timestamp
}

export interface ReadLaterItem {
    id?: number;
    url: string;
    title?: string;
    favicon?: string;
    addedAt: number;
    status: 'unread' | 'read' | 'archived';
    deletedAt?: number; // Soft delete timestamp
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
            readLater: '++id, url, title, addedAt, status'
        });

        this.version(4).stores({
            spaces: '++id, name, createdAt, deletedAt, isPinned',
            tabs: '++id, spaceId, url, order, deletedAt, [spaceId+order]',
            readLater: '++id, url, title, addedAt, status, deletedAt'
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

    // Soft delete a tab
    async softDeleteTab(id: number) {
        return this.tabs.update(id, { deletedAt: Date.now() });
    }

    // Restore a soft-deleted tab
    async undoDeleteTab(id: number) {
        return this.tabs.update(id, { deletedAt: undefined });
    }

    // Soft delete a read later item
    async softDeleteReadLater(id: number) {
        return this.readLater.update(id, { deletedAt: Date.now() });
    }

    // Restore a soft-deleted read later item
    async undoDeleteReadLater(id: number) {
        return this.readLater.update(id, { deletedAt: undefined });
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
