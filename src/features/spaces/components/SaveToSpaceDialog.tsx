import React from 'react';
import { Folder } from 'lucide-react';
import { DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
} from '@/components/ui/Command';
import { useAddToSpaceAction } from '../hooks/useAddToSpaceAction';
import { type RowTabData } from '@/features/tabs/types';

interface SaveToSpaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tab: RowTabData;
}

export const SaveToSpaceDialog: React.FC<SaveToSpaceDialogProps> = ({
    open,
    onOpenChange,
    tab,
}) => {
    const { spaces, addToSpace } = useAddToSpaceAction(tab);

    const handleSelect = (spaceId: number, spaceName: string) => {
        onOpenChange(false);
        // Force cleanup of pointer-events in case Radix lock persists
        setTimeout(() => {
            document.body.style.pointerEvents = '';
        }, 100);
        addToSpace(spaceId, spaceName);
    };

    return (
        <CommandDialog open={open} onOpenChange={(val) => {
            onOpenChange(val);
            if (!val) {
                setTimeout(() => {
                    document.body.style.pointerEvents = '';
                }, 100);
            }
        }}>
            <DialogTitle className="sr-only">Save to Space</DialogTitle>
            <DialogDescription className="sr-only">Select a space to save this tab</DialogDescription>
            <CommandInput placeholder="Search spaces..." />
            <CommandList>
                <CommandEmpty>No spaces found.</CommandEmpty>
                <CommandGroup heading="Available Spaces">
                    {spaces?.map((space) => (
                        <CommandItem
                            key={space.id}
                            value={space.name}
                            onSelect={() => {
                                if (space.id) {
                                    handleSelect(space.id, space.name);
                                }
                            }}
                            className="cursor-pointer"
                        >
                            <Folder className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{space.name}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
};
