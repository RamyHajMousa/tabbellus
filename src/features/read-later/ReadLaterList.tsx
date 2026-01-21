import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Archive, CheckCircle2, Globe, Check } from 'lucide-react';
import { db, tabService } from '@/lib';

export const ReadLaterList = () => {
    const [showArchived, setShowArchived] = useState(false);

    const items = useLiveQuery(
        () => db.readLater
            .where('status')
            .equals(showArchived ? 'archived' : 'unread')
            .reverse() // Newest first
            .sortBy('addedAt'),
        [showArchived]
    );

    const toggleStatus = async (id: number, currentStatus: string) => {
        const newStatus = currentStatus === 'unread' ? 'archived' : 'unread';
        await db.readLater.update(id, { status: newStatus });
    };

    const handleDelete = async (id: number) => {
        await db.readLater.delete(id);
    };

    const handleOpen = async (url: string) => {
        await tabService.focusOrCreate(url);
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header / Filter Toggle */}
            <div className="p-4 border-b border-border/40 flex-shrink-0">
                <div className="flex bg-muted/50 p-1 rounded-lg">
                    <button
                        onClick={() => setShowArchived(false)}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${!showArchived ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Unread
                    </button>
                    <button
                        onClick={() => setShowArchived(true)}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${showArchived ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Archived
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {items?.map((item) => (
                    <div
                        key={item.id}
                        className="group flex items-center gap-3 p-2 rounded-md hover:bg-muted/40 border border-transparent hover:border-border/30 transition-all"
                    >
                        {/* Checkbox */}
                        <button
                            onClick={() => item.id && toggleStatus(item.id, item.status)}
                            className={`
                                flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-200
                                ${item.status === 'archived'
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-muted-foreground/30 hover:border-primary/50 text-transparent'
                                }
                            `}
                            title={item.status === 'unread' ? "Mark as Read" : "Mark as Unread"}
                        >
                            {item.status === 'archived' && <Check className="w-3 h-3" />}
                        </button>

                        {/* Content */}
                        <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => handleOpen(item.url)}
                        >
                            <div className="flex items-center gap-2">
                                {item.favicon ? (
                                    <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded-sm opacity-80" />
                                ) : (
                                    <Globe className="w-3.5 h-3.5 text-muted-foreground opacity-50" />
                                )}
                                <span className={`text-sm truncate transition-colors ${item.status === 'archived' ? 'text-muted-foreground line-through decoration-zinc-500/30' : 'text-foreground'}`}>
                                    {item.title || item.url}
                                </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground/50 mt-0.5 ml-0.5 truncate max-w-[90%]">
                                {new URL(item.url).hostname} • {new Date(item.addedAt).toLocaleDateString()}
                            </div>
                        </div>

                        {/* Actions */}
                        <button
                            onClick={() => item.id && handleDelete(item.id)}
                            className="p-1.5 text-muted-foreground/0 group-hover:text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-all opacity-0 group-hover:opacity-100"
                            title="Delete"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
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
