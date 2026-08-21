import React from 'react';
import { Package, RotateCcw, AppWindow, ArrowRight } from 'lucide-react';
import { CommandItem } from '@/components/ui/Command';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { TooltipOverflow, TooltipSimple } from '@/components/ui/Tooltip';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import { formatRelativeTime } from '@/lib/dateUtils';
import { tryParseHost } from '@/lib/sessionUtils';
import type { TopSiteItem, SpaceSearchResult, RecentSessionItem } from '../types';

interface TopSiteRowProps {
    site: TopSiteItem;
    onSelect: () => void;
}

export const TopSiteRow: React.FC<TopSiteRowProps> = ({ site, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();
    const host = tryParseHost(site.url);

    return (
        <CommandItem
            value={`topsite ${site.title} ${site.url}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <SmartFallbackIcon
                url={site.url}
                className="h-4 w-4 rounded-sm shrink-0"
            />
            <TooltipOverflow isTruncated={isTruncated} text={site.title} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs text-foreground font-normal">
                    {site.title}
                </span>
            </TooltipOverflow>
            {host && (
                <span className="text-xxs font-mono text-muted-foreground/70 truncate max-w-[120px] shrink-0">
                    {host}
                </span>
            )}
            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground/60 bg-muted/50 border border-border/40 px-1 py-0.2 rounded shrink-0">
                Enter
            </kbd>
        </CommandItem>
    );
};

interface PinnedSpaceRowProps {
    space: SpaceSearchResult;
    isActive?: boolean;
    onSelect: () => void;
}

export const PinnedSpaceRow: React.FC<PinnedSpaceRowProps> = ({ space, isActive = false, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    return (
        <CommandItem
            value={`pinnedspace ${space.name}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <div className="relative flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                {space.color && (
                    <span
                        className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-background"
                        style={{ backgroundColor: space.color }}
                    />
                )}
            </div>

            <TooltipOverflow isTruncated={isTruncated} text={space.name} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs font-medium text-foreground">
                    {space.name}
                </span>
            </TooltipOverflow>

            <span className="text-xxs text-muted-foreground/80 shrink-0">
                {space.tabCount} tab{space.tabCount !== 1 ? 's' : ''}
            </span>

            {isActive && (
                <TooltipSimple content="Active in open window" side="top">
                    <span
                        className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-1"
                        aria-label="Active in open window"
                    />
                </TooltipSimple>
            )}

            <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0 ml-1" />
        </CommandItem>
    );
};

interface RecentSessionRowProps {
    session: RecentSessionItem;
    onSelect: () => void;
}

export const RecentSessionRow: React.FC<RecentSessionRowProps> = ({ session, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();
    const relativeTime = session.lastModified ? formatRelativeTime(session.lastModified * 1000) : '';

    return (
        <CommandItem
            value={`recentsession ${session.title} ${session.subtitle || ''}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            {session.isWindow ? (
                <AppWindow className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
                <SmartFallbackIcon
                    url={session.url}
                    className="h-4 w-4 rounded-sm shrink-0"
                />
            )}

            <TooltipOverflow isTruncated={isTruncated} text={session.title} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs text-foreground font-normal">
                    {session.title}
                </span>
            </TooltipOverflow>

            {session.subtitle && (
                <span className="text-xxs font-mono text-muted-foreground/70 truncate max-w-[100px] shrink-0">
                    {session.subtitle}
                </span>
            )}

            {relativeTime && (
                <span className="text-xxs text-muted-foreground/60 shrink-0">
                    {relativeTime}
                </span>
            )}

            <RotateCcw className="h-3 w-3 text-muted-foreground/50 shrink-0 ml-0.5" />
        </CommandItem>
    );
};
