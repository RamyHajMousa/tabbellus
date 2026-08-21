import React from 'react';
import { Package, Bookmark, BookOpen } from 'lucide-react';
import { CommandItem } from '@/components/ui/Command';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { TooltipOverflow, TooltipSimple } from '@/components/ui/Tooltip';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import { cn } from '@/lib/utils';
import type {
    SearchResultItem,
    TabSearchResult,
    SpaceSearchResult,
    SavedTabSearchResult,
    ReadLaterSearchResult,
    BookmarkSearchResult,
} from '../types';

interface SearchItemRowProps {
    item: SearchResultItem;
    onSelect: () => void;
    isActiveSpace?: boolean;
}

const TabItemRow: React.FC<{ tab: TabSearchResult; onSelect: () => void }> = ({ tab, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();
    const displayTitle = tab.title || tab.url;

    return (
        <CommandItem
            value={`tab ${tab.title} ${tab.url}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <SmartFallbackIcon
                url={tab.url}
                favicon={tab.favIconUrl}
                className="h-4 w-4 rounded-sm shrink-0"
            />
            <TooltipOverflow isTruncated={isTruncated} text={displayTitle} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs text-foreground font-normal">
                    {displayTitle}
                </span>
            </TooltipOverflow>
            {tab.isCurrentWindow ? (
                <span className="text-xxs font-mono text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border/40 shrink-0">
                    Current Window
                </span>
            ) : (
                <span className="text-xxs font-mono text-muted-foreground/60 shrink-0">
                    Win #{tab.windowId}
                </span>
            )}
        </CommandItem>
    );
};

const SpaceItemRow: React.FC<{ space: SpaceSearchResult; onSelect: () => void; isActiveSpace?: boolean }> = ({
    space,
    onSelect,
    isActiveSpace = false,
}) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    return (
        <CommandItem
            value={`space ${space.name}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <TooltipOverflow isTruncated={isTruncated} text={space.name} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs font-medium text-foreground">
                    {space.name}
                </span>
            </TooltipOverflow>
            <span className="text-xxs text-muted-foreground/80 shrink-0">
                {space.tabCount} tab{space.tabCount !== 1 ? 's' : ''}
            </span>
            {isActiveSpace && (
                <TooltipSimple content="Active in current window" side="top">
                    <span
                        className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-1"
                        aria-label="Active in current window"
                    />
                </TooltipSimple>
            )}
        </CommandItem>
    );
};

const SavedTabItemRow: React.FC<{ item: SavedTabSearchResult; onSelect: () => void }> = ({ item, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();
    const displayTitle = item.title || item.url;
    const spaceLabel = item.spaceNames?.join(', ') || item.spaceName || 'Space';

    return (
        <CommandItem
            value={`savedtab ${item.title || ''} ${item.url} ${spaceLabel}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <SmartFallbackIcon
                url={item.url}
                favicon={item.favicon}
                className="h-4 w-4 rounded-sm shrink-0"
            />
            <TooltipOverflow isTruncated={isTruncated} text={displayTitle} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs text-foreground font-normal">
                    {displayTitle}
                </span>
            </TooltipOverflow>
            <span className="text-xxs text-muted-foreground/70 truncate max-w-[130px] shrink-0 font-mono">
                In: {spaceLabel}
            </span>
        </CommandItem>
    );
};

const ReadLaterItemRow: React.FC<{ item: ReadLaterSearchResult; onSelect: () => void }> = ({ item, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();
    const displayTitle = item.title || item.url;

    return (
        <CommandItem
            value={`readlater ${item.title || ''} ${item.url} ${item.status}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <TooltipOverflow isTruncated={isTruncated} text={displayTitle} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs text-foreground font-normal">
                    {displayTitle}
                </span>
            </TooltipOverflow>
            <span
                className={cn(
                    'text-xxs px-1.5 py-0.5 rounded capitalize font-mono shrink-0',
                    item.status === 'unread'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-muted text-muted-foreground'
                )}
            >
                {item.status}
            </span>
        </CommandItem>
    );
};

const BookmarkItemRow: React.FC<{ item: BookmarkSearchResult; onSelect: () => void }> = ({ item, onSelect }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();
    const displayTitle = item.title || item.url;

    return (
        <CommandItem
            value={`bookmark ${item.title} ${item.url}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <Bookmark className="h-4 w-4 text-muted-foreground shrink-0" />
            <TooltipOverflow isTruncated={isTruncated} text={displayTitle} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs text-foreground font-normal">
                    {displayTitle}
                </span>
            </TooltipOverflow>
            <span className="text-xxs text-muted-foreground/60 truncate shrink-0 font-mono">
                Bookmark
            </span>
        </CommandItem>
    );
};

export const SearchItemRow: React.FC<SearchItemRowProps> = ({
    item,
    onSelect,
    isActiveSpace = false,
}) => {
    switch (item.type) {
        case 'tab':
            return <TabItemRow tab={item} onSelect={onSelect} />;
        case 'space':
            return <SpaceItemRow space={item} onSelect={onSelect} isActiveSpace={isActiveSpace} />;
        case 'saved-tab':
            return <SavedTabItemRow item={item} onSelect={onSelect} />;
        case 'read-later':
            return <ReadLaterItemRow item={item} onSelect={onSelect} />;
        case 'bookmark':
            return <BookmarkItemRow item={item} onSelect={onSelect} />;
        default:
            return null;
    }
};
