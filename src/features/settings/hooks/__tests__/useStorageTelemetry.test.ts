import { describe, it, expect, beforeEach } from 'vitest';
import { formatBytes } from '../useStorageTelemetry';
import { db } from '@/lib/db';

describe('useStorageTelemetry', () => {
    describe('formatBytes helper', () => {
        it('should handle undefined, zero, or negative byte numbers gracefully', () => {
            expect(formatBytes(undefined)).toBe('< 1 KB');
            expect(formatBytes(0)).toBe('< 1 KB');
            expect(formatBytes(-100)).toBe('< 1 KB');
            expect(formatBytes(NaN)).toBe('< 1 KB');
        });

        it('should format bytes under 1 KB', () => {
            expect(formatBytes(512)).toBe('512 B');
        });

        it('should format bytes in KB range', () => {
            expect(formatBytes(1024)).toBe('1.0 KB');
            expect(formatBytes(1536)).toBe('1.5 KB');
            expect(formatBytes(100 * 1024)).toBe('100.0 KB');
        });

        it('should format bytes in MB range', () => {
            expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
            expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.50 MB');
        });
    });

    describe('db telemetry counts verification', () => {
        beforeEach(async () => {
            await db.spaces.clear();
            await db.tabs.clear();
            await db.readLater.clear();
        });

        it('should reflect accurate Dexie database record counts', async () => {
            await db.spaces.add({ name: 'Space 1', createdAt: Date.now() });
            await db.spaces.add({ name: 'Space 2', createdAt: Date.now() });

            await db.tabs.add({ spaceId: 1, url: 'https://example.com', order: 0 });
            await db.tabs.add({ spaceId: 1, url: 'https://github.com', order: 1 });
            await db.tabs.add({ spaceId: 2, url: 'https://google.com', order: 0 });

            await db.readLater.add({
                url: 'https://news.ycombinator.com',
                title: 'Hacker News',
                addedAt: Date.now(),
                status: 'unread'
            });

            const [spacesCount, tabsCount, readLaterCount] = await Promise.all([
                db.spaces.count(),
                db.tabs.count(),
                db.readLater.count(),
            ]);

            expect(spacesCount).toBe(2);
            expect(tabsCount).toBe(3);
            expect(readLaterCount).toBe(1);
        });
    });
});
