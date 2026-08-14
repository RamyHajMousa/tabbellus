import { useCurrentSpace } from '@/hooks/useCurrentSpace';
import { Space } from '@/lib/db';
import { Link2, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { getGroupColorClasses } from '@/lib/colors';
import { TooltipSimple, TooltipOverflow } from '@/components/ui/Tooltip';
import { useIsTruncated } from '@/hooks/useIsTruncated';
import { useToast } from '@/components/ui/Toaster';

export const ActiveSpaceAnchor = () => {
    const currentSpace = useCurrentSpace() as (Space & { tabCount?: number, windowId?: number }) | null;
    const unregisterWindow = useAppStore(state => state.unregisterWindow);
    const { toast } = useToast();
    const [titleRef, isTruncated] = useIsTruncated<HTMLSpanElement>();

    if (!currentSpace) return null;

    const handleUnlink = () => {
        if (currentSpace.windowId) {
            unregisterWindow(currentSpace.windowId);
            toast(`Window unlinked from space "${currentSpace.name}"`);
        }
    };

    const colorDef = currentSpace.color ? getGroupColorClasses(currentSpace.color) : null;

    return (
        <div className="h-8 flex items-center justify-between px-3 bg-muted/40 border-b border-border sticky top-12 z-10 transition-opacity duration-150">
            {/* Left Section */}
            <div className="flex items-center space-x-2 overflow-hidden min-w-0">
                {colorDef ? (
                    <div className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${colorDef.badge}`} />
                ) : (
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                )}
                
                <TooltipOverflow text={currentSpace.name} isTruncated={isTruncated}>
                    <span ref={titleRef} className="text-xs font-medium text-foreground truncate min-w-0">
                        {currentSpace.name}
                    </span>
                </TooltipOverflow>
                
                <span className="text-xxs text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                    {currentSpace.tabCount || 0} tabs
                </span>
            </div>

            {/* Right Section */}
            <TooltipSimple content="Unlink space from this window">
                <button
                    onClick={handleUnlink}
                    className="flex-shrink-0 flex items-center justify-center h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </TooltipSimple>
        </div>
    );
};
