import React from 'react';
import { UploadCloud } from 'lucide-react';

interface SpaceDropzoneOverlayProps {
    isDragging: boolean;
}

export const SpaceDropzoneOverlay: React.FC<SpaceDropzoneOverlayProps> = ({ isDragging }) => {
    if (!isDragging) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-background/95 pointer-events-none transition-opacity duration-150 animate-in fade-in-0">
            <div className="w-full max-w-xs border-2 border-dashed border-primary/40 bg-card rounded-lg p-6 text-center shadow-none space-y-1">
                <UploadCloud className="h-8 w-8 text-primary animate-bounce mx-auto mb-2" />
                <p className="text-xs font-semibold text-foreground">
                    Drop backup file to import spaces
                </p>
                <p className="text-xxs text-muted-foreground font-mono">
                    Supports .json workspace backups
                </p>
            </div>
        </div>
    );
};
