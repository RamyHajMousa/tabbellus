import React from 'react';
import { Sun, Moon, Monitor, Eye, EyeOff, BookmarkCheck, LayoutList, BellOff } from 'lucide-react';
import { useAppStore, type AppSettings } from '@/store/appStore';
import { isEdge, openAppearanceSettings } from '@/lib/platform';
import { TooltipSimple } from '@/components/ui/Tooltip';

export const AppearanceTab: React.FC = () => {
    const theme = useAppStore((state) => state.settings.theme);
    const showDomain = useAppStore((state) => state.settings.showDomain);
    const badgeMode = useAppStore((state) => state.settings.badgeMode);
    const setTheme = useAppStore((state) => state.setTheme);
    const setShowDomain = useAppStore((state) => state.setShowDomain);
    const setBadgeMode = useAppStore((state) => state.setBadgeMode);

    const themeOptions = [
        { value: 'light', label: 'Light', icon: Sun, tooltip: 'Always use light theme' },
        { value: 'dark', label: 'Dark', icon: Moon, tooltip: 'Always use dark theme' },
        { value: 'system', label: 'System', icon: Monitor, tooltip: 'Match your operating system color scheme' },
    ] as const;

    const urlDisplayOptions: { value: boolean; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
        { value: true, label: 'Show URLs', icon: Eye, description: 'Display secondary domain URLs beneath tab titles' },
        { value: false, label: 'Hide URLs', icon: EyeOff, description: 'Display tab titles only for a streamlined list' },
    ];

    const badgeModeOptions: { value: AppSettings['badgeMode']; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
        { value: 'read-later', label: 'Read Later', icon: BookmarkCheck, description: 'Badge shows unread Read Later items count' },
        { value: 'tabs', label: 'Open Tabs', icon: LayoutList, description: 'Badge shows total open tabs in current window' },
        { value: 'none', label: 'Off', icon: BellOff, description: 'Do not show count badges on extension icon' },
    ];

    return (
        <div className="space-y-5">
            {/* Theme Section */}
            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Theme
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {themeOptions.map(({ value, label, icon: Icon, tooltip }) => {
                        const isSelected = theme === value;
                        return (
                            <TooltipSimple key={value} content={tooltip} side="top">
                                <button
                                    type="button"
                                    onClick={() => setTheme(value)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${isSelected
                                        ? 'border-primary bg-accent text-primary'
                                        : 'border-border hover:border-primary/60 text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                    <span className="text-xs font-medium">{label}</span>
                                </button>
                            </TooltipSimple>
                        );
                    })}
                </div>
            </div>

            {/* Tab URL Display Section */}
            <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Tab URL Display
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Show or hide secondary domain names beneath tab titles.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {urlDisplayOptions.map(({ value, label, icon: Icon, description }) => {
                        const isSelected = showDomain === value;
                        return (
                            <TooltipSimple key={label} content={description} side="top">
                                <button
                                    type="button"
                                    onClick={() => setShowDomain(value)}
                                    className={`flex items-center justify-center gap-2.5 p-2.5 rounded-lg border transition-colors ${isSelected
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

            {/* Toolbar Badge Mode Section */}
            <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Toolbar Icon Badge
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Display live counters on the TabBellus browser icon.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {badgeModeOptions.map(({ value, label, icon: Icon, description }) => {
                        const isSelected = badgeMode === value;
                        return (
                            <TooltipSimple key={value} content={description} side="top">
                                <button
                                    type="button"
                                    onClick={() => setBadgeMode(value)}
                                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-colors ${isSelected
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

            {/* Sidebar Position Section (Chrome Only) */}
            {!isEdge() && (
                <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Sidebar Position
                            </label>
                            <p className="text-xs text-muted-foreground">Prefer the side panel on the left or right?</p>
                        </div>
                        <TooltipSimple content="Open browser appearance settings" side="top">
                            <button
                                type="button"
                                onClick={openAppearanceSettings}
                                className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted/50 transition-colors"
                            >
                                Browser Settings
                            </button>
                        </TooltipSimple>
                    </div>
                </div>
            )}
        </div>
    );
};
