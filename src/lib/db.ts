import Dexie, { type Table } from 'dexie';

export interface Space {
    id?: number;
    name: string;
    createdAt: number;
    deletedAt?: number; // Soft delete timestamp
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
    addedAt: number;
    status: 'unread' | 'read' | 'archived';
}

export class TabBellusDB extends Dexie {
    spaces!: Table<Space>;
    tabs!: Table<Tab>;
    readLater!: Table<ReadLaterItem>;

    constructor() {
        super('TabBellusDB');
        this.version(2).stores({
            spaces: '++id, name, createdAt, deletedAt',
            tabs: '++id, spaceId, url, order, [spaceId+order]',
            readLater: '++id, url, addedAt, status'
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
