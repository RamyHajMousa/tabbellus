import React from 'react';
import { Archive, Trash2, Link, Search, X } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface ReadLaterToolbarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onCopyAllUrls: () => void;
    onArchiveAll: () => void;
    onClearAllArchived: () => void;
}

export const ReadLaterToolbar = React.memo<ReadLaterToolbarProps>(({
    searchQuery,
    onSearchChange,
    onCopyAllUrls,
    onArchiveAll,
    onClearAllArchived,
}) => {
    return (
        <div className="h-8 flex items-center justify-between px-2 bg-background border-b border-border flex-shrink-0 z-10 select-none gap-2">
            {/* Left Group — Search Filter */}
            <div className="relative flex-1 min-w-0 max-w-[170px]">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Filter links..."
                    className="w-full h-6 pl-7 pr-6 bg-muted/50 hover:bg-muted/70 focus:bg-background border border-transparent focus:border-input rounded text-xs transition-colors focus-visible:outline-none placeholder:text-muted-foreground/60"
                />
                {searchQuery && (
                    <TooltipSimple content="Clear search filter" side="bottom">
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded p-0.5"
                            aria-label="Clear search filter"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </TooltipSimple>
                )}
            </div>

            {/* Right Group — Bulk Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
                <TooltipSimple content="Copy All URLs" side="bottom">
                    <button
                        onClick={onCopyAllUrls}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Copy all URLs"
                    >
                        <Link className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Archive All Unread" side="bottom">
                    <button
                        onClick={onArchiveAll}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Archive all unread"
                    >
                        <Archive className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Clear All Archived" side="bottom">
                    <button
                        onClick={onClearAllArchived}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        aria-label="Clear all archived items"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>
        </div>
    );
});
