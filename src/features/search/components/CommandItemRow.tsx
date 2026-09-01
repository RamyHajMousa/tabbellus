import React from 'react';
import { CommandItem } from '@/components/ui/Command';
import { TooltipOverflow } from '@/components/ui/Tooltip';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import type { CommandAction } from '../types';

interface CommandItemRowProps {
    command: CommandAction;
    onSelect: () => void;
}

export const CommandItemRow: React.FC<CommandItemRowProps> = ({ command, onSelect }) => {
    const Icon = command.icon;
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    return (
        <CommandItem
            value={`cmd ${command.title} ${command.category} ${command.keywords.join(' ')}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-accent/60 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground aria-selected:bg-accent aria-selected:text-accent-foreground transition-colors"
        >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            
            <TooltipOverflow isTruncated={isTruncated} text={command.title} side="top">
                <span ref={titleRef} className="truncate flex-1 text-xs font-medium text-foreground">
                    {command.title}
                </span>
            </TooltipOverflow>

            {command.isPro && (
                <span className="text-xxs font-semibold px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary shrink-0">
                    PRO
                </span>
            )}

            {command.shortcut && (
                <kbd className="px-1.5 py-0.5 text-xxs font-mono rounded bg-muted text-muted-foreground border border-border/50 shrink-0">
                    {command.shortcut}
                </kbd>
            )}
        </CommandItem>
    );
};
