import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';
import type { RuleAction, RuleCondition, TabRule } from '@/core/contracts/rules';
import { ConditionRow } from './ConditionRow';
import { ActionRow } from './ActionRow';
import {
    addActionRow,
    addConditionRow,
    buildInitialDraft,
    buildRuleFromDraft,
    removeActionRow,
    removeConditionRow,
    updateActionRow,
    updateConditionRow,
    validateRuleDraft,
    type RuleDraft,
} from './ruleEditorLogic';

interface RuleEditorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rule: TabRule | null;
    onSave: (rule: TabRule) => void | Promise<void>;
}

export const RuleEditorModal: React.FC<RuleEditorModalProps> = ({ open, onOpenChange, rule, onSave }) => {
    const isEditMode = rule !== null;
    const [draft, setDraft] = useState<RuleDraft>(() => buildInitialDraft(rule));

    useEffect(() => {
        if (open) {
            setDraft(buildInitialDraft(rule));
        }
    }, [open, rule]);

    const isValid = useMemo(() => validateRuleDraft(draft), [draft]);

    const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

    const handleUpdateCondition = useCallback((index: number, condition: RuleCondition) => {
        setDraft((prev) => ({ ...prev, conditions: updateConditionRow(prev.conditions, index, condition) }));
    }, []);

    const handleRemoveCondition = useCallback((index: number) => {
        setDraft((prev) => ({ ...prev, conditions: removeConditionRow(prev.conditions, index) }));
    }, []);

    const handleAddCondition = useCallback(() => {
        setDraft((prev) => ({ ...prev, conditions: addConditionRow(prev.conditions) }));
    }, []);

    const handleUpdateAction = useCallback((index: number, action: RuleAction) => {
        setDraft((prev) => ({ ...prev, actions: updateActionRow(prev.actions, index, action) }));
    }, []);

    const handleRemoveAction = useCallback((index: number) => {
        setDraft((prev) => ({ ...prev, actions: removeActionRow(prev.actions, index) }));
    }, []);

    const handleAddAction = useCallback(() => {
        setDraft((prev) => ({ ...prev, actions: addActionRow(prev.actions) }));
    }, []);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            if (!validateRuleDraft(draft)) return;
            onSave(buildRuleFromDraft(draft, rule));
        },
        [draft, rule, onSave],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg p-5 select-none max-h-[85vh] overflow-y-auto">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-sm font-semibold">{isEditMode ? 'Edit Rule' : 'New Rule'}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Define matching conditions and the actions to run when a tab matches.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rule Name</label>
                        <input
                            autoFocus
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Group GitHub tabs"
                            aria-label="Rule name"
                            className="w-full h-8 px-3 rounded-md border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-muted-foreground">Match Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setDraft((prev) => ({ ...prev, matchAll: true }))}
                                className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                                    draft.matchAll
                                        ? 'border-primary bg-accent text-primary font-semibold'
                                        : 'border-border text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                Match ALL (AND)
                            </button>
                            <button
                                type="button"
                                onClick={() => setDraft((prev) => ({ ...prev, matchAll: false }))}
                                className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                                    !draft.matchAll
                                        ? 'border-primary bg-accent text-primary font-semibold'
                                        : 'border-border text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                Match ANY (OR)
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-muted-foreground">Conditions</label>
                        <div className="space-y-1.5">
                            {draft.conditions.map((condition, index) => (
                                <ConditionRow
                                    key={index}
                                    condition={condition}
                                    onChange={(c) => handleUpdateCondition(index, c)}
                                    onRemove={() => handleRemoveCondition(index)}
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={handleAddCondition}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            <Plus className="w-3 h-3" />
                            Add Condition
                        </button>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-muted-foreground">Actions</label>
                        <div className="space-y-1.5">
                            {draft.actions.map((action, index) => (
                                <ActionRow
                                    key={index}
                                    action={action}
                                    onChange={(a) => handleUpdateAction(index, a)}
                                    onRemove={() => handleRemoveAction(index)}
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={handleAddAction}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            <Plus className="w-3 h-3" />
                            Add Action
                        </button>
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
                            disabled={!isValid}
                            className="h-7 px-3 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                        >
                            Save Rule
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default RuleEditorModal;
