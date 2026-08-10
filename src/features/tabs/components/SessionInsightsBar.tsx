import React from 'react';
import { Copy, Moon } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { formatSavedRam } from '@/lib/tabService';

interface SessionInsightsBarProps {
    duplicateCount: number;
    discardedCount: number;
    onDeduplicate: () => void;
}

export const SessionInsightsBar = React.memo<SessionInsightsBarProps>(({ 
    duplicateCount, 
    discardedCount, 
    onDeduplicate 
}) => {
    const isVisible = duplicateCount > 0 || discardedCount > 0;

    return (
        <div 
            className={`flex items-center justify-between px-3 bg-muted/30 flex-shrink-0 whitespace-nowrap overflow-hidden transition-all duration-150 ease-in-out ${
                isVisible ? 'h-6 opacity-100 border-b border-border' : 'h-0 opacity-0 border-b-0 border-transparent'
            }`}
        >
            <div className="flex items-center gap-3">
                {duplicateCount > 0 && (
                    <TooltipSimple content="Duplicate tabs detected" side="bottom">
                        <div className="flex items-center gap-1.5 text-xxs text-muted-foreground font-medium cursor-default">
                            <Copy className="w-3 h-3" />
                            <span>{duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''}</span>
                        </div>
                    </TooltipSimple>
                )}
                {discardedCount > 0 && (
                    <TooltipSimple content="Estimated RAM saved by discarded tabs" side="bottom">
                        <div className="flex items-center gap-1.5 text-xxs text-muted-foreground font-medium cursor-default">
                            <Moon className="w-3 h-3" />
                            <span>{discardedCount} suspended ({formatSavedRam(discardedCount)} saved)</span>
                        </div>
                    </TooltipSimple>
                )}
            </div>
            
            {duplicateCount > 0 && (
                <TooltipSimple content="Close all duplicate tabs" side="bottom">
                    <button
                        onClick={onDeduplicate}
                        className="h-5 px-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded flex items-center justify-center text-xxs font-medium transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                        Deduplicate
                    </button>
                </TooltipSimple>
            )}
        </div>
    );
});
