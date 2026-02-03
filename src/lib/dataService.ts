import { db } from './db';

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
     * Import data from a JSON backup file.
     * Removes IDs to let Dexie auto-generate new ones.
     */
    async importData(file: File): Promise<{ spacesCount: number; tabsCount: number; readLaterCount: number }> {
        const text = await file.text();
        const data = JSON.parse(text);

        // Basic validation
        if (!data.spaces || !Array.isArray(data.spaces)) {
            throw new Error('Invalid backup file: missing spaces array');
        }

        // Remove IDs to allow Dexie to auto-generate
        const spacesToImport = (data.spaces || []).map((s: Record<string, unknown>) => {
            const { id, ...rest } = s;
            return rest;
        });

        const tabsToImport = (data.tabs || []).map((t: Record<string, unknown>) => {
            const { id, ...rest } = t;
            return rest;
        });

        const readLaterToImport = (data.readLater || []).map((r: Record<string, unknown>) => {
            const { id, ...rest } = r;
            return rest;
        });

        // Bulk add in transaction
        await db.transaction('rw', db.spaces, db.tabs, db.readLater, async () => {
            if (spacesToImport.length > 0) {
                await db.spaces.bulkAdd(spacesToImport);
            }
            if (tabsToImport.length > 0) {
                await db.tabs.bulkAdd(tabsToImport);
            }
            if (readLaterToImport.length > 0) {
                await db.readLater.bulkAdd(readLaterToImport);
            }
        });

        return {
            spacesCount: spacesToImport.length,
            tabsCount: tabsToImport.length,
            readLaterCount: readLaterToImport.length,
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
