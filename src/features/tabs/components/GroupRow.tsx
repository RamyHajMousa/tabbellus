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
            className="group flex items-center gap-2 py-1.5 px-2 -ml-2 rounded-md text-sm cursor-pointer hover:bg-zinc-800/50 transition-all select-none"
            onClick={handleToggleCollapse}
        >
            {/* Collapse Icon */}
            <span className="text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity">
                {group.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </span>

            {/* Color Badge */}
            <div className={`w-3 h-3 rounded-full ${colors.bg} border ${colors.border} shadow-sm`} />

            {/* Title */}
            <span className={`font-medium ${colors.text} truncate opacity-90`}>
                {group.title || 'Untitled Group'}
            </span>

            {/* Optional: Add badge for child count if needed, but we rely on visuals */}
            {group.collapsed && (
                <Layers className="ml-auto w-3 h-3 text-muted-foreground opacity-30" />
            )}
        </div>
    );
});
