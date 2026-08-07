import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { RotateCcw, LayoutTemplate, Copy, Layers, Check } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';
import { isValidUrl, isFuzzyMatch, tryParseHost } from '@/lib/sessionUtils';
import type { Space } from '@/lib/db';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';

// ─── Types ───────────────────────────────────────────────────────────

interface EnrichedSession extends chrome.sessions.Session {
    matchedSpaceId?: number;
    matchedSpaceName?: string;
}

interface FoldedHistorySession {
    isFoldedGroup: boolean;
    sessionIds: string[];
    lastModified: number;
    title: string;
    subtitle?: string;
    matchedSpaceId?: number;
    matchedSpaceName?: string;
    session: EnrichedSession;
}

// ─── Main Component ─────────────────────────────────────────────────

export const HistoryDialog = () => {
    const { isHistoryOpen, setHistoryOpen } = useUIStore();
    const registerActiveSpace = useAppStore((s) => s.registerActiveSpace);
    const [sessions, setSessions] = useState<chrome.sessions.Session[]>([]);

    // 1. Fetch Chrome sessions
    useEffect(() => {
        if (!isHistoryOpen) return;

        const fetchSessions = () => {
            chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (data) => {
                setSessions(data);
            });
        };

        fetchSessions();

        const handleChange = () => fetchSessions();
        chrome.sessions.onChanged.addListener(handleChange);

        return () => {
            chrome.sessions.onChanged.removeListener(handleChange);
        };
    }, [isHistoryOpen]);

    // 2. Fetch all Spaces + Tabs from Dexie (reactive)
    const spacesWithTabs = useLiveQuery(
        spaceService.getSpacesWithTabsQuery(isHistoryOpen),
        [isHistoryOpen],
        []
    );

    // 3. Fingerprint matching (Array-Sorting approach)
    const enrichedSessions = useMemo((): EnrichedSession[] => {
        if (!spacesWithTabs || spacesWithTabs.length === 0) return sessions;

        return sessions.map((session) => {
            if (!session.window?.tabs || session.window.tabs.length === 0) return session;

            // Filter window URLs, removing internal browser pages
            const windowUrls = session.window.tabs
                .map((t) => t.url)
                .filter(isValidUrl);

            if (windowUrls.length === 0) return session;

            // Collect all valid matches
            const validMatches: { space: Space; matchCount: number; lengthDiff: number }[] = [];

            for (const { space, tabs } of spacesWithTabs) {
                const spaceUrls = tabs
                    .map((t) => t.url)
                    .filter(isValidUrl);

                if (spaceUrls.length === 0) continue;

                let matchCount = 0;
                for (const wUrl of windowUrls) {
                    if (spaceUrls.some(sUrl => isFuzzyMatch(sUrl, wUrl))) {
                        matchCount++;
                    }
                }

                if (matchCount === 0) continue;

                const spaceCoverage = matchCount / spaceUrls.length;
                const windowCoverage = matchCount / windowUrls.length;

                if (spaceCoverage >= 0.8 && windowCoverage >= 0.5) {
                    validMatches.push({
                        space,
                        matchCount,
                        lengthDiff: Math.abs(spaceUrls.length - windowUrls.length),
                    });
                }
            }

            // Sort to find the absolute best match
            if (validMatches.length > 0) {
                validMatches.sort((a, b) => {
                    // Priority 1: Exact tab count match wins (0 diff beats any non-zero diff)
                    const aExact = a.lengthDiff === 0 ? 0 : 1;
                    const bExact = b.lengthDiff === 0 ? 0 : 1;
                    if (aExact !== bExact) return aExact - bExact;
                    // Priority 2: Higher match count wins
                    if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount;
                    // Priority 3: Tie-breaker (newest space ID wins)
                    return (b.space.id ?? 0) - (a.space.id ?? 0);
                });

                const best = validMatches[0].space;
                return {
                    ...session,
                    matchedSpaceId: best.id!,
                    matchedSpaceName: best.name,
                } as EnrichedSession;
            }

            return session;
        });
    }, [sessions, spacesWithTabs]);

    // 4. Fold consecutive closed group tabs with identical timestamps
    const foldedSessions = useMemo((): FoldedHistorySession[] => {
        if (enrichedSessions.length === 0) return [];

        const result: FoldedHistorySession[] = [];
        let i = 0;

        while (i < enrichedSessions.length) {
            const current = enrichedSessions[i];

            if (!current.tab) {
                result.push({
                    isFoldedGroup: false,
                    sessionIds: current.window?.sessionId ? [current.window.sessionId] : [],
                    lastModified: current.lastModified,
                    title: current.matchedSpaceName ? `Space: ${current.matchedSpaceName}` : `Window (${current.window?.tabs?.length || 0} tabs)`,
                    subtitle: `${current.window?.tabs?.length || 0} tabs`,
                    matchedSpaceId: current.matchedSpaceId,
                    matchedSpaceName: current.matchedSpaceName,
                    session: current,
                });
                i++;
                continue;
            }

            const groupSessions: EnrichedSession[] = [current];
            let j = i + 1;
            while (
                j < enrichedSessions.length &&
                enrichedSessions[j].tab &&
                enrichedSessions[j].lastModified === current.lastModified
            ) {
                groupSessions.push(enrichedSessions[j]);
                j++;
            }

            if (groupSessions.length > 1) {
                const sessionIds = groupSessions
                    .map((s) => s.tab?.sessionId)
                    .filter((id): id is string => !!id);

                const hosts = groupSessions
                    .map((s) => tryParseHost(s.tab?.url || ''))
                    .filter(Boolean);

                const uniqueHosts = Array.from(new Set(hosts)).slice(0, 3).join(', ');

                result.push({
                    isFoldedGroup: true,
                    sessionIds,
                    lastModified: current.lastModified,
                    title: `Closed Group (${groupSessions.length} tabs)`,
                    subtitle: uniqueHosts ? `${groupSessions.length} tabs • ${uniqueHosts}` : `${groupSessions.length} tabs`,
                    matchedSpaceId: current.matchedSpaceId,
                    matchedSpaceName: current.matchedSpaceName,
                    session: current,
                });
                i = j;
            } else {
                result.push({
                    isFoldedGroup: false,
                    sessionIds: current.tab.sessionId ? [current.tab.sessionId] : [],
                    lastModified: current.lastModified,
                    title: current.tab.title || current.tab.url || 'Untitled Tab',
                    subtitle: tryParseHost(current.tab.url || ''),
                    matchedSpaceId: current.matchedSpaceId,
                    matchedSpaceName: current.matchedSpaceName,
                    session: current,
                });
                i++;
            }
        }

        return result;
    }, [enrichedSessions]);

    // 5. Restore handler
    const handleRestoreFolded = async (sessionIds: string[], matchedSpaceId?: number) => {
        if (sessionIds.length === 0) return;

        for (const id of sessionIds) {
            try {
                await new Promise<void>((resolve) => {
                    chrome.sessions.restore(id, (restoredSession) => {
                        if (matchedSpaceId && restoredSession?.window?.id) {
                            registerActiveSpace(matchedSpaceId, restoredSession.window.id);
                            chrome.sidePanel.open({ windowId: restoredSession.window.id }).catch(() => {});
                        }
                        resolve();
                    });
                });
            } catch (error) {
                console.error('HistoryDialog: Failed to restore closed session tab', error);
            }
        }
        setHistoryOpen(false);
    };

    return (
        <Dialog open={isHistoryOpen} onOpenChange={setHistoryOpen}>
            <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6">
                <DialogHeader className="mb-4">
                    <DialogTitle>Recently Closed</DialogTitle>
                    <DialogDescription>
                        Restore your recently closed tabs and windows.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 -mr-2 min-h-[300px]">
                    {foldedSessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <p>No recently closed tabs.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {foldedSessions.map((item, i) => (
                                <HistoryItem
                                    key={`${item.lastModified}-${i}`}
                                    item={item}
                                    onRestore={handleRestoreFolded}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

// ─── List Item ───────────────────────────────────────────────────────

const HistoryItem = ({ item, onRestore }: {
    item: FoldedHistorySession;
    onRestore: (ids: string[], matchedSpaceId?: number) => void;
}) => {
    const { session, isFoldedGroup, sessionIds, title, subtitle } = item;
    const { tab } = session;
    const isTab = !isFoldedGroup && !!tab;
    const isMatchedSpace = !!session.matchedSpaceName;

    const url = tab?.url;
    const faviconUrl = tab?.favIconUrl;

    const { hasCopied, copy } = useClipboard();

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (url) copy(url);
    };

    return (
        <InteractiveRow
            size="md"
            onClick={() => onRestore(sessionIds, item.matchedSpaceId)}
        >
            {/* Icon / Favicon */}
            <InteractiveRow.Leading>
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {isFoldedGroup ? (
                        <Layers className="w-4 h-4 text-primary" />
                    ) : isTab ? (
                        <SmartFallbackIcon url={url} favicon={faviconUrl} className="w-4 h-4 rounded-sm flex-shrink-0" />
                    ) : isMatchedSpace ? (
                        <Layers className="w-4 h-4 text-primary" />
                    ) : (
                        <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
                    )}
                </div>
            </InteractiveRow.Leading>

            {/* Content */}
            <InteractiveRow.Title
                subTitle={subtitle && (
                    <span className="truncate text-xxs text-muted-foreground">
                        {subtitle}
                    </span>
                )}
            >
                <span className={isMatchedSpace ? 'text-primary font-semibold' : 'text-foreground'}>
                    {title}
                </span>
            </InteractiveRow.Title>

            {/* Actions */}
            <InteractiveRow.Actions className="bg-background group-hover:bg-accent gap-1">
                {url && !isFoldedGroup && (
                    <InteractiveRow.Action
                        icon={hasCopied ? Check : Copy}
                        onClick={handleCopy}
                        title="Copy URL"
                        variant="neutral"
                        className={hasCopied ? "text-green-500 hover:text-green-500" : ""}
                    />
                )}
                <InteractiveRow.Action
                    icon={RotateCcw}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRestore(sessionIds, item.matchedSpaceId);
                    }}
                    title="Restore Session"
                    variant="primary"
                />
            </InteractiveRow.Actions>
        </InteractiveRow>
    );
};
