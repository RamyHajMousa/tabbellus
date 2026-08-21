import React from 'react';
import { Ban } from 'lucide-react';
import { GROUP_COLORS, getGroupColorClasses, type ChromeColor } from '@/lib/colors';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';

export interface ColorPickerGridProps {
    selectedColor?: string;
    onChange: (color: string | undefined) => void;
    className?: string;
}

export const ColorPickerGrid: React.FC<ColorPickerGridProps> = ({
    selectedColor,
    onChange,
    className,
}) => {
    const isNoneSelected = !selectedColor || selectedColor === 'none';

    return (
        <div className={cn('flex flex-wrap items-center gap-2 py-1 select-none', className)}>
            {/* Clear Color / None Option */}
            <TooltipSimple content="No Color" side="top">
                <button
                    type="button"
                    onClick={() => onChange(undefined)}
                    className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center border transition-all cursor-pointer',
                        isNoneSelected
                            ? 'ring-2 ring-offset-2 ring-offset-background ring-primary border-primary bg-accent scale-110'
                            : 'border-input hover:border-foreground/50 opacity-70 hover:opacity-100'
                    )}
                    aria-label="No color tag"
                >
                    <Ban className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
            </TooltipSimple>

            {/* Chrome 9-Color Palette Swatches */}
            {(Object.keys(GROUP_COLORS) as ChromeColor[]).map((colorKey) => {
                const colorDef = getGroupColorClasses(colorKey);
                const isSelected = selectedColor === colorKey;
                return (
                    <TooltipSimple key={colorKey} content={`Color: ${colorKey}`} side="top">
                        <button
                            type="button"
                            onClick={() => onChange(colorKey)}
                            className={cn(
                                'w-6 h-6 rounded-full transition-all cursor-pointer',
                                colorDef.badge,
                                isSelected
                                    ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                                    : 'hover:scale-105 opacity-80 hover:opacity-100'
                            )}
                            aria-label={`Select ${colorKey} color tag`}
                        />
                    </TooltipSimple>
                );
            })}
        </div>
    );
};
