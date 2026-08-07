import React from 'react';
import { ChevronDown, ChevronRight, Layers, X, Archive } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';
import { InteractiveRow } from './InteractiveRow';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface GroupRowProps {
    group: chrome.tabGroups.TabGroup;
    onClose?: (e: React.MouseEvent) => void;
    onArchive?: (e: React.MouseEvent) => void;
    isDragging?: boolean;
    isCenterHighlighted?: boolean;
    closestEdge?: 'top' | 'bottom' | null;
}

const GroupRowComponent = React.memo(({ group, onClose, onArchive, isDragging, isCenterHighlighted, closestEdge }: GroupRowProps) => {
    const colors = getGroupColorClasses(group.color);

    const handleToggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
    };

    return (
        <InteractiveRow
            size="sm"
            className={`${colors.row} ${isCenterHighlighted ? 'ring-1 ring-primary bg-primary/10' : ''}`}
            onClick={handleToggleCollapse}
            isDragging={isDragging}
            closestEdge={closestEdge}
        >
            {/* Leading: Collapse Icon & Color Badge */}
            <InteractiveRow.Leading>
                <span className={`opacity-70 group-hover:opacity-100 transition-opacity ${colors.text}`}>
                    {group.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </span>
                <div className={`w-2 h-2 rounded-full ${colors.badge}`} />
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
                    <TooltipSimple content="Save as Space">
                        <button
                            onClick={onArchive}
                            className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white ${colors.text}`}
                        >
                            <Archive className="w-3 h-3" />
                        </button>
                    </TooltipSimple>
                )}

                {onClose && (
                    <TooltipSimple content="Delete Group">
                        <button
                            onClick={onClose}
                            className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-white ${colors.text}`}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </TooltipSimple>
                )}
            </InteractiveRow.Actions>
        </InteractiveRow>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.isCenterHighlighted === nextProps.isCenterHighlighted &&
        prevProps.closestEdge === nextProps.closestEdge &&
        prevProps.group.id === nextProps.group.id &&
        prevProps.group.title === nextProps.group.title &&
        prevProps.group.color === nextProps.group.color &&
        prevProps.group.collapsed === nextProps.group.collapsed
    );
});

export const GroupRow = GroupRowComponent;
