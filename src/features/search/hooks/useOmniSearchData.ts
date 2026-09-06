import { useState, useEffect, useMemo, useRef } from 'react';
import { spaceService, readLaterService, bookmarkService } from '@/lib';
import { useTabLockStore } from '@/features/tabs/store/tabLockStore';
import type {
    TabSearchResult,
    SpaceSearchResult,
    SavedTabSearchResult,
    ReadLaterSearchResult,
    BookmarkSearchResult,
    ParsedSearchQuery,
} from '../types';
import { flattenBookmarks, fuzzyMatchTokens } from '../utils/searchUtils';
import { parseSearchQuery } from '../utils/queryParser';
import { evaluateCandidateFilters } from '../utils/filterEvaluator';

export interface OmniSearchDataState {
    activeTabs: TabSearchResult[];
    spaces: SpaceSearchResult[];
    savedTabs: SavedTabSearchResult[];
    readLater: ReadLaterSearchResult[];
    bookmarks: BookmarkSearchResult[];
    isLoading: boolean;
}

export interface UseOmniSearchDataResult extends OmniSearchDataState {
    filteredActiveTabs: TabSearchResult[];
    filteredSpaces: SpaceSearchResult[];
    filteredSavedTabs: SavedTabSearchResult[];
    filteredReadLater: ReadLaterSearchResult[];
    filteredBookmarks: BookmarkSearchResult[];
    totalResultsCount: number;
    parsedQuery: ParsedSearchQuery;
    refetch: () => Promise<void>;
}

export function useOmniSearchData(isOpen: boolean, query: string): UseOmniSearchDataResult {
    const [state, setState] = useState<OmniSearchDataState>({
        activeTabs: [],
        spaces: [],
        savedTabs: [],
        readLater: [],
        bookmarks: [],
        isLoading: false,
    });

    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const fetchData = async () => {
        if (!isOpen) return;

        setState((prev) => ({ ...prev, isLoading: true }));

        try {
            // 1. Query Active Chrome Tabs
            let activeTabsData: TabSearchResult[] = [];
            if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
                try {
                    const currentWindow = await chrome.windows?.getCurrent().catch(() => null);
                    const currentWindowId = currentWindow?.id;
                    const tabs = await chrome.tabs.query({});
                    activeTabsData = tabs
                        .filter((t) => t.id !== undefined && t.url)
                        .map((t) => ({
                            type: 'tab',
                            id: t.id!,
                            title: t.title || t.url || 'Untitled Tab',
                            url: t.url!,
                            favIconUrl: t.favIconUrl,
                            windowId: t.windowId || 0,
                            isCurrentWindow: Boolean(currentWindowId && t.windowId === currentWindowId),
                            audible: Boolean(t.audible),
                            muted: Boolean(t.mutedInfo?.muted),
                            discarded: Boolean(t.discarded),
                            pinned: Boolean(t.pinned),
                            createdAt: (t as { lastAccessed?: number }).lastAccessed,
                        }));
                } catch (err) {
                    console.warn('[useOmniSearchData] Failed to query chrome tabs:', err);
                }
            }

            // 2. Query Non-deleted Spaces and their tab counts
            let spacesData: SpaceSearchResult[] = [];
            try {
                const rawSpaces = await spaceService.getNonDeletedSpaces();
                spacesData = await Promise.all(
                    rawSpaces
                        .filter((s) => s.id !== undefined)
                        .map(async (s) => {
                            const tabs = await spaceService.getTabsForSpace(s.id!);
                            return {
                                type: 'space',
                                id: s.id!,
                                name: s.name,
                                color: s.color,
                                tabCount: tabs.length,
                                isPinned: s.isPinned,
                                createdAt: s.createdAt,
                            };
                        })
                );
            } catch (err) {
                console.warn('[useOmniSearchData] Failed to query spaces:', err);
            }

            // 3. Query Grouped Saved Tabs
            let savedTabsData: SavedTabSearchResult[] = [];
            try {
                const rawSavedTabs = await spaceService.getSavedTabsGroupedByUrl();
                savedTabsData = rawSavedTabs.map((st) => ({
                    type: 'saved-tab',
                    url: st.url,
                    title: st.title,
                    favicon: st.favicon,
                    spaceNames: st.spaceNames,
                }));
            } catch (err) {
                console.warn('[useOmniSearchData] Failed to query saved tabs:', err);
            }

            // 4. Query Read Later Items
            let readLaterData: ReadLaterSearchResult[] = [];
            try {
                const rawReadLater = await readLaterService.getAllItems();
                readLaterData = rawReadLater
                    .filter((item) => item.id !== undefined)
                    .map((item) => ({
                        type: 'read-later',
                        id: item.id!,
                        title: item.title,
                        url: item.url,
                        status: item.status,
                        addedAt: item.addedAt,
                    }));
            } catch (err) {
                console.warn('[useOmniSearchData] Failed to query read later items:', err);
            }

            // 5. Query Bookmarks
            let bookmarksData: BookmarkSearchResult[] = [];
            try {
                const bookmarkTree = await bookmarkService.getBookmarkTree();
                bookmarksData = flattenBookmarks(bookmarkTree);
            } catch (err) {
                console.warn('[useOmniSearchData] Failed to query bookmarks:', err);
            }

            if (isMountedRef.current) {
                setState({
                    activeTabs: activeTabsData,
                    spaces: spacesData,
                    savedTabs: savedTabsData,
                    readLater: readLaterData,
                    bookmarks: bookmarksData,
                    isLoading: false,
                });
            }
        } catch (error) {
            console.error('[useOmniSearchData] Unhandled error during fetch:', error);
            if (isMountedRef.current) {
                setState((prev) => ({ ...prev, isLoading: false }));
            }
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const lockedTabIds = useTabLockStore((state) => state.lockedTabIds);
    const filterContext = useMemo(() => ({ lockedTabIds }), [lockedTabIds]);

    const parsedQuery = useMemo(() => parseSearchQuery(query), [query]);

    const filteredActiveTabs = useMemo(() => {
        const hasFilters = parsedQuery.filters.length > 0;
        const hasTerms = parsedQuery.terms.length > 0;

        if (!hasFilters && !hasTerms) {
            return state.activeTabs.slice(0, 15);
        }

        return state.activeTabs
            .filter((tab) => evaluateCandidateFilters(tab, parsedQuery.filters, filterContext))
            .filter((tab) => {
                if (!hasTerms) return true;
                return fuzzyMatchTokens(`${tab.title} ${tab.url}`, parsedQuery.terms);
            })
            .slice(0, 15);
    }, [state.activeTabs, parsedQuery, filterContext]);

    const filteredSpaces = useMemo(() => {
        const hasFilters = parsedQuery.filters.length > 0;
        const hasTerms = parsedQuery.terms.length > 0;

        if (!hasFilters && !hasTerms) {
            return state.spaces.slice(0, 8);
        }

        return state.spaces
            .filter((space) => evaluateCandidateFilters(space, parsedQuery.filters, filterContext))
            .filter((space) => {
                if (!hasTerms) return true;
                return fuzzyMatchTokens(space.name, parsedQuery.terms);
            })
            .slice(0, 8);
    }, [state.spaces, parsedQuery, filterContext]);

    const filteredSavedTabs = useMemo(() => {
        const hasFilters = parsedQuery.filters.length > 0;
        const hasTerms = parsedQuery.terms.length > 0;

        if (!hasFilters && !hasTerms) {
            return state.savedTabs.slice(0, 15);
        }

        return state.savedTabs
            .filter((tab) => evaluateCandidateFilters(tab, parsedQuery.filters, filterContext))
            .filter((tab) => {
                if (!hasTerms) return true;
                const spaceNamesStr = tab.spaceNames ? tab.spaceNames.join(' ') : (tab.spaceName || '');
                return fuzzyMatchTokens(`${tab.title || ''} ${tab.url} ${spaceNamesStr}`, parsedQuery.terms);
            })
            .slice(0, 15);
    }, [state.savedTabs, parsedQuery, filterContext]);

    const filteredReadLater = useMemo(() => {
        const hasFilters = parsedQuery.filters.length > 0;
        const hasTerms = parsedQuery.terms.length > 0;

        if (!hasFilters && !hasTerms) {
            return state.readLater.slice(0, 15);
        }

        return state.readLater
            .filter((item) => evaluateCandidateFilters(item, parsedQuery.filters, filterContext))
            .filter((item) => {
                if (!hasTerms) return true;
                return fuzzyMatchTokens(`${item.title || ''} ${item.url} ${item.status}`, parsedQuery.terms);
            })
            .slice(0, 15);
    }, [state.readLater, parsedQuery, filterContext]);

    const filteredBookmarks = useMemo(() => {
        const hasFilters = parsedQuery.filters.length > 0;
        const hasTerms = parsedQuery.terms.length > 0;

        if (!hasFilters && !hasTerms) {
            return state.bookmarks.slice(0, 15);
        }

        return state.bookmarks
            .filter((bm) => evaluateCandidateFilters(bm, parsedQuery.filters, filterContext))
            .filter((bm) => {
                if (!hasTerms) return true;
                return fuzzyMatchTokens(`${bm.title} ${bm.url}`, parsedQuery.terms);
            })
            .slice(0, 15);
    }, [state.bookmarks, parsedQuery, filterContext]);

    const totalResultsCount =
        filteredActiveTabs.length +
        filteredSpaces.length +
        filteredSavedTabs.length +
        filteredReadLater.length +
        filteredBookmarks.length;

    return {
        ...state,
        filteredActiveTabs,
        filteredSpaces,
        filteredSavedTabs,
        filteredReadLater,
        filteredBookmarks,
        totalResultsCount,
        parsedQuery,
        refetch: fetchData,
    };
}
