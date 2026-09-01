import React from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { ColorPickerGrid } from '@/features/spaces/components/ColorPickerGrid';
import { useSpaces } from '@/features/spaces/useSpaces';
import { getGroupColorClasses } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { Space } from '@/lib/db';
import type { ActionType, RuleAction } from '@/core/contracts/rules';
import { ACTION_TYPE_OPTIONS } from './ruleEditorLogic';

export interface ActionRowProps {
    action: RuleAction;
    onChange: (action: RuleAction) => void;
    onRemove: () => void;
    spaces?: Space[];
}

export const ActionRow: React.FC<ActionRowProps> = ({
    action,
    onChange,
    onRemove,
    spaces: propSpaces,
}) => {
    const hookSpaces = useSpaces();
    const spaces = propSpaces ?? hookSpaces ?? [];

    const currentActionOption = ACTION_TYPE_OPTIONS.find((opt) => opt.value === action.type);
    const selectedSpace = spaces.find((s) => s.id !== undefined && s.id === action.spaceId);
    const selectedSpaceColorDef = selectedSpace?.color
        ? getGroupColorClasses(selectedSpace.color)
        : null;

    return (
        <div className="p-2 rounded-md border border-border bg-background space-y-2">
            <div className="flex items-center gap-1.5">
                {/* Action Type Selector Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label="Action type"
                            className="flex items-center justify-between h-8 px-2.5 text-xs border border-border rounded-md bg-card hover:bg-muted text-foreground flex-1 min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <span className="truncate text-xs font-medium text-foreground">
                                {currentActionOption?.label ?? 'Select action'}
                            </span>
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1.5" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        className="w-48 bg-popover border border-border rounded-md shadow-md p-1"
                    >
                        {ACTION_TYPE_OPTIONS.map((opt) => {
                            const isSelected = opt.value === action.type;
                            return (
                                <DropdownMenuItem
                                    key={opt.value}
                                    onClick={() => onChange({ type: opt.value as ActionType })}
                                    className={cn(
                                        'flex items-center justify-between px-2 py-1.5 rounded-sm hover:bg-muted text-xs cursor-pointer select-none',
                                        isSelected && 'bg-accent font-medium'
                                    )}
                                >
                                    <span className="text-xs text-foreground">{opt.label}</span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Remove Action Button */}
                <TooltipSimple content="Remove action" side="top">
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label="Remove action"
                        className="p-1 h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md border border-border bg-card hover:bg-muted transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>

            {/* Auto-Group Options */}
            {action.type === 'group' && (
                <div className="space-y-1.5 pl-0.5">
                    <input
                        type="text"
                        value={action.groupName ?? ''}
                        onChange={(e) => onChange({ ...action, groupName: e.target.value })}
                        placeholder="Group name..."
                        aria-label="Group name"
                        className="w-full h-8 px-2.5 text-xs border border-border rounded-md bg-card text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <ColorPickerGrid
                        selectedColor={action.groupColor}
                        onChange={(color) => onChange({ ...action, groupColor: color })}
                    />
                </div>
            )}

            {/* Target Space Selector Dropdown */}
            {action.type === 'space' && (
                <div className="space-y-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Target space"
                                className="flex items-center justify-between w-full h-8 px-2.5 text-xs border border-border rounded-md bg-card hover:bg-muted text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {selectedSpace ? (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className={cn(
                                                'w-2 h-2 rounded-full shrink-0',
                                                selectedSpaceColorDef ? selectedSpaceColorDef.badge : 'bg-zinc-400'
                                            )}
                                        />
                                        <span className="truncate max-w-[170px] text-xs font-medium text-foreground">
                                            {selectedSpace.name}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground truncate">
                                        Select target space...
                                    </span>
                                )}
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            className="w-[--radix-dropdown-menu-trigger-width] min-w-[220px] max-h-48 overflow-y-auto p-1 bg-popover border border-border rounded-md shadow-md"
                        >
                            {spaces.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
                                    No spaces available
                                </div>
                            ) : (
                                spaces.map((space) => {
                                    const isSelected = space.id !== undefined && space.id === action.spaceId;
                                    const spaceColorDef = space.color
                                        ? getGroupColorClasses(space.color)
                                        : null;
                                    return (
                                        <DropdownMenuItem
                                            key={space.id}
                                            onClick={() =>
                                                onChange({
                                                    ...action,
                                                    spaceId: space.id,
                                                    spaceName: space.name,
                                                })
                                            }
                                            className={cn(
                                                'flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted text-xs cursor-pointer select-none',
                                                isSelected && 'bg-accent font-medium'
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'w-2 h-2 rounded-full shrink-0',
                                                    spaceColorDef ? spaceColorDef.badge : 'bg-zinc-400'
                                                )}
                                            />
                                            <span className="truncate max-w-[200px] text-xs text-foreground flex-1">
                                                {space.name}
                                            </span>
                                            {isSelected && (
                                                <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-auto" />
                                            )}
                                        </DropdownMenuItem>
                                    );
                                })
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </div>
    );
};

export default ActionRow;
