import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { Globe, RotateCcw, LayoutTemplate, Copy, Layers, Check } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';
import { isValidUrl, isFuzzyMatch, tryParseHost } from '@/lib/sessionUtils';
import type { Space } from '@/lib/db';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';

// ─── Types ───────────────────────────────────────────────────────────

interface EnrichedSession extends chrome.sessions.Session {
    matchedSpaceId?: number;
    matchedSpaceName?: string;
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

    // 4. Restore handler
    const handleRestore = (sessionId?: string, matchedSpaceId?: number) => {
        if (!sessionId) return;
        chrome.sessions.restore(sessionId, async (restoredSession) => {
            if (matchedSpaceId && restoredSession?.window?.id) {
                registerActiveSpace(matchedSpaceId, restoredSession.window.id);
                try {
                    await chrome.sidePanel.open({ windowId: restoredSession.window.id });
                } catch (error) {
                    console.error('HistoryDialog: Failed to open side panel for restored space', error);
                }
            }
            setHistoryOpen(false);
        });
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
                    {enrichedSessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <p>No recently closed tabs.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {enrichedSessions.map((session, i) => (
                                <HistoryItem
                                    key={`${session.lastModified}-${i}`}
                                    session={session}
                                    onRestore={handleRestore}
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

const HistoryItem = ({ session, onRestore }: {
    session: EnrichedSession;
    onRestore: (id?: string, matchedSpaceId?: number) => void;
}) => {
    const { tab, window: win } = session;
    const isTab = !!tab;
    const sessionId = isTab ? tab?.sessionId : win?.sessionId;
    const isMatchedSpace = !!session.matchedSpaceName;

    const title = isTab
        ? (tab?.title || tab?.url || 'Untitled Tab')
        : isMatchedSpace
            ? `Space: ${session.matchedSpaceName}`
            : `Window (${win?.tabs?.length || 0} tabs)`;

    const subtitle = isTab
        ? (tab?.url ? tryParseHost(tab.url) : undefined)
        : `${win?.tabs?.length || 0} tabs`;

    const url = tab?.url;
    const faviconUrl = tab?.favIconUrl;

    const { hasCopied, copy } = useClipboard();

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (url) copy(url);
    };

    const [imgError, setImgError] = useState(false);

    return (
        <InteractiveRow
            size="md"
            onClick={() => onRestore(sessionId, session.matchedSpaceId)}
        >
            {/* Icon / Favicon */}
            <InteractiveRow.Leading>
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {isTab ? (
                        faviconUrl && !imgError ? (
                            <img
                                src={faviconUrl}
                                alt=""
                                className="w-4 h-4 rounded-sm"
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <Globe className="w-4 h-4 text-muted-foreground" />
                        )
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
                {url && (
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
                    onClick={() => onRestore(sessionId, session.matchedSpaceId)}
                    title="Restore Session"
                    variant="primary"
                />
            </InteractiveRow.Actions>
        </InteractiveRow>
    );
};
