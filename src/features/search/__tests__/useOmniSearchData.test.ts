import { describe, it, expect } from 'vitest';
import {
    partitionSearchQuery,
    flattenBookmarks,
    fuzzyMatchTokens,
} from '../utils/searchUtils';

describe('OmniSearch Data & Query Utilities', () => {
    describe('partitionSearchQuery', () => {
        it('should default to search mode with empty query when raw input is empty', () => {
            expect(partitionSearchQuery('')).toEqual({ mode: 'search', query: '' });
        });

        it('should parse standard search queries without leading prefix', () => {
            expect(partitionSearchQuery('github pull requests')).toEqual({
                mode: 'search',
                query: 'github pull requests',
            });
        });

        it('should switch to command mode when input begins with ">"', () => {
            expect(partitionSearchQuery('>')).toEqual({
                mode: 'command',
                query: '',
            });

            expect(partitionSearchQuery('> theme')).toEqual({
                mode: 'command',
                query: 'theme',
            });

            expect(partitionSearchQuery('>   discard tabs  ')).toEqual({
                mode: 'command',
                query: 'discard tabs',
            });
        });
    });

    describe('flattenBookmarks', () => {
        it('should recursively traverse bookmark trees and extract valid bookmarks', () => {
            const mockTree: chrome.bookmarks.BookmarkTreeNode[] = [
                {
                    id: '1',
                    title: 'Bookmarks Bar',
                    children: [
                        {
                            id: '2',
                            title: 'GitHub',
                            url: 'https://github.com',
                        },
                        {
                            id: '3',
                            title: 'Development Folder',
                            children: [
                                {
                                    id: '4',
                                    title: 'Vite Guide',
                                    url: 'https://vite.dev',
                                },
                                {
                                    id: '5',
                                    title: 'Bookmarklet',
                                    url: 'javascript:alert(1)', // should be excluded
                                },
                                {
                                    id: '6',
                                    title: 'Empty Folder',
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ];

            const flat = flattenBookmarks(mockTree);

            expect(flat).toHaveLength(2);
            expect(flat[0]).toEqual({
                type: 'bookmark',
                id: '2',
                title: 'GitHub',
                url: 'https://github.com',
            });
            expect(flat[1]).toEqual({
                type: 'bookmark',
                id: '4',
                title: 'Vite Guide',
                url: 'https://vite.dev',
            });
        });

        it('should handle empty bookmark trees gracefully', () => {
            expect(flattenBookmarks([])).toEqual([]);
        });
    });

    describe('fuzzyMatchTokens', () => {
        it('should return true when token list is empty', () => {
            expect(fuzzyMatchTokens('Any Target String', [])).toBe(true);
        });

        it('should return false when target string is null or undefined', () => {
            expect(fuzzyMatchTokens(null, ['token'])).toBe(false);
            expect(fuzzyMatchTokens(undefined, ['token'])).toBe(false);
        });

        it('should perform case-insensitive multi-token matching', () => {
            const target = 'GitHub Repository - TabBellus Workspace Manager';

            expect(fuzzyMatchTokens(target, ['github'])).toBe(true);
            expect(fuzzyMatchTokens(target, ['github', 'tabbellus'])).toBe(true);
            expect(fuzzyMatchTokens(target, ['workspace', 'manager', 'repo'])).toBe(true);
            expect(fuzzyMatchTokens(target, ['github', 'nonexistent'])).toBe(false);
        });
    });
});
