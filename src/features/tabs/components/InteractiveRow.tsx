import React from 'react';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import { TooltipOverflow } from '@/components/ui/Tooltip';

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
            ? 'opacity-50 ring-1 ring-primary'
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
InteractiveRowRoot.displayName = 'InteractiveRow';

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
InteractiveRowLeading.displayName = 'InteractiveRow.Leading';

// Helper to extract plain text string from React children to prevent inner color-override classes
// (like text-foreground) from rendering text invisible inside the tooltip popover container.
function getTextFromChildren(children: React.ReactNode): string {
    if (children === null || children === undefined) {
        return '';
    }
    if (typeof children === 'string' || typeof children === 'number' || typeof children === 'boolean') {
        return children.toString();
    }
    if (Array.isArray(children)) {
        return children.map(getTextFromChildren).join('');
    }
    if (React.isValidElement(children)) {
        return getTextFromChildren((children as React.ReactElement<any>).props.children);
    }
    return '';
}

// ── InteractiveRow.Title ─────────────────────────────────────────────────

export const InteractiveRowTitle: React.FC<{
    children: React.ReactNode;
    subTitle?: React.ReactNode;
    className?: string;
}> = ({ children, subTitle, className }) => {
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    return (
        <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
            <TooltipOverflow
                text={getTextFromChildren(children)}
                isTruncated={isTruncated}
                side="top"
            >
                <span
                    ref={titleRef}
                    className={`truncate font-medium leading-none ${className || ''}`}
                >
                    {children}
                </span>
            </TooltipOverflow>
            {subTitle}
        </div>
    );
};
InteractiveRowTitle.displayName = 'InteractiveRow.Title';

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
InteractiveRowActions.displayName = 'InteractiveRow.Actions';

// ── InteractiveRow.Action ────────────────────────────────────────────────

export interface InteractiveRowActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    variant?: 'neutral' | 'destructive' | 'primary';
}

export const InteractiveRowAction = React.forwardRef<HTMLButtonElement, InteractiveRowActionProps>(
    ({ icon: Icon, onClick, title, variant = 'neutral', className = '', ...props }, ref) => {
        const variantClasses = {
            neutral: 'text-muted-foreground hover:text-foreground hover:bg-muted',
            destructive: 'text-muted-foreground hover:text-destructive-foreground hover:bg-destructive',
            primary: 'text-muted-foreground hover:text-primary-foreground hover:bg-primary',
        }[variant];

        return (
            <button
                ref={ref}
                onClick={(e) => {
                    e.stopPropagation();
                    onClick?.(e);
                }}
                className={`
                    flex items-center justify-center w-6 h-6 rounded-md transition-colors duration-150 outline-none shrink-0
                    ${variantClasses}
                    ${className}
                `}
                title={title}
                {...props}
            >
                <Icon className="w-3.5 h-3.5 shrink-0" />
            </button>
        );
    }
);
InteractiveRowAction.displayName = 'InteractiveRow.Action';

// Attach sub-components to InteractiveRow namespace
type InteractiveRowComponent = typeof InteractiveRowRoot & {
    Leading: typeof InteractiveRowLeading;
    Title: typeof InteractiveRowTitle;
    Actions: typeof InteractiveRowActions;
    Action: typeof InteractiveRowAction;
};

export const InteractiveRow = InteractiveRowRoot as InteractiveRowComponent;
InteractiveRow.Leading = InteractiveRowLeading;
InteractiveRow.Title = InteractiveRowTitle;
InteractiveRow.Actions = InteractiveRowActions;
InteractiveRow.Action = InteractiveRowAction;
