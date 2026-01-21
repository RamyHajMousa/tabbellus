import React from 'react';
import { Globe, X, Clock } from 'lucide-react';
import { type Tab, tabService } from '@/lib';

interface TabRowProps {
    tab: Tab | chrome.tabs.Tab; // Accept both our DB Type and Chrome Type
    isActive?: boolean;
    onClose?: (e: React.MouseEvent) => void;
    onReadLater?: (e: React.MouseEvent) => void;
}

export const TabRow = React.memo(({ tab, isActive, onClose, onReadLater }: TabRowProps) => {
    return (
        <div
            className={`
                group flex items-center gap-2 py-1.5 px-2 -ml-2 rounded-md text-sm cursor-pointer transition-all duration-200 border-l-2
                ${isActive
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-100'
                    : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50 border-transparent hover:border-primary/50'
                }
            `}
            onClick={(e) => {
                e.stopPropagation();
                // Check if it's a DB Tab (has spaceId)
                if ('spaceId' in tab) {
                    tabService.focusOrCreate(tab.url || '').catch(() => { });
                }
                // Otherwise treat as a live Chrome Tab
                else if ((tab as chrome.tabs.Tab).id) {
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

            <span className="truncate flex-1">{tab.title || tab.url}</span>

            {/* Hover Actions */}
            {(onClose || onReadLater) && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onReadLater && (
                        <button
                            onClick={onReadLater}
                            className="p-1 rounded hover:bg-zinc-700 text-muted-foreground hover:text-indigo-400 transition-colors"
                            title="Read Later"
                        >
                            <Clock className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1 rounded hover:bg-zinc-700 text-muted-foreground hover:text-red-400 transition-colors"
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
