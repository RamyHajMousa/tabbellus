import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tabService } from '../tabService';

describe('TabService - normalizeUrl', () => {
    it('should strip common tracking parameters', () => {
        const url = 'https://example.com/page?utm_source=twitter&utm_medium=social&gclid=12345&fbclid=abcdef&ref=home&other=keep';
        const normalized = tabService.normalizeUrl(url);
        expect(normalized).toBe('https://example.com/page?other=keep');
    });

    it('should strip trailing slash and lowercase URL', () => {
        const url = 'HTTPS://EXAMPLE.COM/Path/To/Page/';
        const normalized = tabService.normalizeUrl(url);
        expect(normalized).toBe('https://example.com/path/to/page');
    });

    it('should handle invalid URLs safely by trimming and lowercasing', () => {
        const url = '   NOT-A-VALID-URL/  ';
        const normalized = tabService.normalizeUrl(url);
        expect(normalized).toBe('not-a-valid-url');
    });
});

describe('TabService - calculateDuplicates', () => {
    it('should identify duplicate tabs prioritizing pinned then active then lowest index', () => {
        const tabs: chrome.tabs.Tab[] = [
            {
                id: 1,
                index: 0,
                pinned: false,
                active: false,
                url: 'https://example.com/page?utm_source=1',
                windowId: 1,
                highlighted: false,
                incognito: false,
                selected: false,
                discarded: false,
                autoDiscardable: true,
                groupId: -1,
            },
            {
                id: 2,
                index: 1,
                pinned: true,
                active: false,
                url: 'https://example.com/page?utm_source=2',
                windowId: 1,
                highlighted: false,
                incognito: false,
                selected: false,
                discarded: false,
                autoDiscardable: true,
                groupId: -1,
            },
            {
                id: 3,
                index: 2,
                pinned: false,
                active: true,
                url: 'https://example.com/page',
                windowId: 1,
                highlighted: false,
                incognito: false,
                selected: false,
                discarded: false,
                autoDiscardable: true,
                groupId: -1,
            },
        ];

        const { duplicates, retained } = tabService.calculateDuplicates(tabs);

        expect(retained).toHaveLength(1);
        expect(retained[0].id).toBe(2); // Pinned tab wins over active and index

        expect(duplicates).toHaveLength(2);
        expect(duplicates.map(t => t.id)).toEqual([3, 1]); // Active (id: 3) comes before non-active (id: 1)
    });

    it('should ignore chrome:// and about: URLs in duplicate calculation', () => {
        const tabs: chrome.tabs.Tab[] = [
            {
                id: 1,
                index: 0,
                pinned: false,
                active: false,
                url: 'chrome://settings',
                windowId: 1,
                highlighted: false,
                incognito: false,
                selected: false,
                discarded: false,
                autoDiscardable: true,
                groupId: -1,
            },
            {
                id: 2,
                index: 1,
                pinned: false,
                active: false,
                url: 'chrome://settings',
                windowId: 1,
                highlighted: false,
                incognito: false,
                selected: false,
                discarded: false,
                autoDiscardable: true,
                groupId: -1,
            }
        ];

        const { duplicates, retained } = tabService.calculateDuplicates(tabs);
        expect(duplicates).toHaveLength(0);
        expect(retained).toHaveLength(0);
    });
});

describe('TabService - focusOrCreate', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // Setup chrome API mocks on global
        (globalThis as any).chrome = {
            tabs: {
                query: vi.fn(),
                update: vi.fn(),
                create: vi.fn(),
            },
            windows: {
                update: vi.fn(),
            },
        };
    });

    it('should focus existing tab and window when a matching URL is found', async () => {
        const mockTabs = [
            { id: 10, windowId: 100, url: 'https://example.com/dashboard?utm_source=email' }
        ];

        vi.mocked(chrome.tabs.query).mockResolvedValue(mockTabs as any);
        vi.mocked(chrome.windows.update).mockResolvedValue({ id: 100 } as any);
        vi.mocked(chrome.tabs.update).mockResolvedValue({ id: 10, windowId: 100 } as any);

        const result = await tabService.focusOrCreate('https://example.com/dashboard');

        expect(chrome.windows.update).toHaveBeenCalledWith(100, { focused: true });
        expect(chrome.tabs.update).toHaveBeenCalledWith(10, { active: true });
        expect(result).toEqual({
            action: 'focused',
            tabId: 10,
            windowId: 100,
        });
    });

    it('should create a new tab when no matching URL is found', async () => {
        vi.mocked(chrome.tabs.query).mockResolvedValue([
            { id: 10, windowId: 100, url: 'https://other.com' }
        ] as any);
        vi.mocked(chrome.tabs.create).mockResolvedValue({ id: 25, windowId: 100 } as any);

        const result = await tabService.focusOrCreate('https://example.com/new-page');

        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com/new-page' });
        expect(result).toEqual({
            action: 'created',
            tabId: 25,
            windowId: 100,
        });
    });

    it('should return undefined if empty url provided', async () => {
        const result = await tabService.focusOrCreate('');
        expect(result).toBeUndefined();
    });
});
