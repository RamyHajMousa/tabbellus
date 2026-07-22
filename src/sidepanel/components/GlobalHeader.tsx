import { Search, Settings, History, Library } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { BookmarkPopoverContent } from '@/features/bookmarks/BookmarkPopoverContent';

export const GlobalHeader = () => {
    const { setSearchOpen, setSettingsOpen, toggleHistory } = useUIStore();

    return (
        <header className="h-12 flex items-center px-4 border-b border-border bg-background sticky top-0 z-10">
            <button
                onClick={() => setSearchOpen(true)}
                className="relative flex-1 h-8 flex items-center px-3 text-xs bg-muted hover:bg-accent border border-transparent hover:border-primary rounded-md transition-colors text-muted-foreground"
            >
                <Search className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="flex-1 text-left truncate">Search...</span>
                <span className="ml-2 px-1.5 py-0.5 bg-background border border-border rounded text-xxs font-medium flex-shrink-0">
                    ⌘K
                </span>
            </button>

            <Popover>
                <TooltipSimple content="Bookmarks" side="bottom">
                    <PopoverTrigger asChild>
                        <button
                            aria-label="Bookmarks library"
                            className="ml-2 p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                        >
                            <Library className="w-4 h-4" />
                        </button>
                    </PopoverTrigger>
                </TooltipSimple>
                <PopoverContent align="end" className="w-80 p-2">
                    <div className="text-xs font-semibold px-2 py-1.5 border-b border-border mb-1 text-foreground">
                        Bookmarks
                    </div>
                    <BookmarkPopoverContent />
                </PopoverContent>
            </Popover>

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
