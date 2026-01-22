import React from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';

interface GroupRowProps {
    group: chrome.tabGroups.TabGroup;
}

export const GroupRow = React.memo(({ group }: GroupRowProps) => {
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
            <span className={`font-semibold uppercase tracking-wider ${colors.text} truncate opacity-90`}>
                {group.title || 'Untitled Group'}
            </span>

            {/* Optional: Add badge for child count if needed, but we rely on visuals */}
            {group.collapsed && (
                <Layers className={`ml-auto w-3 h-3 opacity-50 ${colors.text}`} />
            )}
        </div>
    );
});
