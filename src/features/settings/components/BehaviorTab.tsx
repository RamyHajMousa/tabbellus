import React from 'react';
import { ExternalLink, Layers, Keyboard, BookmarkCheck } from 'lucide-react';
import { useAppStore, type AppSettings } from '@/store/appStore';
import { openShortcutsSettings, getReadLaterShortcutText } from '@/lib/platform';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { Switch } from '@/components/ui/switch';

export const BehaviorTab: React.FC = () => {
    const { settings, setReadLaterOpenBehavior, setReadLaterAutoArchive } = useAppStore((state) => ({
        settings: state.settings,
        setReadLaterOpenBehavior: state.setReadLaterOpenBehavior,
        setReadLaterAutoArchive: state.setReadLaterAutoArchive,
    }));

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
            {/* Read Later Workflow Section */}
            <div className="space-y-4">
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
                            const isSelected = settings.readLaterOpenBehavior === value;
                            return (
                                <TooltipSimple key={value} content={description} side="top">
                                    <button
                                        type="button"
                                        onClick={() => setReadLaterOpenBehavior(value)}
                                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border transition-colors ${isSelected
                                            ? 'border-primary bg-accent text-primary'
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
                <div className="pt-2">
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
                        <TooltipSimple content={settings.readLaterAutoArchive ? "Disable auto-archiving" : "Enable auto-archiving"} side="top">
                            <span className="inline-flex">
                                <Switch
                                    checked={settings.readLaterAutoArchive}
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
