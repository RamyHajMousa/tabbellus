import React from 'react';
import { ChevronDown, ChevronRight, Layers, X, Archive } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';

interface GroupRowProps {
    group: chrome.tabGroups.TabGroup;
    onClose?: (e: React.MouseEvent) => void;
    onArchive?: (e: React.MouseEvent) => void;
}

export const GroupRow = React.memo(({ group, onClose, onArchive }: GroupRowProps) => {
    const colors = getGroupColorClasses(group.color);

    const handleToggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
    };

    return (
        <div
            className={`
                group flex items-center gap-2 h-7 px-2 -ml-2 rounded-md text-xs cursor-pointer select-none transition-colors mb-0.5
                ${colors.row}
            `}
            onClick={handleToggleCollapse}
        >
            {/* Collapse Icon */}
            <span className={`opacity-70 group-hover:opacity-100 transition-opacity ${colors.text}`}>
                {group.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>

            {/* Color Badge */}
            <div className={`w-2 h-2 rounded-full ${colors.badge} shadow-sm`} />

            {/* Title */}
            <span className={`font-semibold uppercase tracking-wider ${colors.text} truncate opacity-90 flex-1`}>
                {group.title || 'Untitled Group'}
            </span>

            {/* Actions: Collapse Icon (Visual) & Archive & Close Button */}
            <div className="flex items-center gap-1">
                {group.collapsed && !onArchive && !onClose && (
                    <Layers className={`w-3 h-3 opacity-50 ${colors.text}`} />
                )}

                {onArchive && (
                    <button
                        onClick={onArchive}
                        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white ${colors.text}`}
                        title="Save & Close (Archive)"
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
            </div>
        </div>
    );
});
