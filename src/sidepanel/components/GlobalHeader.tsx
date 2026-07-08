import { useEffect, useCallback } from 'react';
import { Search, Settings, History, Plus } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/Tooltip';
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
        <TooltipProvider delayDuration={300}>
            <header className="h-12 flex items-center px-4 border-b border-border bg-background sticky top-0 z-10">

                <Tooltip>
                    <TooltipTrigger asChild>
                        <img
                            src="/icons/icon-48.png"
                            alt="TabBellus Logo"
                            className="w-5 h-5 mr-3 cursor-help flex-shrink-0"
                        />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        {currentSpace ? `Currently viewing: ${currentSpace.name}` : 'TabBellus Workstation'}
                    </TooltipContent>
                </Tooltip>

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
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={handleNewTab}
                            className="ml-2 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        New Tab (Alt+T)
                    </TooltipContent>
                </Tooltip>
                <button
                    onClick={toggleHistory}
                    className="ml-1 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                    title="Recently Closed"
                >
                    <History className="w-4 h-4" />
                </button>
                <button
                    onClick={() => setSettingsOpen(true)}
                    className="ml-1 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </header>
        </TooltipProvider>
    );
};
