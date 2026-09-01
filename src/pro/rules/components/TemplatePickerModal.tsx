import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toaster';
import { getGroupColorClasses, type ChromeColor } from '@/lib/colors';
import type { TabRule } from '@/core/contracts/rules';
import { RULE_TEMPLATES } from '../storage/templates';
import { runAddTemplate } from './templateActions';

interface TemplatePickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    existingRules: TabRule[];
    onAddRule: (rule: TabRule) => void | Promise<void>;
}

export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
    open,
    onOpenChange,
    existingRules,
    onAddRule,
}) => {
    const { toast } = useToast();
    const [addingId, setAddingId] = useState<string | null>(null);

    const handleAdd = useCallback(
        async (template: (typeof RULE_TEMPLATES)[number], key: string) => {
            setAddingId(key);
            try {
                await runAddTemplate(template, existingRules, onAddRule, toast);
            } finally {
                setAddingId(null);
            }
        },
        [existingRules, onAddRule, toast],
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg p-5 select-none">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-sm font-semibold">Starter Presets</DialogTitle>
                    <DialogDescription className="text-xs">
                        One-click automation templates for common browsing workflows.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    {RULE_TEMPLATES.map((template, index) => {
                        const key = `${template.name}-${index}`;
                        const groupAction = template.actions.find((a) => a.type === 'group');
                        const colorDef = groupAction?.groupColor
                            ? getGroupColorClasses(groupAction.groupColor as ChromeColor)
                            : null;

                        return (
                            <div
                                key={key}
                                className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-background"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    {colorDef && <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDef.badge}`} />}
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground truncate">{template.name}</p>
                                        <p className="text-[11px] text-muted-foreground truncate">
                                            {template.conditions.length} condition{template.conditions.length === 1 ? '' : 's'}
                                            {groupAction?.groupName ? ` · Group: ${groupAction.groupName}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleAdd(template, key)}
                                    disabled={addingId === key}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                >
                                    <Plus className="w-3.5 h-3.5 shrink-0" />
                                    <span>Add Rule</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default TemplatePickerModal;
