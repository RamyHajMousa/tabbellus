import Dexie, { type Table } from 'dexie';

export interface Space {
    id?: number;
    uuid?: string;
    name: string;
    createdAt: number;
    updatedAt?: number;
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
    createdAt?: number;
    updatedAt?: number;
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
    updatedAt?: number; // LWW status mutation timestamp
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

        this.version(5).stores({
            spaces: '++id, &uuid, name, createdAt, updatedAt, deletedAt',
            tabs: '++id, spaceId, url, order, deletedAt, [spaceId+order]',
            readLater: '++id, url, title, addedAt, status, deletedAt'
        }).upgrade(async (tx) => {
            // Populate missing UUIDs and timestamps for existing spaces
            await tx.table('spaces').toCollection().modify((space: Space) => {
                if (!space.uuid) space.uuid = crypto.randomUUID();
                if (!space.updatedAt) space.updatedAt = space.createdAt || Date.now();
            });
            // Populate missing timestamps for existing tabs
            await tx.table('tabs').toCollection().modify((tab: Tab) => {
                if (!tab.createdAt) tab.createdAt = Date.now();
                if (!tab.updatedAt) tab.updatedAt = Date.now();
            });
        });
    }

    // Soft delete a space
    async softDeleteSpace(id: number) {
        return this.spaces.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
    }

    // Restore a soft-deleted space
    async undoDeleteSpace(id: number) {
        return this.spaces.update(id, { deletedAt: undefined, updatedAt: Date.now() });
    }

    // Soft delete a tab
    async softDeleteTab(id: number) {
        return this.tabs.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
    }

    // Restore a soft-deleted tab
    async undoDeleteTab(id: number) {
        return this.tabs.update(id, { deletedAt: undefined, updatedAt: Date.now() });
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
