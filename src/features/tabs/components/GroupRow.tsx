import React from 'react';
import { ChevronDown, ChevronRight, Layers, X, Archive } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';
import { InteractiveRow } from './InteractiveRow';

interface GroupRowProps {
    group: chrome.tabGroups.TabGroup;
    onClose?: (e: React.MouseEvent) => void;
    onArchive?: (e: React.MouseEvent) => void;
}

const GroupRowComponent = React.memo(({ group, onClose, onArchive }: GroupRowProps) => {
    const colors = getGroupColorClasses(group.color);

    const handleToggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
    };

    return (
        <InteractiveRow
            size="sm"
            className={colors.row}
            onClick={handleToggleCollapse}
        >
            {/* Leading: Collapse Icon & Color Badge */}
            <InteractiveRow.Leading>
                <span className={`opacity-70 group-hover:opacity-100 transition-opacity ${colors.text}`}>
                    {group.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
                <div className={`w-2 h-2 rounded-full ${colors.badge} shadow-sm`} />
            </InteractiveRow.Leading>

            {/* Title */}
            <InteractiveRow.Title
                className={`font-semibold uppercase tracking-wider ${colors.text} truncate opacity-90`}
            >
                {group.title || 'Untitled Group'}
            </InteractiveRow.Title>

            {/* Actions */}
            <InteractiveRow.Actions
                className={`gap-1 pl-2 bg-background ${colors.row}`}
            >
                {group.collapsed && !onArchive && !onClose && (
                    <Layers className={`w-3 h-3 opacity-50 ${colors.text}`} />
                )}

                {onArchive && (
                    <button
                        onClick={onArchive}
                        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white ${colors.text}`}
                        title="Save as Space"
                    >
                        <Archive className="w-3 h-3" />
                    </button>
                )}

                {onClose && (
                    <button
                        onClick={onClose}
                        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-white ${colors.text}`}
                        title="Delete Group"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </InteractiveRow.Actions>
        </InteractiveRow>
    );
});

// ── GroupRow.Children ────────────────────────────────────────────────────

interface GroupRowChildrenProps extends React.HTMLAttributes<HTMLDivElement> {
    color: chrome.tabGroups.ColorEnum;
    isDraggingOver?: boolean;
    children: React.ReactNode;
}

export const GroupRowChildren = React.forwardRef<HTMLDivElement, GroupRowChildrenProps>(
    ({ color, isDraggingOver = false, children, className, ...props }, ref) => {
        const colors = getGroupColorClasses(color);
        return (
            <div
                ref={ref}
                className={`
                    pl-[14px] border-l-2 ml-2 space-y-0.5 mt-0.5 relative
                    ${colors.border}
                    ${isDraggingOver ? 'bg-accent/20' : ''}
                    ${className || ''}
                `}
                {...props}
            >
                {children}
            </div>
        );
    }
);

type GroupRowNamespace = typeof GroupRowComponent & {
    Children: typeof GroupRowChildren;
};

export const GroupRow = GroupRowComponent as GroupRowNamespace;
GroupRow.Children = GroupRowChildren;
