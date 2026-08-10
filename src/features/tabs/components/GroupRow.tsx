import React from 'react';
import { ChevronDown, ChevronRight, Layers, X, Archive, FolderOutput, Copy, FolderPlus, Trash2 } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';
import { InteractiveRow } from './InteractiveRow';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { useClipboard } from '@/hooks/useClipboard';
import { spaceService } from '@/lib/spaceService';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface GroupRowProps {
    group: chrome.tabGroups.TabGroup;
    groupTabs?: chrome.tabs.Tab[];
    onClose?: (e: React.MouseEvent) => void;
    onArchive?: (e: React.MouseEvent) => void;
    isDragging?: boolean;
    isCenterHighlighted?: boolean;
    closestEdge?: 'top' | 'bottom' | null;
}

const GroupRowComponent = React.memo(({
    group,
    groupTabs = [],
    onClose,
    onArchive,
    isDragging,
    isCenterHighlighted,
    closestEdge
}: GroupRowProps) => {
    const colors = getGroupColorClasses(group.color);
    const { copy } = useClipboard();

    const handleToggleCollapse = (e: React.MouseEvent) => {
        e.stopPropagation();
        chrome.tabGroups.update(group.id, { collapsed: !group.collapsed });
    };

    const childTabIds = groupTabs
        .map(t => t.id)
        .filter((id): id is number => id !== undefined);

    const handleUngroup = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (childTabIds.length > 0) {
            chrome.tabs.ungroup(childTabIds).catch(() => {});
        }
    };

    const handleCopyUrls = (e: React.MouseEvent) => {
        e.stopPropagation();
        const urls = groupTabs
            .map(t => t.url)
            .filter(Boolean)
            .join('\n');
        if (urls) {
            copy(urls);
        }
    };

    const handleSaveGroupToSpace = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onArchive) {
            onArchive(e);
        } else if (groupTabs.length > 0) {
            spaceService.createSpaceFromTabs(group.title || 'Untitled Group', groupTabs);
        }
    };

    const handleCloseGroup = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onClose) {
            onClose(e);
        } else if (childTabIds.length > 0) {
            chrome.tabs.remove(childTabIds).catch(() => {});
        }
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
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
            </ContextMenuTrigger>

            <ContextMenuContent className="w-52">
                <ContextMenuItem onClick={handleUngroup} disabled={childTabIds.length === 0}>
                    <FolderOutput className="w-4 h-4 mr-2 text-muted-foreground" />
                    Ungroup Tabs
                </ContextMenuItem>

                <ContextMenuSeparator />

                <ContextMenuItem onClick={handleCopyUrls} disabled={groupTabs.length === 0}>
                    <Copy className="w-4 h-4 mr-2 text-muted-foreground" />
                    Copy URLs
                </ContextMenuItem>

                <ContextMenuItem onClick={handleSaveGroupToSpace} disabled={groupTabs.length === 0}>
                    <FolderPlus className="w-4 h-4 mr-2 text-muted-foreground" />
                    Save Group to Space
                </ContextMenuItem>

                <ContextMenuSeparator />

                <ContextMenuItem
                    onClick={handleCloseGroup}
                    className="text-destructive focus:text-destructive"
                    disabled={childTabIds.length === 0}
                >
                    <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                    Close Group
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.isCenterHighlighted === nextProps.isCenterHighlighted &&
        prevProps.closestEdge === nextProps.closestEdge &&
        prevProps.group.id === nextProps.group.id &&
        prevProps.group.title === nextProps.group.title &&
        prevProps.group.color === nextProps.group.color &&
        prevProps.group.collapsed === nextProps.group.collapsed &&
        prevProps.groupTabs?.length === nextProps.groupTabs?.length
    );
});

export const GroupRow = GroupRowComponent;
