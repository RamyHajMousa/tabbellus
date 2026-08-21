import React from 'react';
import { CommandItem } from '@/components/ui/Command';
import type { CommandAction } from '../types';

interface CommandItemRowProps {
    command: CommandAction;
    onSelect: () => void;
}

export const CommandItemRow: React.FC<CommandItemRowProps> = ({ command, onSelect }) => {
    const Icon = command.icon;

    return (
        <CommandItem
            value={`cmd ${command.title} ${command.category} ${command.keywords.join(' ')}`}
            onSelect={onSelect}
            className="h-9 px-2.5 py-1.5 flex items-center gap-2.5 cursor-pointer rounded-sm hover:bg-muted/60 data-[selected=true]:bg-muted/80 transition-colors"
        >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate flex-1 text-xs font-medium text-foreground">
                {command.title}
            </span>
            <span className="text-xxs font-mono text-muted-foreground/70 bg-muted/60 border border-border/40 px-1.5 py-0.5 rounded shrink-0">
                {command.category}
            </span>
            {command.shortcut && (
                <kbd className="text-xxs font-mono text-muted-foreground bg-muted border border-border/60 px-1 py-0.5 rounded shrink-0">
                    {command.shortcut}
                </kbd>
            )}
        </CommandItem>
    );
};
