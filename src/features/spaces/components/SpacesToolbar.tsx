import React from 'react';
import { FolderPlus, ArrowUpDown, ChevronsUpDown, ChevronsDownUp } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface SpacesToolbarProps {
    onAddSpace: () => void;
    sortOrder: 'newest' | 'alpha';
    onToggleSort: () => void;
    isAllExpanded: boolean;
    onToggleExpandAll: () => void;
}

export const SpacesToolbar: React.FC<SpacesToolbarProps> = ({
    onAddSpace,
    sortOrder,
    onToggleSort,
    isAllExpanded,
    onToggleExpandAll,
}) => {
    return (
        <div className="h-8 flex items-center justify-between px-3 bg-background border-b border-border flex-shrink-0 z-10 select-none">
            {/* Left Group */}
            <div className="flex items-center gap-0.5">
                <TooltipSimple content="Add New Space" side="bottom">
                    <button
                        onClick={onAddSpace}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Add new space"
                    >
                        <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>

            {/* Right Group */}
            <div className="flex items-center gap-0.5">
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
};
