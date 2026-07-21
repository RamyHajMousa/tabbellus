import React from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Plus, XCircle } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';

interface ActiveToolbarProps {
    tabs: chrome.tabs.Tab[];
    activeTabId?: number | null;
}

export const ActiveToolbar: React.FC<ActiveToolbarProps> = ({ tabs, activeTabId }) => {
    const handleGoBack = () => {
        if (activeTabId) {
            chrome.tabs.goBack(activeTabId).catch(() => { });
        }
    };

    const handleGoForward = () => {
        if (activeTabId) {
            chrome.tabs.goForward(activeTabId).catch(() => { });
        }
    };

    const handleReload = () => {
        if (activeTabId) {
            chrome.tabs.reload(activeTabId).catch(() => { });
        }
    };

    const handleNewTab = () => {
        chrome.tabs.create({ active: true });
    };

    const handleCloseUnpinned = () => {
        const unpinnedIds = tabs
            .filter((t) => !t.pinned && t.id !== undefined)
            .map((t) => t.id!);

        if (unpinnedIds.length > 0) {
            chrome.tabs.remove(unpinnedIds).catch(() => { });
        }
    };

    return (
        <div className="h-8 flex items-center justify-between px-3 bg-background border-b border-border flex-shrink-0 z-10 select-none">
            {/* Left Group Navigation */}
            <div className="flex items-center gap-0.5">
                <TooltipSimple content="Back" side="bottom">
                    <button
                        onClick={handleGoBack}
                        disabled={!activeTabId}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                        aria-label="Go back"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Forward" side="bottom">
                    <button
                        onClick={handleGoForward}
                        disabled={!activeTabId}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                        aria-label="Go forward"
                    >
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Reload" side="bottom">
                    <button
                        onClick={handleReload}
                        disabled={!activeTabId}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors"
                        aria-label="Reload tab"
                    >
                        <RotateCw className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>

            {/* Right Group Actions */}
            <div className="flex items-center gap-0.5">
                <TooltipSimple content="New Tab" side="bottom">
                    <button
                        onClick={handleNewTab}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        aria-label="Open new tab"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>

                <TooltipSimple content="Close All Unpinned" side="bottom">
                    <button
                        onClick={handleCloseUnpinned}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                        aria-label="Close all unpinned tabs"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>
        </div>
    );
};
