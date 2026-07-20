import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Archive, CheckCircle2, Globe, Check, Copy, Clock } from 'lucide-react';
import { tabService, readLaterService } from '@/lib';
import { useClipboard } from '@/hooks/useClipboard';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';

export const ReadLaterList = () => {
    const [showArchived, setShowArchived] = useState(false);

    const items = useLiveQuery(
        readLaterService.getItemsByStatusQuery(showArchived ? 'archived' : 'unread'),
        [showArchived]
    );

    const { deleteWithUndo: deleteItem } = useUndoDelete({
        fetch: (id) => readLaterService.getItemById(id),
        delete: (id) => readLaterService.deleteItem(id),
        restore: (item) => readLaterService.restoreItem(item),
    });

    const toggleStatus = async (id: number, currentStatus: string) => {
        const newStatus = currentStatus === 'unread' ? 'archived' : 'unread';
        await readLaterService.updateStatus(id, newStatus);
    };

    const handleDelete = async (id: number) => {
        await deleteItem(id, "Item deleted");
    };

    const handleOpen = async (url: string) => {
        await tabService.focusOrCreate(url);
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header / Filter Toggle */}
            <div className="p-4 border-b border-border flex-shrink-0">
                <div className="flex bg-muted p-1 rounded-lg">
                    <button
                        onClick={() => setShowArchived(false)}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${!showArchived ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Unread
                    </button>
                    <button
                        onClick={() => setShowArchived(true)}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${showArchived ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Archived
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {items?.map((item) => (
                    <ReadLaterItem
                        key={item.id}
                        item={item}
                        toggleStatus={toggleStatus}
                        handleDelete={handleDelete}
                        handleOpen={handleOpen}
                    />
                ))}

                {items?.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-center px-8">
                        {showArchived ? (
                            <Archive className="w-8 h-8 text-muted-foreground/20 mb-3" />
                        ) : (
                            <CheckCircle2 className="w-8 h-8 text-muted-foreground/20 mb-3" />
                        )}
                        <p className="text-sm text-muted-foreground">
                            {showArchived ? "No archived items yet" : "You're all caught up"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Extracted for clean hook usage
const ReadLaterItem = ({ item, toggleStatus, handleDelete, handleOpen }: any) => {
    const { copy } = useClipboard();

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        copy(item.url);
    };

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
                    onClick={() => handleOpen(item.url)}
                >
                    {/* Checkbox & Favicon */}
                    <InteractiveRow.Leading>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (item.id) toggleStatus(item.id, item.status);
                            }}
                            className={`
                                flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-200
                                ${item.status === 'archived'
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-border hover:border-primary text-transparent'
                                }
                            `}
                            title={item.status === 'unread' ? "Mark as Read" : "Mark as Unread"}
                        >
                            {item.status === 'archived' && <Check className="w-2.5 h-2.5" />}
                        </button>
                        {item.favicon ? (
                            <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded-sm" />
                        ) : (
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
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
                        <InteractiveRow.Action
                            icon={Trash2}
                            onClick={() => {
                                if (item.id) handleDelete(item.id);
                            }}
                            title="Delete"
                            variant="destructive"
                        />
                    </InteractiveRow.Actions>
                </InteractiveRow>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={() => handleOpen(item.url)}>
                    <Globe className="mr-2 h-4 w-4" />
                    Open
                </ContextMenuItem>
                <ContextMenuItem onClick={handleCopy}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy URL
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => item.id && toggleStatus(item.id, item.status)}>
                    <Clock className="mr-2 h-4 w-4" />
                    {item.status === 'unread' ? 'Mark as Read' : 'Mark as Unread'}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                    onClick={() => item.id && handleDelete(item.id)}
                    className="text-destructive focus:text-destructive"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};
