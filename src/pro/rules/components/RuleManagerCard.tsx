/**
 * Declarative Tab Rules & Auto-Grouping Card
 *
 * High-density settings card for managing tab automation rules. Renders in
 * the Settings Behavior tab via declarative feature slot registration.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Isolated Pro component.
 * - Consumes `useRules` from `@/core` only.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ListChecks, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useRules } from '@/core/hooks/useRules';
import { useToast } from '@/components/ui/Toaster';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { useWindowId } from '@/features/tabs/hooks/useWindowId';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Switch } from '@/components/ui/switch';
import type { TabRule } from '@/core/contracts/rules';
import { RuleEditorModal } from './RuleEditorModal';
import { TemplatePickerModal } from './TemplatePickerModal';
import { insertRule, moveRulePriority, removeRuleById, runApplyRulesNow, sortByPriority, summarizeRule, toggleRuleEnabled } from './ruleListActions';

export const RuleManagerCard: React.FC = () => {
    const { rules, saveRules, applyRulesToWindow } = useRules();
    const { toast } = useToast();
    // Resolved from the sidepanel's own window (well-defined here, unlike
    // from the background service worker, which has no associated window).
    const windowId = useWindowId();

    const [editorState, setEditorState] = useState<{ open: boolean; rule: TabRule | null }>({ open: false, rule: null });
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    const sortedRules = useMemo(() => sortByPriority(rules), [rules]);

    const { deleteWithUndo } = useUndoDelete<TabRule>({
        fetch: async (id: string) => rules.find((r) => r.id === id),
        delete: async (id: string) => {
            await saveRules(removeRuleById(rules, id));
        },
        restore: async (rule: TabRule) => {
            await saveRules(insertRule(rules, rule));
        },
    });

    const handleToggle = useCallback(
        (ruleId: string) => {
            saveRules(toggleRuleEnabled(rules, ruleId));
        },
        [rules, saveRules],
    );

    const handleMove = useCallback(
        (ruleId: string, direction: 'up' | 'down') => {
            saveRules(moveRulePriority(rules, ruleId, direction));
        },
        [rules, saveRules],
    );

    const handleDelete = useCallback(
        (rule: TabRule) => {
            deleteWithUndo(rule.id, `Rule "${rule.name}" deleted`);
        },
        [deleteWithUndo],
    );

    const handleApplyNow = useCallback(async () => {
        if (isApplying) return;
        setIsApplying(true);
        try {
            await runApplyRulesNow(() => applyRulesToWindow(windowId), toast);
        } finally {
            setIsApplying(false);
        }
    }, [applyRulesToWindow, isApplying, toast, windowId]);

    const openCreate = useCallback(() => setEditorState({ open: true, rule: null }), []);
    const openEdit = useCallback((rule: TabRule) => setEditorState({ open: true, rule }), []);
    const closeEditor = useCallback(() => setEditorState((prev) => ({ ...prev, open: false })), []);

    const handleSaveRule = useCallback(
        async (rule: TabRule) => {
            const exists = rules.some((r) => r.id === rule.id);
            const next = exists ? rules.map((r) => (r.id === rule.id ? rule : r)) : insertRule(rules, rule);
            await saveRules(next);
            closeEditor();
            toast(exists ? `Rule "${rule.name}" updated` : `Rule "${rule.name}" created`);
        },
        [rules, saveRules, closeEditor, toast],
    );

    const handleAddTemplateRule = useCallback(
        async (rule: TabRule) => {
            await saveRules(insertRule(rules, rule));
        },
        [rules, saveRules],
    );

    return (
        <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center gap-1.5 min-w-0">
                <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
                    Declarative Tab Rules & Auto-Grouping
                </h4>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
                <TooltipSimple content="Evaluate all rules against tabs in the current window" side="top">
                    <button
                        type="button"
                        onClick={handleApplyNow}
                        disabled={isApplying}
                        aria-label="Apply rules now"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted/50 transition-colors text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isApplying ? 'animate-spin' : ''}`} />
                        <span>Apply Rules Now</span>
                    </button>
                </TooltipSimple>

                <button
                    type="button"
                    onClick={() => setTemplatesOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted/50 transition-colors text-foreground"
                >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Templates</span>
                </button>

                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all ml-auto"
                >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>New Rule</span>
                </button>
            </div>

            {sortedRules.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-border text-center space-y-2.5">
                    <p className="text-xs text-muted-foreground">No automation rules yet.</p>
                    <div className="flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={openCreate}
                            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 rounded-md transition-colors"
                        >
                            Create Custom Rule
                        </button>
                        <button
                            type="button"
                            onClick={() => setTemplatesOpen(true)}
                            className="px-3 py-1.5 text-xs font-medium border border-border hover:bg-muted/50 rounded-md transition-colors text-foreground"
                        >
                            Browse Starter Presets
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {sortedRules.map((rule, index) => {
                        const summary = summarizeRule(rule);
                        return (
                            <div key={rule.id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-background">
                                <div className="flex flex-col shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleMove(rule.id, 'up')}
                                        disabled={index === 0}
                                        aria-label={`Move ${rule.name} up`}
                                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleMove(rule.id, 'down')}
                                        disabled={index === sortedRules.length - 1}
                                        aria-label={`Move ${rule.name} down`}
                                        className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                </div>

                                <TooltipSimple content={rule.enabled ? 'Disable rule' : 'Enable rule'} side="top">
                                    <span className="inline-flex shrink-0">
                                        <Switch
                                            checked={rule.enabled}
                                            onCheckedChange={() => handleToggle(rule.id)}
                                            aria-label={`Toggle ${rule.name}`}
                                        />
                                    </span>
                                </TooltipSimple>

                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate">{rule.name}</p>
                                    <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                        {summary.badges.map((badge) => (
                                            <span
                                                key={badge}
                                                className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60"
                                            >
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-0.5 shrink-0">
                                    <TooltipSimple content="Edit rule" side="top">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(rule)}
                                            aria-label={`Edit ${rule.name}`}
                                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                    </TooltipSimple>
                                    <TooltipSimple content="Delete rule" side="top">
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(rule)}
                                            aria-label={`Delete ${rule.name}`}
                                            className="p-1.5 text-muted-foreground hover:text-destructive-foreground hover:bg-destructive rounded-md transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </TooltipSimple>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <RuleEditorModal
                open={editorState.open}
                onOpenChange={(open) => {
                    if (!open) closeEditor();
                }}
                rule={editorState.rule}
                onSave={handleSaveRule}
            />

            <TemplatePickerModal
                open={templatesOpen}
                onOpenChange={setTemplatesOpen}
                existingRules={rules}
                onAddRule={handleAddTemplateRule}
            />
        </div>
    );
};

export default RuleManagerCard;
