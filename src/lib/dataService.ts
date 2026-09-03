import { db, type Tab, type Space, type ReadLaterItem } from './db';

/**
 * Base custom error for backup operations.
 */
export class BackupError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BackupError';
    }
}

export class InvalidBackupFormatError extends BackupError {
    constructor(message: string = 'Invalid file format. Please upload a valid JSON backup file.') {
        super(message);
        this.name = 'InvalidBackupFormatError';
    }
}

export class CorruptBackupJsonError extends BackupError {
    constructor(message: string = 'Corrupt or malformed JSON. Could not parse backup file.') {
        super(message);
        this.name = 'CorruptBackupJsonError';
    }
}

export class BackupValidationError extends BackupError {
    constructor(message: string) {
        super(message);
        this.name = 'BackupValidationError';
    }
}

export interface ImportResult {
    spacesImported: number;
    tabsImported: number;
    spacesCount: number;
    tabsCount: number;
    readLaterCount: number;
}

/**
 * Data Backup & Restore Service
 */
export const dataService = {
    /**
     * Export all spaces and read-later items to a JSON file.
     * Sanitizes export by excluding soft-deleted records.
     */
    async exportData(): Promise<void> {
        const spaces = await db.spaces.filter(s => !s.deletedAt).toArray();
        const tabs = await db.tabs.filter(t => !t.deletedAt).toArray();
        const readLater = await db.readLater.filter(r => !r.deletedAt).toArray();

        const backup = {
            version: 1,
            date: new Date().toISOString(),
            spaces,
            tabs,
            readLater,
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `tabbellus-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Export a single space and its tabs to a JSON file.
     * Sanitizes export by excluding soft-deleted records.
     */
    async exportSpaceAsJson(spaceId: number): Promise<void> {
        const space = await db.spaces.get(spaceId);
        if (!space || space.deletedAt) {
            throw new Error(`Space with ID ${spaceId} not found`);
        }
        const tabs = await db.tabs.where('spaceId').equals(spaceId).filter(t => !t.deletedAt).toArray();

        const backup = {
            version: 1,
            date: new Date().toISOString(),
            space,
            tabs,
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeSpaceName = space.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.href = url;
        a.download = `tabbellus-space-${safeSpaceName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Import data from a JSON backup file with deep validation and safe foreign-key remapping.
     * Removes IDs to let Dexie auto-generate new auto-increment keys.
     */
    async importData(file: File): Promise<ImportResult> {
        if (file.name && !file.name.toLowerCase().endsWith('.json')) {
            throw new InvalidBackupFormatError('Invalid file format. Please upload a valid JSON backup file.');
        }

        let data: any;
        try {
            const text = await file.text();
            data = JSON.parse(text);
        } catch {
            throw new CorruptBackupJsonError('Corrupt or malformed JSON. Could not parse backup file.');
        }

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new BackupValidationError('Invalid backup file: Payload is not a valid JSON object.');
        }

        // Support both multi-space backups (data.spaces) and single-space exports (data.space)
        const isSingleSpace = Boolean(data.space && typeof data.space === 'object');
        const spacesRaw: any[] = Array.isArray(data.spaces)
            ? data.spaces
            : (isSingleSpace ? [data.space] : []);

        if (spacesRaw.length === 0) {
            throw new BackupValidationError('Invalid backup file: missing spaces data.');
        }

        // Validate Spaces structure
        for (const s of spacesRaw) {
            if (!s || typeof s !== 'object' || typeof s.name !== 'string' || !s.name.trim()) {
                throw new BackupValidationError('Invalid backup file: contains invalid space entries.');
            }
        }

        // Validate Tabs structure
        const tabsRaw: any[] = Array.isArray(data.tabs) ? data.tabs : [];
        for (const t of tabsRaw) {
            if (!t || typeof t !== 'object' || typeof t.url !== 'string' || !t.url.trim()) {
                throw new BackupValidationError('Invalid backup file: contains invalid tab entries.');
            }
        }

        // Validate Read Later structure
        const readLaterRaw: any[] = Array.isArray(data.readLater) ? data.readLater : [];
        const validStatuses = new Set(['unread', 'read', 'archived']);
        for (const r of readLaterRaw) {
            if (!r || typeof r !== 'object' || typeof r.url !== 'string' || !r.url.trim()) {
                throw new BackupValidationError('Invalid backup file: contains invalid read-later entries.');
            }
            if (r.status && !validStatuses.has(r.status)) {
                r.status = 'unread'; // Fallback to safe default
            }
        }

        let spacesCount = 0;
        let tabsCount = 0;
        const readLaterCount = readLaterRaw.length;

        try {
            // Bulk add in an atomic transaction
            await db.transaction('rw', db.spaces, db.tabs, db.readLater, async () => {
                // 1. Import Spaces & Build ID Map
                const spaceIdMap = new Map<number, number>();

                for (const s of spacesRaw) {
                    const { id: oldId, ...rest } = s;
                    const spaceToInsert: Space = {
                        name: rest.name.trim(),
                        createdAt: typeof rest.createdAt === 'number' ? rest.createdAt : Date.now(),
                        ...(rest.color ? { color: rest.color } : {}),
                        ...(rest.isPinned ? { isPinned: true } : {}),
                        ...(rest.deletedAt ? { deletedAt: rest.deletedAt } : {}),
                    };

                    const newId = (await db.spaces.add(spaceToInsert)) as number;

                    if (oldId !== undefined) {
                        spaceIdMap.set(Number(oldId), newId);
                    }
                    spacesCount++;
                }

                // 2. Import Tabs (Remap spaceId foreign key)
                const tabsToImport: Tab[] = [];

                for (const t of tabsRaw) {
                    const { id, spaceId, ...rest } = t;
                    let targetSpaceId: number | undefined;

                    if (isSingleSpace && spacesCount === 1) {
                        // For single-space exports, map all tabs to the newly inserted space
                        targetSpaceId = Array.from(spaceIdMap.values())[0] || (await db.spaces.toCollection().last())?.id;
                    } else if (spaceId !== undefined) {
                        targetSpaceId = spaceIdMap.get(Number(spaceId));
                    }

                    // Only import tab if we successfully resolved its parent space
                    if (targetSpaceId !== undefined) {
                        tabsToImport.push({
                            spaceId: targetSpaceId,
                            url: rest.url.trim(),
                            title: typeof rest.title === 'string' ? rest.title : 'Untitled',
                            ...(rest.favicon ? { favicon: rest.favicon } : {}),
                            order: typeof rest.order === 'number' ? rest.order : tabsToImport.length,
                        });
                    }
                }

                if (tabsToImport.length > 0) {
                    await db.tabs.bulkAdd(tabsToImport);
                    tabsCount = tabsToImport.length;
                }

                // 3. Import Read Later
                if (readLaterRaw.length > 0) {
                    const readLaterToImport: ReadLaterItem[] = readLaterRaw.map((r: any) => {
                        const { id, ...rest } = r;
                        return {
                            url: rest.url.trim(),
                            title: typeof rest.title === 'string' ? rest.title : undefined,
                            ...(rest.favicon ? { favicon: rest.favicon } : {}),
                            addedAt: typeof rest.addedAt === 'number' ? rest.addedAt : Date.now(),
                            status: validStatuses.has(rest.status) ? rest.status : 'unread',
                        };
                    });
                    await db.readLater.bulkAdd(readLaterToImport);
                }
            });

            return {
                spacesImported: spacesCount,
                tabsImported: tabsCount,
                spacesCount,
                tabsCount,
                readLaterCount,
            };
        } catch (error: any) {
            console.error('DataService: Import transaction failed:', error);
            if (error.name === 'QuotaExceededError') {
                throw new BackupError('Storage quota exceeded. Please free up browser storage space.');
            }
            if (error instanceof BackupError) {
                throw error;
            }
            throw new BackupError(error instanceof Error ? error.message : 'Database error during backup import.');
        }
    },

    /**
     * Clear all application data in an atomic transaction.
     */
    async clearData(): Promise<void> {
        await db.transaction('rw', db.spaces, db.tabs, db.readLater, async () => {
            await db.spaces.clear();
            await db.tabs.clear();
            await db.readLater.clear();
        });
    },
};
