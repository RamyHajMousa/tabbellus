import React from 'react';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/Tooltip';

interface InteractiveRowProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: 'sm' | 'md';
    isActive?: boolean;
    isDragging?: boolean;
    children: React.ReactNode;
}

const InteractiveRowRoot = React.forwardRef<HTMLDivElement, InteractiveRowProps>(
    ({ size = 'md', isActive = false, isDragging = false, children, className, ...props }, ref) => {
        const sizeClasses = size === 'md'
            ? 'h-9 text-sm'
            : 'h-7 text-xs -ml-2 mb-0.5';

        const activeClasses = isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground';

        const draggingClasses = isDragging
            ? 'opacity-50 ring-1 ring-primary/40 shadow-lg'
            : '';

        return (
            <div
                ref={ref}
                className={`
                    relative group flex items-center gap-2 px-2 rounded-md transition-colors cursor-pointer select-none
                    ${sizeClasses}
                    ${activeClasses}
                    ${draggingClasses}
                    ${className || ''}
                `}
                {...props}
            >
                {children}
            </div>
        );
    }
);

// ── InteractiveRow.Leading ───────────────────────────────────────────────

export const InteractiveRowLeading: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className
}) => {
    return (
        <div className={`flex items-center gap-2 flex-shrink-0 ${className || ''}`}>
            {children}
        </div>
    );
};

// ── InteractiveRow.Title ─────────────────────────────────────────────────

export const InteractiveRowTitle: React.FC<{
    children: React.ReactNode;
    subTitle?: React.ReactNode;
    className?: string;
}> = ({ children, subTitle, className }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    return (
        <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            ref={titleRef}
                            className={`truncate font-medium leading-none ${className || ''}`}
                        >
                            {children}
                        </span>
                    </TooltipTrigger>
                    {isTruncated && (
                        <TooltipContent side="top">
                            {children}
                        </TooltipContent>
                    )}
                </Tooltip>
            </TooltipProvider>
            {subTitle}
        </div>
    );
};

// ── InteractiveRow.Actions ───────────────────────────────────────────────

export const InteractiveRowActions: React.FC<{ children: React.ReactNode; className?: string }> = ({
    children,
    className
}) => {
    return (
        <div
            className={`
                absolute right-2 top-1/2 -translate-y-1/2 flex items-center rounded-md transition-all z-10
                opacity-0 group-hover:opacity-100 focus-within:opacity-100
                ${className || ''}
            `}
        >
            {children}
        </div>
    );
};

// Attach sub-components to InteractiveRow namespace
type InteractiveRowComponent = typeof InteractiveRowRoot & {
    Leading: typeof InteractiveRowLeading;
    Title: typeof InteractiveRowTitle;
    Actions: typeof InteractiveRowActions;
};

export const InteractiveRow = InteractiveRowRoot as InteractiveRowComponent;
InteractiveRow.Leading = InteractiveRowLeading;
InteractiveRow.Title = InteractiveRowTitle;
InteractiveRow.Actions = InteractiveRowActions;
