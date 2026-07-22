import React from 'react';
import { CheckCheck, Trash2 } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface ReadLaterToolbarProps {
    onMarkAllAsRead: () => void;
    onClearAllArchived: () => void;
}

export const ReadLaterToolbar = React.memo<ReadLaterToolbarProps>(({
    onMarkAllAsRead,
    onClearAllArchived,
}) => {
    return (
        <div className="h-8 flex items-center justify-between px-3 bg-background border-b border-border flex-shrink-0 z-10 select-none">
            {/* Left Spacer */}
            <div className="flex items-center gap-0.5" />

            {/* Right Group Bulk Actions */}
            <div className="flex items-center gap-0.5">
                <TooltipSimple content="Mark All as Read" side="bottom">
                    <button
                        onClick={onMarkAllAsRead}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Mark all as read"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Clear All Read" side="bottom">
                    <button
                        onClick={onClearAllArchived}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        aria-label="Clear all read items"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>
        </div>
    );
});
