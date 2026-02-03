import { Search, Settings } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';

export const GlobalHeader = () => {
    const setSearchOpen = useUIStore((state) => state.setSearchOpen);

    return (
        <header className="h-12 flex items-center px-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <button
                onClick={() => setSearchOpen(true)}
                className="relative flex-1 max-w-md h-8 flex items-center px-3 text-xs bg-muted/50 hover:bg-muted/80 border border-transparent hover:border-primary/20 rounded-md transition-all text-muted-foreground/50"
            >
                <Search className="w-4 h-4 mr-2" />
                <span className="flex-1 text-left">Search...</span>
                <span className="ml-2 px-1.5 py-0.5 bg-background/80 border border-border/50 rounded text-[10px] font-medium">
                    ⌘K
                </span>
            </button>
            <button className="ml-2 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors">
                <Settings className="w-4 h-4" />
            </button>
        </header>
    );
};
