import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { tryParseHost } from '@/lib/sessionUtils';
import type { LaunchpadData, TopSiteItem, RecentSessionItem, SpaceSearchResult } from '../types';

export async function fetchLaunchpadData(): Promise<{
    topSites: TopSiteItem[];
    pinnedSpaces: SpaceSearchResult[];
    recentSessions: RecentSessionItem[];
}> {
    // 1. Top Sites (clamp to 6)
    const fetchTopSites = new Promise<TopSiteItem[]>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.topSites?.get) {
            try {
                chrome.topSites.get((sites) => {
                    if (chrome.runtime?.lastError || !sites) {
                        resolve([]);
                        return;
                    }
                    const clamped = sites.slice(0, 6).map((site) => ({
                        title: site.title || tryParseHost(site.url) || site.url,
                        url: site.url,
                    }));
                    resolve(clamped);
                });
            } catch {
                resolve([]);
            }
        } else {
            resolve([]);
        }
    });

    // 2. Pinned Spaces (from Dexie)
    const fetchPinnedSpaces = async (): Promise<SpaceSearchResult[]> => {
        try {
            const spaces = await db.spaces
                .filter((s) => !s.deletedAt && !!s.isPinned)
                .toArray();

            const spaceResults: SpaceSearchResult[] = [];
            for (const s of spaces) {
                if (!s.id) continue;
                const count = await db.tabs.where('spaceId').equals(s.id).count();
                spaceResults.push({
                    type: 'space',
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    tabCount: count,
                    isPinned: true,
                });
            }
            return spaceResults;
        } catch (e) {
            console.warn('Launchpad: Failed to fetch pinned spaces', e);
            return [];
        }
    };

    // 3. Recently Closed Sessions (clamp to top 3)
    const fetchRecentSessions = new Promise<RecentSessionItem[]>((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.sessions?.getRecentlyClosed) {
            try {
                chrome.sessions.getRecentlyClosed({ maxResults: 10 }, (sessions) => {
                    if (chrome.runtime?.lastError || !sessions) {
                        resolve([]);
                        return;
                    }

                    const parsed: RecentSessionItem[] = [];
                    for (const s of sessions) {
                        if (parsed.length >= 3) break;

                        if (s.tab) {
                            parsed.push({
                                sessionId: s.tab.sessionId,
                                lastModified: s.lastModified,
                                title: s.tab.title || s.tab.url || 'Untitled Tab',
                                subtitle: tryParseHost(s.tab.url || ''),
                                url: s.tab.url,
                                isWindow: false,
                                session: s,
                            });
                        } else if (s.window) {
                            const count = s.window.tabs?.length || 0;
                            parsed.push({
                                sessionId: s.window.sessionId,
                                lastModified: s.lastModified,
                                title: `Window (${count} tabs)`,
                                subtitle: `${count} tabs`,
                                isWindow: true,
                                tabCount: count,
                                session: s,
                            });
                        }
                    }
                    resolve(parsed);
                });
            } catch {
                resolve([]);
            }
        } else {
            resolve([]);
        }
    });

    const [sites, spaces, sessions] = await Promise.all([
        fetchTopSites,
        fetchPinnedSpaces(),
        fetchRecentSessions,
    ]);

    return {
        topSites: sites,
        pinnedSpaces: spaces,
        recentSessions: sessions,
    };
}

export function useLaunchpadData(enabled: boolean): LaunchpadData {
    const [topSites, setTopSites] = useState<TopSiteItem[]>([]);
    const [pinnedSpaces, setPinnedSpaces] = useState<SpaceSearchResult[]>([]);
    const [recentSessions, setRecentSessions] = useState<RecentSessionItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    useEffect(() => {
        if (!enabled) return;

        let isMounted = true;
        setIsLoading(true);

        fetchLaunchpadData()
            .then((data) => {
                if (isMounted) {
                    setTopSites(data.topSites);
                    setPinnedSpaces(data.pinnedSpaces);
                    setRecentSessions(data.recentSessions);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    console.warn('Launchpad data fetch error:', err);
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [enabled]);

    return {
        topSites,
        pinnedSpaces,
        recentSessions,
        isLoading,
    };
}
