import { db, type Tab } from './db';

/**
 * Data Backup & Restore Service
 */
export const dataService = {
    /**
     * Export all spaces and read-later items to a JSON file.
     */
    async exportData(): Promise<void> {
        const spaces = await db.spaces.toArray();
        const tabs = await db.tabs.toArray();
        const readLater = await db.readLater.toArray();

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
     */
    async exportSpaceAsJson(spaceId: number): Promise<void> {
        const space = await db.spaces.get(spaceId);
        if (!space) {
            throw new Error(`Space with ID ${spaceId} not found`);
        }
        const tabs = await db.tabs.where('spaceId').equals(spaceId).toArray();

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
     * Import data from a JSON backup file.
     * Removes IDs to let Dexie auto-generate new ones.
     */
    async importData(file: File): Promise<{
        spacesImported: number;
        tabsImported: number;
        spacesCount: number;
        tabsCount: number;
        readLaterCount: number;
    }> {
        if (file.name && !file.name.toLowerCase().endsWith('.json')) {
            throw new Error('Invalid file format. Please upload a valid JSON backup file.');
        }

        let data: any;
        try {
            const text = await file.text();
            data = JSON.parse(text);
        } catch {
            throw new Error('Corrupt or malformed JSON. Could not parse backup file.');
        }

        if (!data || typeof data !== 'object') {
            throw new Error('Invalid backup file: Payload is not a valid JSON object.');
        }

        // Support both multi-space backups (data.spaces) and single-space exports (data.space)
        const spacesRaw = Array.isArray(data.spaces)
            ? data.spaces
            : (data.space && typeof data.space === 'object' ? [data.space] : []);

        if (spacesRaw.length === 0) {
            throw new Error('Invalid backup file: missing spaces data');
        }

        for (const s of spacesRaw) {
            if (!s || typeof s !== 'object' || typeof s.name !== 'string') {
                throw new Error('Invalid backup file: contains invalid space entries.');
            }
        }

        const tabsRaw = Array.isArray(data.tabs) ? data.tabs : [];
        for (const t of tabsRaw) {
            if (!t || typeof t !== 'object' || typeof t.url !== 'string') {
                throw new Error('Invalid backup file: contains invalid tab entries.');
            }
        }

        let spacesCount = 0;
        let tabsCount = 0;
        const readLaterCount = (Array.isArray(data.readLater) ? data.readLater : []).length;

        // Bulk add in transaction
        await db.transaction('rw', db.spaces, db.tabs, db.readLater, async () => {
            // 1. Import Spaces & Build ID Map
            const spaceIdMap = new Map<number, number>();

            for (const s of spacesRaw) {
                const { id: oldId, ...rest } = s;
                // Add space and get new ID
                const newId = await db.spaces.add(rest) as number;

                if (oldId) {
                    spaceIdMap.set(Number(oldId), newId);
                }
                spacesCount++;
            }

            // 2. Import Tabs (Remap spaceId)
            const tabsToImport: Tab[] = [];

            for (const t of tabsRaw) {
                const { id, spaceId, ...rest } = t;
                const newSpaceId = spaceIdMap.get(Number(spaceId));

                // Only import tab if we found its new parent space
                if (newSpaceId !== undefined) {
                    tabsToImport.push({
                        ...rest,
                        spaceId: newSpaceId,
                        order: (rest.order !== undefined) ? rest.order : 0
                    } as Tab);
                }
            }

            if (tabsToImport.length > 0) {
                await db.tabs.bulkAdd(tabsToImport);
                tabsCount = tabsToImport.length;
            }

            // 3. Import Read Later
            const readLaterRaw = Array.isArray(data.readLater) ? data.readLater : [];
            if (readLaterRaw.length > 0) {
                const readLaterToImport = readLaterRaw.map((r: any) => {
                    const { id, ...rest } = r;
                    return rest;
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
    },

    /**
     * Clear all application data.
     */
    async clearData(): Promise<void> {
        await db.transaction('rw', db.spaces, db.tabs, db.readLater, async () => {
            await db.spaces.clear();
            await db.tabs.clear();
            await db.readLater.clear();
        });
    },
};
