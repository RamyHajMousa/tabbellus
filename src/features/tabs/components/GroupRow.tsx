import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Layers, X, Archive, FolderOutput, Copy, FolderPlus, Trash2, Pencil } from 'lucide-react';
import { getGroupColorClasses } from '@/lib/colors';
import { InteractiveRow } from './InteractiveRow';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { useClipboard } from '@/hooks/useClipboard';
import { SpaceSelectorModal } from '@/features/spaces/components/SpaceSelectorModal';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';

interface GroupRowProps {
    group: chrome.tabGroups.TabGroup;
    groupTabs?: chrome.tabs.Tab[];
    onClose?: (e: React.MouseEvent) => void;
    onArchive?: (e: React.MouseEvent) => void;
    isDragging?: boolean;
    isCenterHighlighted?: boolean;
    closestEdge?: 'top' | 'bottom' | null;
}

const CHROME_GROUP_COLORS: chrome.tabGroups.ColorEnum[] = [
    'grey',
    'blue',
    'red',
    'yellow',
    'green',
    'pink',
    'purple',
    'cyan',
    'orange',
];

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
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [newTitle, setNewTitle] = useState(group.title || '');
    const [newColor, setNewColor] = useState<chrome.tabGroups.ColorEnum>(group.color);
    const [isSpaceSelectorOpen, setIsSpaceSelectorOpen] = useState(false);

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


    const handleSaveGroupAsSpace = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onArchive) {
            onArchive(e);
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

    const handleRenameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsRenameOpen(false);
        setTimeout(() => {
            document.body.style.pointerEvents = '';
        }, 100);

        try {
            await chrome.tabGroups.update(group.id, {
                title: newTitle.trim(),
                color: newColor,
            });
        } catch (err) {
            console.error('Failed to update tab group:', err);
        }
    };

    return (
        <>
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
                                <TooltipSimple content="Save Group as Space">
                                    <button
                                        onClick={handleSaveGroupAsSpace}
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
                    <ContextMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setNewTitle(group.title || '');
                            setNewColor(group.color);
                            setTimeout(() => {
                                setIsRenameOpen(true);
                            }, 50);
                        }}
                    >
                        <Pencil className="w-4 h-4 mr-2 text-muted-foreground" />
                        Rename Group
                    </ContextMenuItem>

                    <ContextMenuItem onClick={handleUngroup} disabled={childTabIds.length === 0}>
                        <FolderOutput className="w-4 h-4 mr-2 text-muted-foreground" />
                        Ungroup Tabs
                    </ContextMenuItem>

                    <ContextMenuSeparator />

                    <ContextMenuItem onClick={handleCopyUrls} disabled={groupTabs.length === 0}>
                        <Copy className="w-4 h-4 mr-2 text-muted-foreground" />
                        Copy URLs
                    </ContextMenuItem>

                    {onArchive && (
                        <ContextMenuItem onClick={handleSaveGroupAsSpace} disabled={groupTabs.length === 0}>
                            <Archive className="w-4 h-4 mr-2 text-muted-foreground" />
                            Save Group as Space
                        </ContextMenuItem>
                    )}

                    <ContextMenuItem 
                        onSelect={(e) => {
                            e.preventDefault();
                            if (groupTabs.length > 0) {
                                setTimeout(() => {
                                    setIsSpaceSelectorOpen(true);
                                }, 50);
                            }
                        }} 
                        disabled={groupTabs.length === 0}
                    >
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

            {isRenameOpen && (
                <Dialog open={isRenameOpen} onOpenChange={(val) => {
                    setIsRenameOpen(val);
                    if (!val) {
                        setTimeout(() => {
                            document.body.style.pointerEvents = '';
                        }, 100);
                    }
                }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Edit Tab Group</DialogTitle>
                            <DialogDescription className="sr-only">
                                Edit title and color for this tab group
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleRenameSubmit} className="space-y-4 pt-2">
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="Group title..."
                                className="w-full h-8 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                autoFocus
                            />
                            
                            <div className="flex flex-wrap gap-2 pt-1">
                                {CHROME_GROUP_COLORS.map((c) => {
                                    const colorMeta = getGroupColorClasses(c);
                                    const isSelected = newColor === c;
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setNewColor(c)}
                                            className={`w-6 h-6 rounded-full transition-all ${colorMeta.badge} ${
                                                isSelected
                                                    ? 'ring-2 ring-offset-2 ring-primary scale-110'
                                                    : 'hover:scale-105 opacity-80 hover:opacity-100'
                                            }`}
                                            aria-label={`Select color ${c}`}
                                        />
                                    );
                                })}
                            </div>

                            <DialogFooter className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsRenameOpen(false)}
                                    className="h-8 px-3 rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors"
                                >
                                    Save
                                </button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            )}

            {isSpaceSelectorOpen && (
                <SpaceSelectorModal
                    isOpen={isSpaceSelectorOpen}
                    onClose={() => setIsSpaceSelectorOpen(false)}
                    mode="group-save"
                    groupTabs={groupTabs}
                />
            )}
        </>
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
