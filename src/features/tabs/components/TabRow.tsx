import React from 'react';
import { Globe, X, Clock, Trash2, Copy, Check } from 'lucide-react';
import { type Tab, tabService } from '@/lib';
import { useClipboard } from '@/hooks/useClipboard';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/Tooltip';
import { AddToSpaceMenu } from '@/features/spaces/components/AddToSpaceMenu';

interface TabRowProps {
    tab: Tab | chrome.tabs.Tab; // Accept both our DB Type and Chrome Type
    isActive?: boolean;
    onClose?: (e: React.MouseEvent) => void;
    onReadLater?: (e: React.MouseEvent) => void;
    onDelete?: (e: React.MouseEvent) => void;
}

export const TabRow = React.memo(({ tab, isActive, onClose, onReadLater, onDelete }: TabRowProps) => {
    const { hasCopied, copy } = useClipboard();
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    const isChromeTab = (t: any): t is chrome.tabs.Tab => 'windowId' in t;
    const canAddToSpace = isChromeTab(tab);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (tab.url) {
            copy(tab.url);
        }
    };

    return (
        <div
            className={`
                relative group flex items-center gap-2 h-9 px-2 rounded-md transition-colors cursor-pointer text-sm
                ${isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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

            <div className="flex-1 min-w-0 pr-4 flex flex-col justify-center">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span ref={titleRef} className={`truncate font-medium leading-none ${isActive ? 'text-foreground' : 'text-foreground/90'}`}>
                                {tab.title || tab.url}
                            </span>
                        </TooltipTrigger>
                        {isTruncated && (
                            <TooltipContent side="top">
                                {tab.title || tab.url}
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
                <span className="truncate text-[10px] text-muted-foreground/70 leading-none mt-0.5">
                    {tryParseHost(tab.url || '')}
                </span>
            </div>

            {/* Hover Actions */}
            <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1 py-0.5 pl-2 rounded-md transition-all z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 ${isActive ? 'bg-accent' : 'bg-background group-hover:bg-accent'}`}>
                {/* Copy URL */}
                {tab.url && (
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-blue-500 transition-colors focus:opacity-100"
                        title="Copy URL"
                    >
                        {hasCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                )}

                {/* Add To Space (Only for Active Tabs) */}
                {canAddToSpace && (
                    <AddToSpaceMenu tab={tab} />
                )}

                {onReadLater && (
                    <button
                        onClick={onReadLater}
                        className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-primary transition-colors focus:opacity-100"
                        title="Read Later"
                    >
                        <Clock className="w-4 h-4" />
                    </button>
                )}
                {onDelete && (
                    <button
                        onClick={onDelete}
                        className="p-1.5 rounded-md hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors focus:opacity-100"
                        title="Delete Tab from Space"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition-colors focus:opacity-100"
                        title="Close Tab"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

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
