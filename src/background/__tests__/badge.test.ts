import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateGlobalBadge } from '@/background/badgeService';
import { db } from '@/lib/db';

describe('Background Badge Service — updateGlobalBadge', () => {
    const setBadgeTextMock = vi.fn();
    const setBadgeBackgroundColorMock = vi.fn();
    const queryTabsMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup chrome API mocks
        (globalThis as any).chrome = {
            storage: {
                local: {
                    get: vi.fn(),
                },
            },
            action: {
                setBadgeText: setBadgeTextMock,
                setBadgeBackgroundColor: setBadgeBackgroundColorMock,
            },
            tabs: {
                query: queryTabsMock,
            },
        };
    });

    it('should set badge to empty string when badgeMode is none', async () => {
        (globalThis as any).chrome.storage.local.get.mockResolvedValue({
            'tabbellus-settings': JSON.stringify({
                state: {
                    settings: {
                        badgeMode: 'none',
                    },
                },
            }),
        });

        await updateGlobalBadge();

        expect(setBadgeBackgroundColorMock).toHaveBeenCalledWith({ color: '#27272a' });
        expect(setBadgeTextMock).toHaveBeenCalledWith({ text: '' });
    });

    it('should set badge to tab count when badgeMode is tabs', async () => {
        (globalThis as any).chrome.storage.local.get.mockResolvedValue({
            'tabbellus-settings': JSON.stringify({
                state: {
                    settings: {
                        badgeMode: 'tabs',
                    },
                },
            }),
        });
        queryTabsMock.mockResolvedValue([
            { id: 1, url: 'https://example.com' },
            { id: 2, url: 'https://google.com' },
            { id: 3, url: 'https://github.com' },
        ]);

        await updateGlobalBadge();

        expect(setBadgeBackgroundColorMock).toHaveBeenCalledWith({ color: '#27272a' });
        expect(setBadgeTextMock).toHaveBeenCalledWith({ text: '3' });
    });

    it('should set badge to unread count when badgeMode is read-later', async () => {
        (globalThis as any).chrome.storage.local.get.mockResolvedValue({
            'tabbellus-settings': JSON.stringify({
                state: {
                    settings: {
                        badgeMode: 'read-later',
                    },
                },
            }),
        });

        await db.readLater.bulkAdd([
            { url: 'https://item1.com', title: 'Item 1', status: 'unread', addedAt: Date.now() },
            { url: 'https://item2.com', title: 'Item 2', status: 'unread', addedAt: Date.now() },
            { url: 'https://item3.com', title: 'Item 3', status: 'archived', addedAt: Date.now() },
        ]);

        await updateGlobalBadge();

        expect(setBadgeBackgroundColorMock).toHaveBeenCalledWith({ color: '#27272a' });
        expect(setBadgeTextMock).toHaveBeenCalledWith({ text: '2' });
    });
});
