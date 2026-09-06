import { describe, it, expect } from 'vitest';
import { evaluateCandidateFilters, evaluateFilterDirective } from '../filterEvaluator';
import type {
    TabSearchResult,
    SpaceSearchResult,
    SavedTabSearchResult,
    ReadLaterSearchResult,
    BookmarkSearchResult,
} from '../../types';

describe('filterEvaluator (Assertive Predicate Filter Engine)', () => {
    const mockTab: TabSearchResult = {
        type: 'tab',
        id: 101,
        title: 'TabBellus GitHub Repo',
        url: 'https://github.com/RamyHajMousa/tabbellus',
        windowId: 1,
        isCurrentWindow: true,
        audible: true,
        muted: false,
        discarded: false,
        pinned: true,
        createdAt: 1725500000000,
    };

    const mockSpace: SpaceSearchResult = {
        type: 'space',
        id: 1,
        name: 'Work Space Alpha',
        tabCount: 5,
        isPinned: true,
        createdAt: 1725000000000,
    };

    const mockSavedTab: SavedTabSearchResult = {
        type: 'saved-tab',
        id: 201,
        spaceId: 1,
        spaceName: 'Work Space Alpha',
        spaceNames: ['Work Space Alpha'],
        title: 'Project Roadmap',
        url: 'https://notion.so/roadmap',
        createdAt: 1725100000000,
    };

    const mockReadLater: ReadLaterSearchResult = {
        type: 'read-later',
        id: 301,
        title: 'React 19 Architecture',
        url: 'https://react.dev/blog/react-19',
        status: 'unread',
        addedAt: 1725300000000,
    };

    const mockBookmark: BookmarkSearchResult = {
        type: 'bookmark',
        id: 'bm-1',
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/en-US/',
        dateAdded: 1724000000000,
    };

    describe('domain: and site: matching', () => {
        it('matches candidate host directly and strips www', () => {
            const tabWithWww: TabSearchResult = {
                ...mockTab,
                url: 'https://www.youtube.com/watch?v=123',
            };

            expect(
                evaluateFilterDirective(tabWithWww, {
                    key: 'domain',
                    value: 'youtube.com',
                    negated: false,
                    rawToken: 'domain:youtube.com',
                })
            ).toBe(true);

            expect(
                evaluateFilterDirective(tabWithWww, {
                    key: 'site',
                    value: 'youtube.com',
                    negated: false,
                    rawToken: 'site:youtube.com',
                })
            ).toBe(true);
        });

        it('matches subdomain targets', () => {
            const tabWithSubdomain: TabSearchResult = {
                ...mockTab,
                url: 'https://gist.github.com/user/123',
            };

            expect(
                evaluateFilterDirective(tabWithSubdomain, {
                    key: 'domain',
                    value: 'github.com',
                    negated: false,
                    rawToken: 'domain:github.com',
                })
            ).toBe(true);
        });

        it('strictly returns false for positive domain filter on candidates without a URL (e.g. Space)', () => {
            expect(
                evaluateFilterDirective(mockSpace, {
                    key: 'domain',
                    value: 'github.com',
                    negated: false,
                    rawToken: 'domain:github.com',
                })
            ).toBe(false);

            // Negation passes because space does not have that domain
            expect(
                evaluateFilterDirective(mockSpace, {
                    key: 'domain',
                    value: 'github.com',
                    negated: true,
                    rawToken: '-domain:github.com',
                })
            ).toBe(true);
        });

        it('returns false when host does not match', () => {
            expect(
                evaluateFilterDirective(mockTab, {
                    key: 'domain',
                    value: 'google.com',
                    negated: false,
                    rawToken: 'domain:google.com',
                })
            ).toBe(false);
        });
    });

    describe('in: scope and space matching', () => {
        it('in:active matches open tabs only', () => {
            const directive = {
                key: 'in' as const,
                value: 'active',
                negated: false,
                rawToken: 'in:active',
            };
            expect(evaluateFilterDirective(mockTab, directive)).toBe(true);
            expect(evaluateFilterDirective(mockSpace, directive)).toBe(false);
            expect(evaluateFilterDirective(mockSavedTab, directive)).toBe(false);
            expect(evaluateFilterDirective(mockReadLater, directive)).toBe(false);
            expect(evaluateFilterDirective(mockBookmark, directive)).toBe(false);
        });

        it('in:spaces matches saved spaces and saved tabs', () => {
            const directive = {
                key: 'in' as const,
                value: 'spaces',
                negated: false,
                rawToken: 'in:spaces',
            };
            expect(evaluateFilterDirective(mockTab, directive)).toBe(false);
            expect(evaluateFilterDirective(mockSpace, directive)).toBe(true);
            expect(evaluateFilterDirective(mockSavedTab, directive)).toBe(true);
            expect(evaluateFilterDirective(mockReadLater, directive)).toBe(false);
            expect(evaluateFilterDirective(mockBookmark, directive)).toBe(false);
        });

        it('in:readlater strictly matches read later items only and excludes others', () => {
            const directive = {
                key: 'in' as const,
                value: 'readlater',
                negated: false,
                rawToken: 'in:readlater',
            };
            expect(evaluateFilterDirective(mockReadLater, directive)).toBe(true);
            expect(evaluateFilterDirective(mockTab, directive)).toBe(false);
            expect(evaluateFilterDirective(mockSpace, directive)).toBe(false);
            expect(evaluateFilterDirective(mockSavedTab, directive)).toBe(false);
            expect(evaluateFilterDirective(mockBookmark, directive)).toBe(false);

            // Negated in:readlater inverts correctly
            const negatedDirective = {
                key: 'in' as const,
                value: 'readlater',
                negated: true,
                rawToken: '-in:readlater',
            };
            expect(evaluateFilterDirective(mockReadLater, negatedDirective)).toBe(false);
            expect(evaluateFilterDirective(mockTab, negatedDirective)).toBe(true);
            expect(evaluateFilterDirective(mockBookmark, negatedDirective)).toBe(true);
        });

        it('in:bookmarks matches bookmarks only', () => {
            const directive = {
                key: 'in' as const,
                value: 'bookmarks',
                negated: false,
                rawToken: 'in:bookmarks',
            };
            expect(evaluateFilterDirective(mockBookmark, directive)).toBe(true);
            expect(evaluateFilterDirective(mockTab, directive)).toBe(false);
            expect(evaluateFilterDirective(mockSpace, directive)).toBe(false);
        });

        it('matches custom space names case-insensitively', () => {
            const directive = {
                key: 'in' as const,
                value: 'work space',
                negated: false,
                rawToken: 'in:"work space"',
            };
            expect(evaluateFilterDirective(mockSpace, directive)).toBe(true);
            expect(evaluateFilterDirective(mockSavedTab, directive)).toBe(true);
            expect(evaluateFilterDirective(mockTab, directive)).toBe(false);
            expect(evaluateFilterDirective(mockBookmark, directive)).toBe(false);
        });
    });

    describe('is: state predicates and domain capability', () => {
        it('is:audible strictly matches audible tabs and returns false for bookmarks, read later, and spaces', () => {
            const audibleDir = { key: 'is' as const, value: 'audible', negated: false, rawToken: 'is:audible' };
            const mutedDir = { key: 'is' as const, value: 'muted', negated: false, rawToken: 'is:muted' };

            expect(evaluateFilterDirective(mockTab, audibleDir)).toBe(true);
            expect(evaluateFilterDirective(mockTab, mutedDir)).toBe(false);

            // Positive assertion: Non-tabs MUST return false
            expect(evaluateFilterDirective(mockBookmark, audibleDir)).toBe(false);
            expect(evaluateFilterDirective(mockSpace, audibleDir)).toBe(false);
            expect(evaluateFilterDirective(mockReadLater, audibleDir)).toBe(false);
            expect(evaluateFilterDirective(mockSavedTab, audibleDir)).toBe(false);

            // Negation: Non-tabs do not have audio, so they pass -is:audible
            const notAudibleDir = { key: 'is' as const, value: 'audible', negated: true, rawToken: '-is:audible' };
            expect(evaluateFilterDirective(mockBookmark, notAudibleDir)).toBe(true);
            expect(evaluateFilterDirective(mockSpace, notAudibleDir)).toBe(true);
            expect(evaluateFilterDirective(mockReadLater, notAudibleDir)).toBe(true);
            expect(evaluateFilterDirective(mockTab, notAudibleDir)).toBe(false); // mockTab IS audible
        });

        it('is:discarded and is:suspended strictly require open tab capability', () => {
            const discardedTab: TabSearchResult = { ...mockTab, discarded: true };
            const dir = { key: 'is' as const, value: 'discarded', negated: false, rawToken: 'is:discarded' };
            const dirSuspended = { key: 'is' as const, value: 'suspended', negated: false, rawToken: 'is:suspended' };

            expect(evaluateFilterDirective(discardedTab, dir)).toBe(true);
            expect(evaluateFilterDirective(discardedTab, dirSuspended)).toBe(true);
            expect(evaluateFilterDirective(mockTab, dir)).toBe(false); // mockTab is not discarded

            // Positive assertion must return false for non-tabs
            expect(evaluateFilterDirective(mockReadLater, dir)).toBe(false);
            expect(evaluateFilterDirective(mockBookmark, dir)).toBe(false);
            expect(evaluateFilterDirective(mockSpace, dir)).toBe(false);

            // Negation passes for non-tabs
            const notDiscarded = { key: 'is' as const, value: 'discarded', negated: true, rawToken: '-is:discarded' };
            expect(evaluateFilterDirective(mockReadLater, notDiscarded)).toBe(true);
            expect(evaluateFilterDirective(mockBookmark, notDiscarded)).toBe(true);
        });

        it('is:pinned returns true ONLY for pinned tabs and pinned spaces', () => {
            const dir = { key: 'is' as const, value: 'pinned', negated: false, rawToken: 'is:pinned' };
            expect(evaluateFilterDirective(mockTab, dir)).toBe(true);
            expect(evaluateFilterDirective(mockSpace, dir)).toBe(true);

            const unpinnedSpace: SpaceSearchResult = { ...mockSpace, isPinned: false };
            expect(evaluateFilterDirective(unpinnedSpace, dir)).toBe(false);

            const unpinnedTab: TabSearchResult = { ...mockTab, pinned: false };
            expect(evaluateFilterDirective(unpinnedTab, dir)).toBe(false);

            // Positive assertion returns false for bookmarks, saved tabs, and read later
            expect(evaluateFilterDirective(mockBookmark, dir)).toBe(false);
            expect(evaluateFilterDirective(mockReadLater, dir)).toBe(false);
            expect(evaluateFilterDirective(mockSavedTab, dir)).toBe(false);

            // Negation passes for unpinned entities
            const notPinned = { key: 'is' as const, value: 'pinned', negated: true, rawToken: '-is:pinned' };
            expect(evaluateFilterDirective(mockBookmark, notPinned)).toBe(true);
            expect(evaluateFilterDirective(mockTab, notPinned)).toBe(false);
        });

        it('is:unread and is:archived return false for open tabs, bookmarks, and spaces', () => {
            const unreadDir = { key: 'is' as const, value: 'unread', negated: false, rawToken: 'is:unread' };
            const archivedDir = { key: 'is' as const, value: 'archived', negated: false, rawToken: 'is:archived' };

            expect(evaluateFilterDirective(mockReadLater, unreadDir)).toBe(true);
            expect(evaluateFilterDirective(mockReadLater, archivedDir)).toBe(false);

            // Positive assertion: must return false for open tabs, bookmarks, and spaces
            expect(evaluateFilterDirective(mockTab, unreadDir)).toBe(false);
            expect(evaluateFilterDirective(mockSpace, unreadDir)).toBe(false);
            expect(evaluateFilterDirective(mockBookmark, unreadDir)).toBe(false);
            expect(evaluateFilterDirective(mockSavedTab, unreadDir)).toBe(false);

            // Negations: -is:unread passes for entities that are not unread read-later items
            const notUnread = { key: 'is' as const, value: 'unread', negated: true, rawToken: '-is:unread' };
            expect(evaluateFilterDirective(mockTab, notUnread)).toBe(true);
            expect(evaluateFilterDirective(mockBookmark, notUnread)).toBe(true);
            expect(evaluateFilterDirective(mockSpace, notUnread)).toBe(true);
            expect(evaluateFilterDirective(mockReadLater, notUnread)).toBe(false); // mockReadLater is unread
        });

        it('is:locked evaluates open tabs with lockedTabIds and returns false for others', () => {
            const lockedDir = { key: 'is' as const, value: 'locked', negated: false, rawToken: 'is:locked' };
            expect(evaluateFilterDirective(mockTab, lockedDir, { lockedTabIds: [101] })).toBe(true);
            expect(evaluateFilterDirective(mockTab, lockedDir, { lockedTabIds: [999] })).toBe(false);

            // Positive assertion returns false for non-tabs
            expect(evaluateFilterDirective(mockBookmark, lockedDir, { lockedTabIds: [101] })).toBe(false);
            expect(evaluateFilterDirective(mockSpace, lockedDir, { lockedTabIds: [101] })).toBe(false);

            // Negated passes for non-tabs
            const notLocked = { key: 'is' as const, value: 'locked', negated: true, rawToken: '-is:locked' };
            expect(evaluateFilterDirective(mockBookmark, notLocked, { lockedTabIds: [101] })).toBe(true);
        });
    });

    describe('age:, before:, and after: temporal inequalities', () => {
        const FIXED_NOW = 1725550000000; // Reference timestamp
        const ONE_DAY = 24 * 60 * 60 * 1000;

        it('excludes entities with undefined, null, or non-numeric timestamps on positive age filters', () => {
            const tabWithoutTimestamp: TabSearchResult = {
                ...mockTab,
                createdAt: undefined,
            };

            const dir = { key: 'age' as const, value: '>30d', negated: false, rawToken: 'age:>30d' };
            expect(evaluateFilterDirective(tabWithoutTimestamp, dir, { now: FIXED_NOW })).toBe(false);

            // Negation passes because it doesn't possess age > 30d
            const negatedDir = { key: 'age' as const, value: '>30d', negated: true, rawToken: '-age:>30d' };
            expect(evaluateFilterDirective(tabWithoutTimestamp, negatedDir, { now: FIXED_NOW })).toBe(true);
        });

        it('evaluates age:>14d (older than 14 days)', () => {
            // Item created 20 days ago (older than 14d)
            const oldItem: ReadLaterSearchResult = {
                ...mockReadLater,
                addedAt: FIXED_NOW - 20 * ONE_DAY,
            };
            // Item created 5 days ago (newer than 14d)
            const newItem: ReadLaterSearchResult = {
                ...mockReadLater,
                addedAt: FIXED_NOW - 5 * ONE_DAY,
            };

            const dir = { key: 'age' as const, value: '>14d', negated: false, rawToken: 'age:>14d' };
            expect(evaluateFilterDirective(oldItem, dir, { now: FIXED_NOW })).toBe(true);
            expect(evaluateFilterDirective(newItem, dir, { now: FIXED_NOW })).toBe(false);
        });

        it('evaluates age:<7d (newer than 7 days)', () => {
            const newItem: ReadLaterSearchResult = {
                ...mockReadLater,
                addedAt: FIXED_NOW - 3 * ONE_DAY,
            };
            const oldItem: ReadLaterSearchResult = {
                ...mockReadLater,
                addedAt: FIXED_NOW - 10 * ONE_DAY,
            };

            const dir = { key: 'age' as const, value: '<7d', negated: false, rawToken: 'age:<7d' };
            expect(evaluateFilterDirective(newItem, dir, { now: FIXED_NOW })).toBe(true);
            expect(evaluateFilterDirective(oldItem, dir, { now: FIXED_NOW })).toBe(false);
        });

        it('evaluates before: and after: dates', () => {
            const item: ReadLaterSearchResult = {
                ...mockReadLater,
                addedAt: new Date('2026-08-15T00:00:00Z').getTime(),
            };

            const beforeDir = { key: 'before' as const, value: '2026-09-01', negated: false, rawToken: 'before:2026-09-01' };
            const afterDir = { key: 'after' as const, value: '2026-08-01', negated: false, rawToken: 'after:2026-08-01' };

            expect(evaluateFilterDirective(item, beforeDir)).toBe(true);
            expect(evaluateFilterDirective(item, afterDir)).toBe(true);

            const pastBeforeDir = { key: 'before' as const, value: '2026-08-01', negated: false, rawToken: 'before:2026-08-01' };
            expect(evaluateFilterDirective(item, pastBeforeDir)).toBe(false);
        });
    });

    describe('negation (-)', () => {
        it('inverts condition result when negated: true', () => {
            const negatedDomain = {
                key: 'domain' as const,
                value: 'github.com',
                negated: true,
                rawToken: '-domain:github.com',
            };
            expect(evaluateFilterDirective(mockTab, negatedDomain)).toBe(false);

            const otherDomainTab: TabSearchResult = {
                ...mockTab,
                url: 'https://vite.dev',
            };
            expect(evaluateFilterDirective(otherDomainTab, negatedDomain)).toBe(true);
        });
    });

    describe('evaluateCandidateFilters (AND evaluation)', () => {
        it('returns true when all directives match', () => {
            const filters = [
                { key: 'in' as const, value: 'active', negated: false, rawToken: 'in:active' },
                { key: 'is' as const, value: 'audible', negated: false, rawToken: 'is:audible' },
                { key: 'domain' as const, value: 'github.com', negated: false, rawToken: 'domain:github.com' },
            ];
            expect(evaluateCandidateFilters(mockTab, filters)).toBe(true);
        });

        it('returns false if any directive fails', () => {
            const filters = [
                { key: 'in' as const, value: 'active', negated: false, rawToken: 'in:active' },
                { key: 'is' as const, value: 'muted', negated: false, rawToken: 'is:muted' }, // false
            ];
            expect(evaluateCandidateFilters(mockTab, filters)).toBe(false);
        });
    });
});
