import { useEffect, useCallback } from 'react';
import { Search, Settings, History, Plus } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { useCurrentSpace } from '@/hooks/useCurrentSpace';

export const GlobalHeader = () => {
    const { setSearchOpen, setSettingsOpen, toggleHistory } = useUIStore();
    const currentSpace = useCurrentSpace();

    const handleNewTab = useCallback(() => {
        chrome.tabs.create({ active: true });
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && e.key.toLowerCase() === 't') {
                e.preventDefault();
                handleNewTab();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNewTab]);

    return (
        <header className="h-12 flex items-center px-4 border-b border-border bg-background sticky top-0 z-10">

            <TooltipSimple
                content={currentSpace ? `Currently viewing: ${currentSpace.name}` : 'TabBellus Workstation'}
                side="bottom"
            >
                <img
                    src="/icons/icon-48.png"
                    alt="TabBellus Logo"
                    className="w-5 h-5 mr-3 cursor-help flex-shrink-0"
                />
            </TooltipSimple>

            <button
                onClick={() => setSearchOpen(true)}
                className="relative flex-1 max-w-md h-8 flex items-center px-3 text-xs bg-muted hover:bg-accent border border-transparent hover:border-primary rounded-md transition-colors text-muted-foreground"
            >
                <Search className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="flex-1 text-left truncate">Search...</span>
                <span className="ml-2 px-1.5 py-0.5 bg-background border border-border rounded text-xxs font-medium flex-shrink-0">
                    ⌘K
                </span>
            </button>
            <TooltipSimple content="New Tab (Alt+T)" side="bottom">
                <button
                    onClick={handleNewTab}
                    aria-label="Create new tab"
                    className="ml-2 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </TooltipSimple>
            <TooltipSimple content="Recently Closed" side="bottom">
                <button
                    onClick={toggleHistory}
                    aria-label="Recently closed tabs history"
                    className="ml-1 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                    <History className="w-4 h-4" />
                </button>
            </TooltipSimple>
            <TooltipSimple content="Settings" side="bottom">
                <button
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Open settings"
                    className="ml-1 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </TooltipSimple>
        </header>
    );
};
