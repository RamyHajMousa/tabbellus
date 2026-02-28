import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { Globe, RotateCcw, LayoutTemplate, Copy, Layers } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Space, type Tab } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────

interface EnrichedSession extends chrome.sessions.Session {
    matchedSpaceId?: number;
    matchedSpaceName?: string;
}

interface SpaceWithTabs {
    space: Space;
    tabs: Tab[];
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Filters out internal browser pages and invalid URLs. */
function isValidUrl(raw?: string): raw is string {
    if (!raw) return false;
    return !raw.startsWith('chrome://') && !raw.startsWith('edge://') && !raw.startsWith('about:');
}

/**
 * Fuzzy matches two URLs to handle subdomain redirects and SPA mutations.
 * 
 * Rules:
 * 1. Hosts must match or be subdomains (e.g., 'internetbank.swedbank.se' matches 'swedbank.se')
 * 2. Paths must match or be extensions (e.g., '/maps/place/123' matches '/maps')
 * 3. If saved path is '/', it matches any path on that domain.
 */
function isFuzzyMatch(savedUrl: string, closedUrl: string): boolean {
    try {
        const saved = new URL(savedUrl);
        const closed = new URL(closedUrl);

        // Hostname Normalization: strip www., lowercase
        const savedHost = saved.hostname.replace(/^www\./, '').toLowerCase();
        const closedHost = closed.hostname.replace(/^www\./, '').toLowerCase();

        // Hostname Check: 'internetbank.swedbank.se' ends with 'swedbank.se'
        if (!savedHost.endsWith(closedHost) && !closedHost.endsWith(savedHost)) {
            return false;
        }

        // Pathname Normalization: strip trailing slash
        const savedPath = saved.pathname.replace(/\/$/, '') || '/';
        const closedPath = closed.pathname.replace(/\/$/, '') || '/';

        // Pathname Check:
        // 1. Exact match (ignoring trailing slash)
        if (savedPath === closedPath) return true;
        // 2. Root path matches anything on domain
        if (savedPath === '/') return true;
        // 3. SPA extension: '/maps/place' starts with '/maps'
        if (closedPath.startsWith(savedPath)) return true;
        // 4. Common path prefix: same first segment = same SPA section
        //    Handles '/maps/@59...' vs '/maps/@60...' where dynamic params diverge
        const savedSegs = savedPath.split('/').filter(Boolean);
        const closedSegs = closedPath.split('/').filter(Boolean);
        if (savedSegs.length > 0 && closedSegs.length > 0 && savedSegs[0] === closedSegs[0]) {
            return true;
        }

        return false;
    } catch {
        // Fallback to strict string equality for non-standard URLs
        return savedUrl === closedUrl;
    }
}

function tryParseHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
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
    const spacesWithTabs = useLiveQuery(async (): Promise<SpaceWithTabs[]> => {
        if (!isHistoryOpen) return [];
        const spaces = await db.spaces.filter((s) => !s.deletedAt).toArray();

        return Promise.all(
            spaces.map(async (space) => {
                const tabs = await db.tabs.where('spaceId').equals(space.id!).toArray();
                return { space, tabs };
            })
        );
    }, [isHistoryOpen], []);

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
        chrome.sessions.restore(sessionId, (restoredSession) => {
            if (matchedSpaceId && restoredSession?.window?.id) {
                registerActiveSpace(matchedSpaceId, restoredSession.window.id);
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
        <div className="relative group flex items-center gap-3 p-2 rounded-md hover:bg-accent transition-colors">
            {/* Icon / Favicon */}
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
                    <Layers className="w-4 h-4 text-blue-500" />
                ) : (
                    <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
                <span className={`truncate font-medium text-sm ${isMatchedSpace ? 'text-blue-500' : 'text-foreground/90'}`}>
                    {title}
                </span>
                {subtitle && (
                    <span className="truncate text-[10px] text-muted-foreground/70">
                        {subtitle}
                    </span>
                )}
            </div>

            {/* Actions */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pl-2 bg-background group-hover:bg-accent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity rounded-md z-10">
                {url && (
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-sm hover:bg-background text-muted-foreground hover:text-foreground transition-colors focus:opacity-100"
                        title="Copy URL"
                    >
                        {hasCopied ? <Copy className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                )}
                <button
                    onClick={() => onRestore(sessionId, session.matchedSpaceId)}
                    className="flex items-center gap-1.5 px-2 py-1 h-7 rounded-sm bg-background border border-border/50 hover:bg-primary/10 hover:text-primary hover:border-primary/20 text-[10px] font-medium transition-all shadow-sm"
                    title="Restore Session"
                >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                </button>
            </div>
        </div>
    );
};
