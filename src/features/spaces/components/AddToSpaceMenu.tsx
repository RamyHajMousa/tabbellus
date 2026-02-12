import { useLiveQuery } from 'dexie-react-hooks';
import { FolderPlus } from 'lucide-react';
import { db, spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AddToSpaceMenuProps {
    tab: chrome.tabs.Tab;
}

export const AddToSpaceMenu = ({ tab }: AddToSpaceMenuProps) => {
    const { toast } = useToast();

    // Fetch non-deleted spaces, newest first
    const spaces = useLiveQuery(
        () => db.spaces
            .orderBy('createdAt')
            .reverse()
            .filter(s => !s.deletedAt)
            .toArray()
    );

    const handleSelect = async (spaceId: number, spaceName: string) => {
        try {
            await spaceService.addTabToSpace(spaceId, tab);
            toast(`Saved to "${spaceName}"`);
        } catch (error) {
            console.error(error);
            toast("Failed to save to space");
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="p-1 rounded-sm hover:bg-background text-muted-foreground hover:text-blue-500 transition-colors focus:opacity-100 outline-none"
                    title="Save to Space"
                    onClick={(e) => e.stopPropagation()} // Prevent row click
                >
                    <FolderPlus className="w-3.5 h-3.5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <DropdownMenuLabel>Save to Space</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[200px] overflow-y-auto">
                    {spaces?.map((space) => (
                        <DropdownMenuItem
                            key={space.id}
                            onClick={() => space.id && handleSelect(space.id, space.name)}
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
