import React from 'react';
import { Globe } from 'lucide-react';
import { type Tab, tabService } from '@/lib';

interface TabRowProps {
    tab: Tab;
}

export const TabRow = React.memo(({ tab }: TabRowProps) => {
    return (
        <div
            className="flex items-center gap-2 py-1.5 px-2 -ml-2 rounded-md text-sm text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/50 cursor-pointer transition-all duration-200 border-l-2 border-transparent hover:border-primary/50"
            onClick={(e) => {
                e.stopPropagation();
                tabService.focusOrCreate(tab.url);
            }}
        >
            {tab.favicon ? (
                <img
                    src={tab.favicon}
                    alt=""
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                />
            ) : null}
            <Globe className={`w-4 h-4 text-zinc-600 flex-shrink-0 ${tab.favicon ? 'hidden' : ''}`} />
            <span className="truncate">{tab.title || tab.url}</span>
        </div>
    );
});
