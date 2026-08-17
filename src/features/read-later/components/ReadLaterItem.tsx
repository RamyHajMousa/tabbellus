import React, { useCallback } from 'react';
import { Trash2, Check, Copy, Archive, FolderPlus, ExternalLink } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { SmartFallbackIcon } from '@/components/ui/SmartFallbackIcon';
import type { ReadLaterItem as ReadLaterItemType } from '@/lib/db';

export interface ReadLaterItemProps {
    item: ReadLaterItemType;
    onToggleStatus: (id: number, status: ReadLaterItemType['status']) => void;
    onDelete: (id: number) => void;
    onOpen: (url: string, id: number) => void;
    onSendToSpace: (item: ReadLaterItemType) => void;
}

const ReadLaterItemComponent: React.FC<ReadLaterItemProps> = ({ item, onToggleStatus, onDelete, onOpen, onSendToSpace }) => {
    const { copy } = useClipboard();

    const handleCopy = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        copy(item.url);
    }, [copy, item.url]);

    const handleOpen = useCallback(() => {
        if (item.id) onOpen(item.url, item.id);
    }, [item.url, item.id, onOpen]);

    const handleToggle = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (item.id) onToggleStatus(item.id, item.status);
    }, [item.id, item.status, onToggleStatus]);

    const handleDelete = useCallback(() => {
        if (item.id) onDelete(item.id);
    }, [item.id, onDelete]);

    const handleSendToSpace = useCallback(() => {
        onSendToSpace(item);
    }, [item, onSendToSpace]);

    const host = (() => {
        try {
            return new URL(item.url).hostname;
        } catch {
            return '';
        }
    })();

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <InteractiveRow
                    size="md"
                    onClick={handleOpen}
                >
                    {/* Checkbox & Favicon */}
                    <InteractiveRow.Leading>
                        <TooltipSimple content={item.status === 'unread' ? "Send to Archive" : "Move to Unread"} side="top">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggle();
                                }}
                                className={`
                                    flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-200
                                    ${item.status === 'archived'
                                        ? 'bg-primary border-primary text-primary-foreground'
                                        : 'border-border hover:border-primary text-transparent'
                                    }
                                `}
                                aria-label={item.status === 'unread' ? "Send to Archive" : "Move to Unread"}
                            >
                                {item.status === 'archived' && <Check className="w-2.5 h-2.5" />}
                            </button>
                        </TooltipSimple>
                        <SmartFallbackIcon url={item.url} favicon={item.favicon} className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
                    </InteractiveRow.Leading>

                    {/* Title / Info */}
                    <InteractiveRow.Title
                        subTitle={(
                            <span className="text-xxs text-muted-foreground">
                                {host} • {new Date(item.addedAt).toLocaleDateString()}
                            </span>
                        )}
                    >
                        <span className={item.status === 'archived' ? 'text-muted-foreground line-through' : 'text-foreground'}>
                            {item.title || item.url}
                        </span>
                    </InteractiveRow.Title>

                    {/* Actions */}
                    <InteractiveRow.Actions className="bg-background group-hover:bg-accent gap-0.5 px-1 py-0.5">
                        <TooltipSimple content="Delete Item" side="top">
                            <InteractiveRow.Action
                                icon={Trash2}
                                onClick={handleDelete}
                                variant="destructive"
                            />
                        </TooltipSimple>
                    </InteractiveRow.Actions>
                </InteractiveRow>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <ContextMenuItem onClick={handleOpen}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in New Tab
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleToggle()}>
                    <Archive className="mr-2 h-4 w-4" />
                    {item.status === 'unread' ? 'Send to Archive' : 'Move to Unread'}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleSendToSpace}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    Send to Space...
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleCopy()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy URL
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

/**
 * Custom arePropsEqual comparator for React.memo to prevent unnecessary
 * re-renders in virtualized scroll lists. Compares item primitive fields
 * and callback reference equality.
 */
function arePropsEqual(prev: ReadLaterItemProps, next: ReadLaterItemProps): boolean {
    return (
        prev.item.id === next.item.id &&
        prev.item.url === next.item.url &&
        prev.item.title === next.item.title &&
        prev.item.status === next.item.status &&
        prev.item.favicon === next.item.favicon &&
        prev.item.addedAt === next.item.addedAt &&
        prev.onToggleStatus === next.onToggleStatus &&
        prev.onDelete === next.onDelete &&
        prev.onOpen === next.onOpen &&
        prev.onSendToSpace === next.onSendToSpace
    );
}

export const ReadLaterItem = React.memo(ReadLaterItemComponent, arePropsEqual);
