import { Search, Settings } from 'lucide-react';

export const GlobalHeader = () => {
    return (
        <header className="h-12 flex items-center px-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                    type="text"
                    placeholder="Search spaces... (Cmd+K)"
                    className="w-full h-8 pl-9 pr-4 text-xs bg-muted/50 hover:bg-muted/80 focus:bg-background border border-transparent focus:border-primary/20 rounded-md transition-all outline-none placeholder:text-muted-foreground/50"
                />
            </div>
            <button className="ml-2 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors">
                <Settings className="w-4 h-4" />
            </button>
        </header>
    );
};
