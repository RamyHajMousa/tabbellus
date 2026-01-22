import React from 'react';
import { Globe, X, Clock, Trash2 } from 'lucide-react';
import { type Tab, tabService } from '@/lib';

interface TabRowProps {
    tab: Tab | chrome.tabs.Tab; // Accept both our DB Type and Chrome Type
    isActive?: boolean;
    onClose?: (e: React.MouseEvent) => void;
    onReadLater?: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
}

export const TabRow = React.memo(({ tab, isActive, onClose, onReadLater, onDelete }: TabRowProps) => {
    return (
        <div
            className={`
                group flex items-center gap-2 h-9 px-2 rounded-md transition-colors cursor-pointer text-sm
                ${isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                }
            `}
            onClick={(e) => {
                e.stopPropagation();
                if ('spaceId' in tab) {
                    tabService.focusOrCreate(tab.url || '').catch(() => { });
                } else if ((tab as chrome.tabs.Tab).id) {
                    chrome.tabs.update((tab as chrome.tabs.Tab).id!, { active: true }).catch(() => { });
                }
            }}
        >
            {(tab as any).favIconUrl || (tab as any).favicon ? (
                <img
                    src={(tab as any).favIconUrl || (tab as any).favicon}
                    alt=""
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                />
            ) : null}
            <Globe className={`w-4 h-4 opacity-50 flex-shrink-0 ${(tab as any).favIconUrl || (tab as any).favicon ? 'hidden' : ''}`} />

            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className={`truncate font-medium leading-none ${isActive ? 'text-foreground' : 'text-foreground/90'}`}>
                    {tab.title || tab.url}
                </span>
                <span className="truncate text-[10px] text-muted-foreground/70 leading-none mt-0.5">
                    {tryParseHost(tab.url || '')}
                </span>
            </div>

            {/* Hover Actions */}
            {(onClose || onReadLater || onDelete) && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onReadLater && (
                        <button
                            onClick={onReadLater}
                            className="p-1 rounded-sm hover:bg-background text-muted-foreground hover:text-primary transition-colors focus:opacity-100"
                            title="Read Later"
                        >
                            <Clock className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            className="p-1 rounded-sm hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors focus:opacity-100"
                            title="Delete Tab from Space"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded-sm hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors focus:opacity-100"
                            title="Close Tab"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});

function tryParseHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}
