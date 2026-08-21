import React, { useState, useEffect, useCallback, useRef } from 'react';
import { spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { ColorPickerGrid } from './ColorPickerGrid';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';

export interface CreateSpaceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: (spaceId: number) => void;
}

export const CreateSpaceModal: React.FC<CreateSpaceModalProps> = ({
    open,
    onOpenChange,
    onCreated,
}) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState<string | undefined>(undefined);
    const { toast } = useToast();
    const pointerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (open) {
            setName('');
            setColor(undefined);
        }
    }, [open]);

    useEffect(() => {
        return () => {
            if (pointerTimerRef.current) clearTimeout(pointerTimerRef.current);
        };
    }, []);

    const handleClose = useCallback(() => {
        onOpenChange(false);
        if (pointerTimerRef.current) clearTimeout(pointerTimerRef.current);
        pointerTimerRef.current = setTimeout(() => {
            document.body.style.pointerEvents = '';
        }, 100);
    }, [onOpenChange]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName) return;

        try {
            const spaceId = await spaceService.createEmptySpace(trimmedName, color);
            handleClose();
            toast(`Space "${trimmedName}" created`);
            if (onCreated) {
                onCreated(spaceId);
            }
        } catch (error) {
            console.error('Failed to create space:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast('Failed to create space', { description: message });
        }
    }, [name, color, handleClose, onCreated, toast]);

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
                    <DialogTitle className="text-sm font-semibold">Create New Space</DialogTitle>
                    <DialogDescription className="text-xs">
                        Create a new empty workspace and optionally tag it with a color.
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
                        <ColorPickerGrid
                            selectedColor={color}
                            onChange={setColor}
                        />
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
                            Create Space
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
