import React from 'react';
import { Package, Bookmark, BookOpen } from 'lucide-react';
import { CommandItem } from '@/components/ui/Command';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import { cn } from '@/lib/utils';
import type { SearchResultItem } from '../types';

interface SearchItemRowProps {
    item: SearchResultItem;
    onSelect: () => void;
    isActiveSpace?: boolean;
}

export const SearchItemRow: React.FC<SearchItemRowProps> = ({
    item,
    onSelect,
    isActiveSpace = false,
}) => {
    switch (item.type) {
        case 'tab':
            return (
                <CommandItem
                    value={`tab ${item.title} ${item.url}`}
                    onSelect={onSelect}
                    className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-muted/60 data-[selected=true]:bg-muted/80 transition-colors"
                >
                    <SmartFallbackIcon
                        url={item.url}
                        favicon={item.favIconUrl}
                        className="h-4 w-4 rounded-sm shrink-0"
                    />
                    <span className="truncate flex-1 text-xs text-foreground font-normal">
                        {item.title || item.url}
                    </span>
                    {item.isCurrentWindow ? (
                        <span className="text-xxs font-mono text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border/40 shrink-0">
                            Current Window
                        </span>
                    ) : (
                        <span className="text-xxs font-mono text-muted-foreground/60 shrink-0">
                            Win #{item.windowId}
                        </span>
                    )}
                </CommandItem>
            );

        case 'space':
            return (
                <CommandItem
                    value={`space ${item.name}`}
                    onSelect={onSelect}
                    className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-muted/60 data-[selected=true]:bg-muted/80 transition-colors"
                >
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-xs font-medium text-foreground">
                        {item.name}
                    </span>
                    <span className="text-xxs text-muted-foreground/80 shrink-0">
                        {item.tabCount} tab{item.tabCount !== 1 ? 's' : ''}
                    </span>
                    {isActiveSpace && (
                        <span
                            className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-1"
                            title="Active in window"
                        />
                    )}
                </CommandItem>
            );

        case 'saved-tab': {
            const spaceLabel = item.spaceNames?.join(', ') || item.spaceName || 'Space';
            return (
                <CommandItem
                    value={`savedtab ${item.title || ''} ${item.url} ${spaceLabel}`}
                    onSelect={onSelect}
                    className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-muted/60 data-[selected=true]:bg-muted/80 transition-colors"
                >
                    <SmartFallbackIcon
                        url={item.url}
                        favicon={item.favicon}
                        className="h-4 w-4 rounded-sm shrink-0"
                    />
                    <span className="truncate flex-1 text-xs text-foreground font-normal">
                        {item.title || item.url}
                    </span>
                    <span className="text-xxs text-muted-foreground/70 truncate max-w-[130px] shrink-0 font-mono">
                        In: {spaceLabel}
                    </span>
                </CommandItem>
            );
        }

        case 'read-later':
            return (
                <CommandItem
                    value={`readlater ${item.title || ''} ${item.url} ${item.status}`}
                    onSelect={onSelect}
                    className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-muted/60 data-[selected=true]:bg-muted/80 transition-colors"
                >
                    <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-xs text-foreground font-normal">
                        {item.title || item.url}
                    </span>
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

        case 'bookmark':
            return (
                <CommandItem
                    value={`bookmark ${item.title} ${item.url}`}
                    onSelect={onSelect}
                    className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-muted/60 data-[selected=true]:bg-muted/80 transition-colors"
                >
                    <Bookmark className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 text-xs text-foreground font-normal">
                        {item.title || item.url}
                    </span>
                    <span className="text-xxs text-muted-foreground/60 truncate shrink-0 font-mono">
                        Bookmark
                    </span>
                </CommandItem>
            );

        default:
            return null;
    }
};
