import Dexie, { type Table } from 'dexie';

export interface Space {
    id?: number;
    name: string;
    createdAt: number;
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
        this.version(1).stores({
            spaces: '++id, name, createdAt',
            tabs: '++id, spaceId, url, order, [spaceId+order]',
            readLater: '++id, url, addedAt, status'
        });
    }
}

// Singleton Instance
export const db = new TabBellusDB();
