import { describe, it, expect } from 'vitest';
import {
    isTabEligibleForDiscard,
    getDiscardCandidates,
    isInternalOrUnsupportedUrl,
    type EvaluatableTab,
} from '@/background/discardService';

describe('DiscardService — isInternalOrUnsupportedUrl', () => {
    it('should return true for empty or undefined URLs', () => {
        expect(isInternalOrUnsupportedUrl(undefined)).toBe(true);
        expect(isInternalOrUnsupportedUrl('')).toBe(true);
    });

    it('should return true for internal browser URL schemes', () => {
        expect(isInternalOrUnsupportedUrl('chrome://settings')).toBe(true);
        expect(isInternalOrUnsupportedUrl('chrome://extensions')).toBe(true);
        expect(isInternalOrUnsupportedUrl('edge://flags')).toBe(true);
        expect(isInternalOrUnsupportedUrl('about:blank')).toBe(true);
        expect(isInternalOrUnsupportedUrl('chrome-extension://abcdefg/popup.html')).toBe(true);
        expect(isInternalOrUnsupportedUrl('devtools://devtools/bundled/devtools_app.html')).toBe(true);
        expect(isInternalOrUnsupportedUrl('view-source:https://google.com')).toBe(true);
        expect(isInternalOrUnsupportedUrl('javascript:void(0)')).toBe(true);
    });

    it('should return false for valid web URLs', () => {
        expect(isInternalOrUnsupportedUrl('https://github.com')).toBe(false);
        expect(isInternalOrUnsupportedUrl('http://localhost:3000')).toBe(false);
        expect(isInternalOrUnsupportedUrl('https://news.ycombinator.com/item?id=123')).toBe(false);
    });
});

describe('DiscardService — isTabEligibleForDiscard', () => {
    const NOW = 1700000000000; // Fixed timestamp reference
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    const createMockTab = (overrides: Partial<EvaluatableTab> = {}): EvaluatableTab => ({
        id: 101,
        index: 0,
        pinned: false,
        active: false,
        audible: false,
        discarded: false,
        autoDiscardable: true,
        highlighted: false,
        incognito: false,
        selected: false,
        groupId: -1,
        windowId: 1,
        url: 'https://example.com/article',
        title: 'Example Article',
        lastAccessed: NOW - THIRTY_MINUTES_MS, // 30 mins ago
        ...overrides,
    });

    it('should return false if intervalMinutes is 0 or negative (automation disabled)', () => {
        const tab = createMockTab();
        expect(isTabEligibleForDiscard(tab, 0, [], NOW)).toBe(false);
        expect(isTabEligibleForDiscard(tab, -15, [], NOW)).toBe(false);
    });

    it('should return false if tab is active', () => {
        const tab = createMockTab({ active: true });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return false if tab is pinned', () => {
        const tab = createMockTab({ pinned: true });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return false if tab is audible (playing sound / media)', () => {
        const tab = createMockTab({ audible: true });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return false if tab is already discarded', () => {
        const tab = createMockTab({ discarded: true });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return false if tab id is undefined', () => {
        const tab = createMockTab({ id: undefined });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return false if tab is locked in tabLockStore', () => {
        const tab = createMockTab({ id: 202 });
        expect(isTabEligibleForDiscard(tab, 15, [202], NOW)).toBe(false);
    });

    it('should return false for internal browser URLs', () => {
        const tab = createMockTab({ url: 'chrome://extensions' });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return false if tab inactivity is below the interval threshold', () => {
        // Tab accessed 10 mins ago with a 15 min threshold
        const tab = createMockTab({ lastAccessed: NOW - 10 * 60 * 1000 });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(false);
    });

    it('should return true if tab satisfies all criteria and elapsed time meets interval threshold', () => {
        // Tab accessed 20 mins ago with a 15 min threshold
        const tab = createMockTab({ lastAccessed: NOW - 20 * 60 * 1000 });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(true);
    });

    it('should return true when lastAccessed is undefined (treated as 0 elapsed delta)', () => {
        const tab = createMockTab({ lastAccessed: undefined });
        expect(isTabEligibleForDiscard(tab, 15, [], NOW)).toBe(true);
    });
});

describe('DiscardService — getDiscardCandidates', () => {
    const NOW = 1700000000000;

    it('should return an empty array if interval is 0', () => {
        const tabs: EvaluatableTab[] = [
            {
                id: 1,
                index: 0,
                pinned: false,
                active: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                highlighted: false,
                incognito: false,
                selected: false,
                groupId: -1,
                windowId: 1,
                url: 'https://example.com/1',
                lastAccessed: NOW - 60 * 60 * 1000,
            },
        ];
        expect(getDiscardCandidates(tabs, 0, [], NOW)).toEqual([]);
    });

    it('should filter candidate tabs properly against all criteria in batch', () => {
        const tabs: EvaluatableTab[] = [
            // 1. Eligible (inactive 45m, 15m threshold)
            {
                id: 1,
                index: 0,
                pinned: false,
                active: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                highlighted: false,
                incognito: false,
                selected: false,
                groupId: -1,
                windowId: 1,
                url: 'https://example.com/1',
                lastAccessed: NOW - 45 * 60 * 1000,
            },
            // 2. Ineligible (Active)
            {
                id: 2,
                index: 1,
                pinned: false,
                active: true,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                highlighted: false,
                incognito: false,
                selected: false,
                groupId: -1,
                windowId: 1,
                url: 'https://example.com/2',
                lastAccessed: NOW - 45 * 60 * 1000,
            },
            // 3. Ineligible (Locked)
            {
                id: 3,
                index: 2,
                pinned: false,
                active: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                highlighted: false,
                incognito: false,
                selected: false,
                groupId: -1,
                windowId: 1,
                url: 'https://example.com/3',
                lastAccessed: NOW - 45 * 60 * 1000,
            },
            // 4. Ineligible (Recently Accessed — 5m ago)
            {
                id: 4,
                index: 3,
                pinned: false,
                active: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                highlighted: false,
                incognito: false,
                selected: false,
                groupId: -1,
                windowId: 1,
                url: 'https://example.com/4',
                lastAccessed: NOW - 5 * 60 * 1000,
            },
            // 5. Eligible (inactive 30m, 15m threshold)
            {
                id: 5,
                index: 4,
                pinned: false,
                active: false,
                audible: false,
                discarded: false,
                autoDiscardable: true,
                highlighted: false,
                incognito: false,
                selected: false,
                groupId: -1,
                windowId: 1,
                url: 'https://example.com/5',
                lastAccessed: NOW - 30 * 60 * 1000,
            },
        ];

        const lockedTabIds = [3];
        const candidates = getDiscardCandidates(tabs, 15, lockedTabIds, NOW);

        expect(candidates.map((t) => t.id)).toEqual([1, 5]);
    });
});
