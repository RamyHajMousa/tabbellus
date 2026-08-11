import React from 'react';
import { FolderPlus, ArrowUpDown, ChevronsUpDown, ChevronsDownUp, Search, X, Palette } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { GROUP_COLORS, getGroupColorClasses, type ChromeColor } from '@/lib/colors';

interface SpacesToolbarProps {
    onAddSpace: () => void;
    sortOrder: 'newest' | 'alpha';
    onToggleSort: () => void;
    isAllExpanded: boolean;
    onToggleExpandAll: () => void;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    selectedColorFilter: string | null;
    onSelectColorFilter: (color: string | null) => void;
}

export const SpacesToolbar = React.memo<SpacesToolbarProps>(({
    onAddSpace,
    sortOrder,
    onToggleSort,
    isAllExpanded,
    onToggleExpandAll,
    searchQuery,
    onSearchChange,
    selectedColorFilter,
    onSelectColorFilter,
}) => {
    return (
        <div className="h-8 flex items-center justify-between px-2 bg-background border-b border-border flex-shrink-0 z-10 select-none gap-2">
            {/* Left Group & Search Filter */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
                <TooltipSimple content="Add New Space" side="bottom">
                    <button
                        onClick={onAddSpace}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors flex-shrink-0"
                        aria-label="Add new space"
                    >
                        <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <div className="relative flex-1 min-w-0 max-w-[150px]">
                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Filter spaces..."
                        className="w-full h-6 pl-7 pr-6 bg-accent/40 hover:bg-accent/60 focus:bg-background border border-transparent focus:border-input rounded text-xs transition-colors focus-visible:outline-none placeholder:text-muted-foreground/60"
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

                {/* Color Filter Popover */}
                <Popover>
                    <TooltipSimple content={selectedColorFilter ? `Filtered by ${selectedColorFilter}` : "Filter by Color"} side="bottom">
                        <PopoverTrigger asChild>
                            <button
                                className={`p-1 rounded-md transition-colors flex items-center gap-1 flex-shrink-0 ${
                                    selectedColorFilter
                                        ? 'bg-primary/15 text-primary'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                                aria-label="Filter spaces by color"
                            >
                                <Palette className="w-3.5 h-3.5" />
                                {selectedColorFilter && (
                                    <span className={`w-2 h-2 rounded-full ${getGroupColorClasses(selectedColorFilter).badge}`} />
                                )}
                            </button>
                        </PopoverTrigger>
                    </TooltipSimple>
                    <PopoverContent className="w-auto p-2" align="start" sideOffset={4}>
                        <div className="flex items-center gap-1.5 select-none">
                            {(Object.keys(GROUP_COLORS) as ChromeColor[]).map((colorKey) => {
                                const colorDef = getGroupColorClasses(colorKey);
                                const isSelected = selectedColorFilter === colorKey;
                                return (
                                    <TooltipSimple key={colorKey} content={`Filter: ${colorKey}`} side="top">
                                        <button
                                            onClick={() => onSelectColorFilter(isSelected ? null : colorKey)}
                                            className={`w-4 h-4 rounded-full transition-all ${colorDef.badge} ${
                                                isSelected
                                                    ? 'ring-2 ring-offset-1 ring-offset-popover ring-primary scale-110'
                                                    : 'hover:scale-105 opacity-70 hover:opacity-100'
                                            }`}
                                            aria-label={`Filter by ${colorKey}`}
                                        />
                                    </TooltipSimple>
                                );
                            })}
                            {selectedColorFilter && (
                                <TooltipSimple content="Clear color filter" side="top">
                                    <button
                                        onClick={() => onSelectColorFilter(null)}
                                        className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors ml-0.5"
                                        aria-label="Clear color filter"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </TooltipSimple>
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* Right Group */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
                <TooltipSimple content={`Sort by ${sortOrder === 'newest' ? 'Name (A-Z)' : 'Date (Newest)'}`} side="bottom">
                    <button
                        onClick={onToggleSort}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Toggle sort order"
                    >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content={isAllExpanded ? "Collapse All" : "Expand All"} side="bottom">
                    <button
                        onClick={onToggleExpandAll}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Toggle expand or collapse all spaces"
                    >
                        {isAllExpanded ? (
                            <ChevronsDownUp className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5" />
                        )}
                    </button>
                </TooltipSimple>
            </div>
        </div>
    );
});
