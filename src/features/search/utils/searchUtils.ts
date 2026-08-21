import type { BookmarkSearchResult, OmniSearchMode } from '../types';

/**
 * Traverses bookmark hierarchy and flattens into a searchable list of bookmarks.
 */
export function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkSearchResult[] {
    const results: BookmarkSearchResult[] = [];

    function traverse(node: chrome.bookmarks.BookmarkTreeNode) {
        if (node.url && !node.url.toLowerCase().startsWith('javascript:')) {
            results.push({
                type: 'bookmark',
                id: node.id,
                title: node.title || node.url,
                url: node.url,
            });
        }
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    if (Array.isArray(nodes)) {
        for (const node of nodes) {
            traverse(node);
        }
    }

    return results;
}

/**
 * Checks whether all search tokens match against the target string.
 */
export function fuzzyMatchTokens(target: string | undefined | null, tokens: string[]): boolean {
    if (!tokens || tokens.length === 0) return true;
    if (!target) return false;
    const lower = target.toLowerCase();
    return tokens.every((token) => lower.includes(token));
}

/**
 * Normalizes and partitions the user search input into mode and effective query.
 */
export function partitionSearchQuery(rawQuery: string): { mode: OmniSearchMode; query: string } {
    if (!rawQuery) {
        return { mode: 'search', query: '' };
    }

    if (rawQuery.startsWith('>')) {
        return {
            mode: 'command',
            query: rawQuery.slice(1).trim(),
        };
    }

    return {
        mode: 'search',
        query: rawQuery.trim(),
    };
}
