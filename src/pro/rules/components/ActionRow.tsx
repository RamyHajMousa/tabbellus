import React from 'react';
import { X } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { ColorPickerGrid } from '@/features/spaces/components/ColorPickerGrid';
import { useSpaces } from '@/features/spaces/useSpaces';
import type { ActionType, RuleAction } from '@/core/contracts/rules';
import { ACTION_TYPE_OPTIONS } from './ruleEditorLogic';

interface ActionRowProps {
    action: RuleAction;
    onChange: (action: RuleAction) => void;
    onRemove: () => void;
}

export const ActionRow: React.FC<ActionRowProps> = ({ action, onChange, onRemove }) => {
    const spaces = useSpaces();

    return (
        <div className="p-2 rounded-md border border-border bg-background space-y-2">
            <div className="flex items-center gap-1.5">
                <select
                    value={action.type}
                    onChange={(e) => onChange({ type: e.target.value as ActionType })}
                    aria-label="Action type"
                    className="h-7 px-1.5 text-xs border border-input rounded-md bg-background text-foreground flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    {ACTION_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>

                <TooltipSimple content="Remove action" side="top">
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label="Remove action"
                        className="p-1 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md transition-colors shrink-0"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </TooltipSimple>
            </div>

            {action.type === 'group' && (
                <div className="space-y-1.5 pl-0.5">
                    <input
                        type="text"
                        value={action.groupName ?? ''}
                        onChange={(e) => onChange({ ...action, groupName: e.target.value })}
                        placeholder="Group name..."
                        aria-label="Group name"
                        className="w-full h-7 px-2 text-xs border border-input rounded-md bg-background text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <ColorPickerGrid
                        selectedColor={action.groupColor}
                        onChange={(color) => onChange({ ...action, groupColor: color })}
                    />
                </div>
            )}

            {action.type === 'space' && (
                <select
                    value={action.spaceId ?? ''}
                    onChange={(e) => {
                        const spaceId = e.target.value ? Number(e.target.value) : undefined;
                        const space = spaces?.find((s) => s.id === spaceId);
                        onChange({ ...action, spaceId, spaceName: space?.name });
                    }}
                    aria-label="Target space"
                    className="w-full h-7 px-2 text-xs border border-input rounded-md bg-background text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    <option value="">Select a space…</option>
                    {(spaces ?? []).map((space) => (
                        <option key={space.id} value={space.id}>{space.name}</option>
                    ))}
                </select>
            )}
        </div>
    );
};

export default ActionRow;
