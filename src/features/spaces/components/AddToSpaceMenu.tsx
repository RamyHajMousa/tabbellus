import { FolderPlus } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type RowTabData } from '@/features/tabs/types';
import { InteractiveRow } from '@/features/tabs/components/InteractiveRow';
import { useAddToSpaceAction } from '../hooks/useAddToSpaceAction';

interface AddToSpaceMenuProps {
    tab: RowTabData;
}

export const AddToSpaceMenu = ({ tab }: AddToSpaceMenuProps) => {
    const { spaces, addToSpace } = useAddToSpaceAction(tab);

    return (
        <DropdownMenu>
            <TooltipSimple content="Save to Space" side="top">
                <DropdownMenuTrigger asChild>
                    <InteractiveRow.Action
                        icon={FolderPlus}
                        variant="primary"
                    />
                </DropdownMenuTrigger>
            </TooltipSimple>
            <DropdownMenuContent align="end" className="w-56" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <DropdownMenuLabel>Save to Space</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[200px] overflow-y-auto">
                    {spaces?.map((space) => (
                        <DropdownMenuItem
                            key={space.id}
                            onClick={() => space.id && addToSpace(space.id, space.name)}
                            className="cursor-pointer"
                        >
                            <span className="truncate">{space.name}</span>
                        </DropdownMenuItem>
                    ))}
                    {spaces?.length === 0 && (
                        <div className="p-2 text-xs text-center text-muted-foreground">
                            No spaces created
                        </div>
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
