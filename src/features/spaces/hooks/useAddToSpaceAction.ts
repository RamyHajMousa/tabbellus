import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { type RowTabData } from '@/features/tabs/types';

export function useAddToSpaceAction(tab: RowTabData) {
    const { toast } = useToast();

    // Fetch non-deleted spaces, newest first
    const spaces = useLiveQuery(spaceService.getSpacesNewestFirstQuery());

    const addToSpace = async (spaceId: number, spaceName: string) => {
        try {
            await spaceService.addTabToSpace(spaceId, {
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favicon
            });
            toast(`Saved to "${spaceName}"`);
        } catch (error) {
            console.error(error);
            if (error instanceof Error && error.message === 'DUPLICATE_TAB') {
                toast('Tab already exists in this space', {
                    description: 'Tip: Duplicate the tab in your browser if you need multiple copies saved.'
                });
            } else {
                toast("Failed to save to space");
            }
        }
    };

    return {
        spaces,
        addToSpace,
    };
}
