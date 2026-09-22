import React from 'react';
import { SlidersHorizontal, Tag } from 'lucide-react';
import { CommandItem } from '@/components/ui/Command';
import type { DirectiveSuggestion } from '../types';

interface SuggestionItemRowProps {
    suggestion: DirectiveSuggestion;
    onSelect: () => void;
}

export const SuggestionItemRow: React.FC<SuggestionItemRowProps> = ({ suggestion, onSelect }) => {
    const Icon = suggestion.category === 'operator' ? SlidersHorizontal : Tag;

    return (
        <CommandItem
            value={`suggestion ${suggestion.id} ${suggestion.label} ${suggestion.insertText}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />

            <span className="font-mono text-xs font-semibold text-primary shrink-0">
                {suggestion.label}
            </span>

            {suggestion.description && (
                <span className="text-xs text-muted-foreground truncate flex-1 font-normal">
                    {suggestion.description}
                </span>
            )}

            <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-muted-foreground/60 bg-muted/50 border border-border/40 px-1 py-0.2 rounded shrink-0 ml-auto">
                Tab
            </kbd>
        </CommandItem>
    );
};
