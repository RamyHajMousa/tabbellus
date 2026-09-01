import React from 'react';
import { X } from 'lucide-react';
import { TooltipSimple } from '@/components/ui/Tooltip';
import type { ConditionField, ConditionOperator, RuleCondition } from '@/core/contracts/rules';
import { CONDITION_FIELD_OPTIONS, CONDITION_OPERATOR_OPTIONS, isConditionRegexInvalid } from './ruleEditorLogic';

interface ConditionRowProps {
    condition: RuleCondition;
    onChange: (condition: RuleCondition) => void;
    onRemove: () => void;
}

export const ConditionRow: React.FC<ConditionRowProps> = ({ condition, onChange, onRemove }) => {
    const regexInvalid = isConditionRegexInvalid(condition);

    return (
        <div className="flex items-start gap-1.5 p-2 rounded-md border border-border bg-background">
            <select
                value={condition.field}
                onChange={(e) => onChange({ ...condition, field: e.target.value as ConditionField })}
                aria-label="Condition field"
                className="h-7 px-1.5 text-xs border border-input rounded-md bg-background text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
                {CONDITION_FIELD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>

            <select
                value={condition.operator}
                onChange={(e) => onChange({ ...condition, operator: e.target.value as ConditionOperator })}
                aria-label="Condition operator"
                className="h-7 px-1.5 text-xs border border-input rounded-md bg-background text-foreground shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
                {CONDITION_OPERATOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>

            <div className="flex-1 min-w-0">
                <input
                    type="text"
                    value={condition.value}
                    onChange={(e) => onChange({ ...condition, value: e.target.value })}
                    placeholder="Value..."
                    aria-label="Condition value"
                    aria-invalid={regexInvalid}
                    className={`w-full h-7 px-2 text-xs border rounded-md bg-background text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                        regexInvalid ? 'border-destructive text-destructive' : 'border-input'
                    }`}
                />
                {regexInvalid && (
                    <p className="text-[10px] text-destructive mt-0.5">Invalid regular expression syntax</p>
                )}
            </div>

            <TooltipSimple content={condition.caseSensitive ? 'Case sensitive' : 'Case insensitive'} side="top">
                <label className="flex items-center h-7 shrink-0 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={Boolean(condition.caseSensitive)}
                        onChange={(e) => onChange({ ...condition, caseSensitive: e.target.checked })}
                        aria-label="Case sensitive"
                        className="w-3.5 h-3.5 accent-primary cursor-pointer"
                    />
                </label>
            </TooltipSimple>

            <TooltipSimple content="Remove condition" side="top">
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="Remove condition"
                    className="p-1 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive rounded-md transition-colors shrink-0"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </TooltipSimple>
        </div>
    );
};

export default ConditionRow;
