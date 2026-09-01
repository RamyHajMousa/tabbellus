import React, { Suspense, useEffect, useState } from 'react';
import {
    ExternalLink,
    Layers,
    Keyboard,
    BookmarkCheck,
    Cpu,
    MousePointer,
    MousePointerClick,
    CopyPlus,
    Focus,
    Clock,
    ListChecks,
    Sparkles,
} from 'lucide-react';
import { useAppStore, type AppSettings } from '@/store/appStore';
import { openShortcutsSettings, getReadLaterShortcutText, handleExternalLink } from '@/lib/platform';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Switch } from '@/components/ui/switch';
import { FeatureGate } from '@/core/components/FeatureGate';
import { EXTERNAL_LINKS } from '@/config/links';
import { useSlotComponents } from '../hooks/useSlotComponents';

/**
 * ZERO-CONTAMINATION BOUNDARY: This module MUST NOT statically import
 * anything from `src/pro/`. The rules manager card is resolved exclusively
 * through the declarative `behavior-tab-rules` feature slot.
 */

const RulesPromoFallback: React.FC = () => (
    <div className="p-3.5 rounded-lg border border-border bg-card space-y-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
            <ListChecks className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        Declarative Tab Rules & Auto-Grouping
                    </h4>
                    <span className="inline-flex items-center bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
                        PRO
                    </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-normal">
                    Automatically group, pin, mute, or route tabs into Spaces based on URL, domain, or title conditions you define.
                </p>
            </div>
        </div>
        <div className="pt-1">
            <button
                type="button"
                onClick={() => handleExternalLink(EXTERNAL_LINKS.CHECKOUT)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all"
            >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Unlock with Pro</span>
            </button>
        </div>
    </div>
);

const RulesLoadingSkeleton: React.FC = () => (
    <div className="p-3.5 rounded-lg border border-border bg-card animate-pulse space-y-2">
        <div className="h-4 w-56 bg-muted rounded" />
        <div className="h-3 w-40 bg-muted/60 rounded" />
    </div>
);

export const BehaviorTab: React.FC = () => {
    // Resolve dynamically registered rules slot components, matching the
    // Data tab's Pro-slot readiness delay so the promo fallback doesn't flash.
    const [slotReady, setSlotReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setSlotReady(true), 100);
        return () => clearTimeout(timer);
    }, []);

    const rulesSlots = useSlotComponents(slotReady ? 'behavior-tab-rules' : '');

    const autoDiscardInterval = useAppStore((state) => state.settings.autoDiscardInterval);
    const duplicateTabBehavior = useAppStore((state) => state.settings.duplicateTabBehavior);
    const spaceRestoreTrigger = useAppStore((state) => state.settings.spaceRestoreTrigger);
    const readLaterOpenBehavior = useAppStore((state) => state.settings.readLaterOpenBehavior);
    const readLaterAutoArchive = useAppStore((state) => state.settings.readLaterAutoArchive);
    const setAutoDiscardInterval = useAppStore((state) => state.setAutoDiscardInterval);
    const setDuplicateTabBehavior = useAppStore((state) => state.setDuplicateTabBehavior);
    const setSpaceRestoreTrigger = useAppStore((state) => state.setSpaceRestoreTrigger);
    const setReadLaterOpenBehavior = useAppStore((state) => state.setReadLaterOpenBehavior);
    const setReadLaterAutoArchive = useAppStore((state) => state.setReadLaterAutoArchive);

    const discardIntervalOptions: {
        value: AppSettings['autoDiscardInterval'];
        label: string;
        description: string;
    }[] = [
        { value: 0, label: 'Off', description: 'Never automatically suspend idle tabs' },
        { value: 15, label: '15m', description: 'Suspend tabs idle for 15 minutes or longer' },
        { value: 30, label: '30m', description: 'Suspend tabs idle for 30 minutes or longer' },
        { value: 60, label: '1h', description: 'Suspend tabs idle for 1 hour or longer' },
        { value: 120, label: '2h', description: 'Suspend tabs idle for 2 hours or longer' },
    ];

    const spaceRestoreOptions: {
        value: AppSettings['spaceRestoreTrigger'];
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        description: string;
    }[] = [
        {
            value: 'single',
            label: 'Single-Click',
            icon: MousePointer,
            description: 'Single clicking a space row restores or focuses the workspace window immediately',
        },
        {
            value: 'double',
            label: 'Double-Click',
            icon: MousePointerClick,
            description: 'Single click toggles tab expansion; double click restores or focuses the workspace window',
        },
    ];

    const duplicateTabOptions: {
        value: AppSettings['duplicateTabBehavior'];
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        description: string;
    }[] = [
        {
            value: 'focus-existing',
            label: 'Focus Open Tab',
            icon: Focus,
            description: 'Switch to the existing tab if the URL is already open',
        },
        {
            value: 'allow',
            label: 'Open New Tab',
            icon: CopyPlus,
            description: 'Always open a new tab even if the same URL is already open',
        },
    ];

    const openBehaviorOptions: {
        value: AppSettings['readLaterOpenBehavior'];
        label: string;
        icon: React.ComponentType<{ className?: string }>;
        description: string;
    }[] = [
        {
            value: 'foreground',
            label: 'Foreground',
            icon: ExternalLink,
            description: 'Switch focus to the newly opened tab immediately',
        },
        {
            value: 'background',
            label: 'Background',
            icon: Layers,
            description: 'Open tab quietly in background without stealing active focus',
        },
    ];

    return (
        <div className="space-y-5">
            {/* Declarative Tab Rules & Auto-Grouping (Pro feature slot) */}
            <div>
                <FeatureGate fallback={<RulesPromoFallback />}>
                    {rulesSlots.length > 0 ? (
                        <Suspense fallback={<RulesLoadingSkeleton />}>
                            {rulesSlots.map((SlotComponent, index) => (
                                <SlotComponent key={`rules-slot-${index}`} />
                            ))}
                        </Suspense>
                    ) : (
                        <RulesLoadingSkeleton />
                    )}
                </FeatureGate>
            </div>

            {/* Tab Automation & Memory Reclamation */}
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" />
                        Tab Automation & Memory
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Automate background tab suspension and duplicate handling to optimize RAM usage.
                    </p>
                </div>

                {/* Auto-Discard Idle Tabs (Segmented Control) */}
                <div className="p-3 rounded-lg border border-border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium text-foreground">Auto-Discard Idle Tabs</span>
                        </div>
                        <span className="text-xxs font-medium text-muted-foreground">
                            {autoDiscardInterval === 0 ? 'Disabled' : `Every ${autoDiscardInterval}m`}
                        </span>
                    </div>
                    <p className="text-xxs text-muted-foreground leading-normal">
                        Reclaim system memory by suspending background tabs after inactivity. Tabs reload instantly when focused.
                    </p>
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                        {discardIntervalOptions.map(({ value, label, description }) => {
                            const isSelected = autoDiscardInterval === value;
                            return (
                                <TooltipSimple key={value} content={description} side="top">
                                    <button
                                        type="button"
                                        onClick={() => setAutoDiscardInterval(value)}
                                        className={`flex items-center justify-center py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                            isSelected
                                                ? 'border-primary bg-accent text-primary font-semibold shadow-2xs'
                                                : 'border-border hover:border-primary/60 text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                </TooltipSimple>
                            );
                        })}
                    </div>
                </div>

                {/* Duplicate Tab Handling */}
                <div className="space-y-2">
                    <span className="text-xs font-medium text-foreground">Duplicate Tab Handling</span>
                    <div className="grid grid-cols-2 gap-2">
                        {duplicateTabOptions.map(({ value, label, icon: Icon, description }) => {
                            const isSelected = duplicateTabBehavior === value;
                            return (
                                <TooltipSimple key={value} content={description} side="top">
                                    <button
                                        type="button"
                                        onClick={() => setDuplicateTabBehavior(value)}
                                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-colors ${
                                            isSelected
                                                ? 'border-primary bg-accent text-primary font-semibold'
                                                : 'border-border hover:border-primary/60 text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        <span className="text-xs font-medium">{label}</span>
                                    </button>
                                </TooltipSimple>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Workspace & Spaces Section */}
            <div className="space-y-4 pt-3 border-t border-border">
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Workspace Interaction
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure row click triggers to prevent accidental window restorations.
                    </p>
                </div>

                {/* Space Restore Trigger */}
                <div className="space-y-2">
                    <span className="text-xs font-medium text-foreground">Space Restore Trigger</span>
                    <div className="grid grid-cols-2 gap-2">
                        {spaceRestoreOptions.map(({ value, label, icon: Icon, description }) => {
                            const isSelected = spaceRestoreTrigger === value;
                            return (
                                <TooltipSimple key={value} content={description} side="top">
                                    <button
                                        type="button"
                                        onClick={() => setSpaceRestoreTrigger(value)}
                                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-colors ${
                                            isSelected
                                                ? 'border-primary bg-accent text-primary font-semibold'
                                                : 'border-border hover:border-primary/60 text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        <span className="text-xs font-medium">{label}</span>
                                    </button>
                                </TooltipSimple>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Read Later Workflow Section */}
            <div className="space-y-4 pt-3 border-t border-border">
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Read Later Workflow
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Configure link opening behavior and automated queue archiving.
                    </p>
                </div>

                {/* Open Links In (Segmented Control) */}
                <div className="space-y-2">
                    <span className="text-xs font-medium text-foreground">Open Links In</span>
                    <div className="grid grid-cols-2 gap-2">
                        {openBehaviorOptions.map(({ value, label, icon: Icon, description }) => {
                            const isSelected = readLaterOpenBehavior === value;
                            return (
                                <TooltipSimple key={value} content={description} side="top">
                                    <button
                                        type="button"
                                        onClick={() => setReadLaterOpenBehavior(value)}
                                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-colors ${
                                            isSelected
                                                ? 'border-primary bg-accent text-primary font-semibold'
                                                : 'border-border hover:border-primary/60 text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        <span className="text-xs font-medium">{label}</span>
                                    </button>
                                </TooltipSimple>
                            );
                        })}
                    </div>
                </div>

                {/* Auto-Archive on Open (Toggle Control) */}
                <div className="pt-1">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                        <div className="space-y-0.5 pr-3">
                            <div className="flex items-center gap-2">
                                <BookmarkCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium text-foreground">Auto-Archive on Open</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-normal">
                                Automatically move unread links to your archive queue once opened.
                            </p>
                        </div>
                        <TooltipSimple content={readLaterAutoArchive ? "Disable auto-archiving" : "Enable auto-archiving"} side="top">
                            <span className="inline-flex">
                                <Switch
                                    checked={readLaterAutoArchive}
                                    onCheckedChange={setReadLaterAutoArchive}
                                    aria-label="Auto-Archive on Open"
                                />
                            </span>
                        </TooltipSimple>
                    </div>
                </div>
            </div>

            {/* Global Keyboard Shortcuts Section */}
            <div className="space-y-3 pt-3 border-t border-border">
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Keyboard Shortcuts
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Global browser hotkeys for frictionless capture and navigation.
                    </p>
                </div>

                <div className="p-3 rounded-lg border border-border bg-card space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Keyboard className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium text-foreground">Save Active Tab to Read Later</span>
                        </div>
                        <kbd className="px-2 py-0.5 text-xs font-mono font-semibold text-foreground bg-muted border border-border rounded shadow-xs">
                            {getReadLaterShortcutText()}
                        </kbd>
                    </div>

                    <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Customize browser hotkeys</span>
                        <TooltipSimple content="Open browser shortcuts settings" side="top">
                            <button
                                type="button"
                                onClick={openShortcutsSettings}
                                className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted/50 transition-colors text-foreground"
                            >
                                Configure in Browser
                            </button>
                        </TooltipSimple>
                    </div>
                </div>
            </div>
        </div>
    );
};

