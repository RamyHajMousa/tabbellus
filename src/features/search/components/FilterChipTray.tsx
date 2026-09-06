import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchFilterDirective } from '../types';

export interface FilterChipTrayProps {
    filters: SearchFilterDirective[];
    onRemoveFilter: (directive: SearchFilterDirective) => void;
    className?: string;
}

export const FilterChipTray: React.FC<FilterChipTrayProps> = ({
    filters,
    onRemoveFilter,
    className,
}) => {
    if (!filters || filters.length === 0) {
        return null;
    }

    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/20',
                className
            )}
            role="toolbar"
            aria-label="Active search filters"
        >
            {filters.map((directive, idx) => {
                const isNegated = directive.negated;

                return (
                    <span
                        key={`${directive.key}-${directive.value}-${idx}`}
                        className={cn(
                            'text-xxs font-medium px-1.5 py-0.5 rounded border flex items-center gap-1 select-none transition-colors',
                            isNegated
                                ? 'border-destructive/30 text-destructive bg-card'
                                : 'border-border text-foreground bg-card'
                        )}
                    >
                        <span className="opacity-70 font-mono">
                            {isNegated ? '-' : ''}
                            {directive.key}:
                        </span>
                        <span className="font-semibold">{directive.value}</span>
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFilter(directive);
                            }}
                            className={cn(
                                'rounded p-0.5 ml-0.5 inline-flex items-center justify-center transition-colors cursor-pointer',
                                isNegated
                                    ? 'hover:bg-destructive/20 text-destructive'
                                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                            )}
                            aria-label={`Remove filter ${directive.rawToken}`}
                        >
                            <X className="h-2.5 w-2.5" />
                        </button>
                    </span>
                );
            })}
        </div>
    );
};
