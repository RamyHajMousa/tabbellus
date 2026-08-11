import React, { useState, useEffect } from 'react';
import { Ban } from 'lucide-react';
import { type Space, spaceService, GROUP_COLORS, getGroupColorClasses, type ChromeColor } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';

interface EditSpaceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    space: Space;
}

export const EditSpaceDialog: React.FC<EditSpaceDialogProps> = ({
    open,
    onOpenChange,
    space,
}) => {
    const [name, setName] = useState(space.name);
    const [color, setColor] = useState<string | undefined>(space.color);
    const { toast } = useToast();

    useEffect(() => {
        if (open) {
            setName(space.name);
            setColor(space.color);
        }
    }, [open, space.name, space.color]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || !space.id) return;

        try {
            await spaceService.updateSpaceDetails(space.id, trimmedName, color);
            onOpenChange(false);
            setTimeout(() => {
                document.body.style.pointerEvents = '';
            }, 100);
            toast(`Space "${trimmedName}" updated`);
        } catch {
            toast('Failed to update space', { description: 'An error occurred while updating space details.' });
        }
    };

    const handleClose = () => {
        onOpenChange(false);
        setTimeout(() => {
            document.body.style.pointerEvents = '';
        }, 100);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val) {
                handleClose();
            } else {
                onOpenChange(true);
            }
        }}>
            <DialogContent className="sm:max-w-md p-5 select-none">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-sm font-semibold">Edit Space</DialogTitle>
                    <DialogDescription className="text-xs">
                        Customize the name and color badge for this space.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                            Space Name
                        </label>
                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Space name..."
                            className="w-full h-8 px-3 rounded-md border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                            Color Tag
                        </label>
                        <div className="flex flex-wrap items-center gap-2 py-1">
                            {/* Clear Color Button */}
                            <TooltipSimple content="Clear Color" side="top">
                                <button
                                    type="button"
                                    onClick={() => setColor(undefined)}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                        color === undefined
                                            ? 'ring-2 ring-offset-2 ring-offset-background ring-primary border-primary bg-accent scale-110'
                                            : 'border-input hover:border-foreground/50 opacity-70 hover:opacity-100'
                                    }`}
                                    aria-label="Clear space color"
                                >
                                    <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                            </TooltipSimple>

                            {/* Chrome 9-Color Palette Swatches */}
                            {(Object.keys(GROUP_COLORS) as ChromeColor[]).map((colorKey) => {
                                const colorDef = getGroupColorClasses(colorKey);
                                const isSelected = color === colorKey;
                                return (
                                    <TooltipSimple key={colorKey} content={`Color: ${colorKey}`} side="top">
                                        <button
                                            type="button"
                                            onClick={() => setColor(colorKey)}
                                            className={`w-6 h-6 rounded-full transition-all ${colorDef.badge} ${
                                                isSelected
                                                    ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                                                    : 'hover:scale-105 opacity-80 hover:opacity-100'
                                            }`}
                                            aria-label={`Select ${colorKey} color tag`}
                                        />
                                    </TooltipSimple>
                                );
                            })}
                        </div>
                    </div>

                    <DialogFooter className="mt-4 flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="h-7 px-3 text-xs font-medium border border-input bg-background hover:bg-accent text-foreground rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 rounded-md transition-colors"
                        >
                            Save Details
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
