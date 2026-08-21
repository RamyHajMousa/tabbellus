import React from 'react';
import { cn } from '@/lib/utils';

interface SearchSectionHeaderProps {
    title: string;
    count?: number;
    className?: string;
}

export const SearchSectionHeader: React.FC<SearchSectionHeaderProps> = ({
    title,
    count,
    className,
}) => {
    return (
        <div
            className={cn(
                'flex items-center justify-between px-2 py-1.5 text-xxs font-semibold uppercase tracking-wider text-muted-foreground/80',
                className
            )}
        >
            <span>{title}</span>
            {count !== undefined && (
                <span className="text-xxs font-mono text-muted-foreground/60">{count}</span>
            )}
        </div>
    );
};
