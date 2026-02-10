import { useRef, useState, useEffect } from 'react';
import { Download, Upload, Trash2, Sun, Moon, Monitor, Heart, Star, Coffee, MessageSquare } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/Dialog';
import { useUIStore } from '@/store/uiStore';
import { useAppStore } from '@/store/appStore';
import { dataService } from '@/lib/dataService';
import { useToast } from '@/components/ui/Toaster';
import { getUsageStats, markSupportInteracted } from '@/lib/usageTracker';

export const SettingsDialog = () => {
    const { isSettingsOpen, setSettingsOpen } = useUIStore();
    const { theme, setTheme } = useAppStore();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<'appearance' | 'data' | 'support'>('appearance');
    const [isClearing, setIsClearing] = useState(false);
    const [showSupportBadge, setShowSupportBadge] = useState(false);
    const [isEligibleForPromo, setIsEligibleForPromo] = useState(false);

    useEffect(() => {
        if (isSettingsOpen) {
            getUsageStats().then(stats => {
                setShowSupportBadge(stats.isEligible);
                setIsEligibleForPromo(stats.isEligible);
            });
        }
    }, [isSettingsOpen]);

    const handleDismissPromo = async () => {
        await markSupportInteracted();
        setIsEligibleForPromo(false);
        setShowSupportBadge(false);
        toast('Thanks for using TabBellus!');
    };

    const openLink = (url: string) => {
        chrome.tabs.create({ url, active: true });
    };

    const handleExport = async () => {
        try {
            await dataService.exportData();
            toast('Backup downloaded successfully');
        } catch {
            toast('Failed to export data');
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const result = await dataService.importData(file);
            toast(`Imported ${result.spacesCount} spaces, ${result.tabsCount} tabs, ${result.readLaterCount} read-later items`);
            setSettingsOpen(false);
        } catch (err) {
            toast('Invalid backup file');
            console.error('Import error:', err);
        }

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleClearData = async () => {
        if (!isClearing) {
            setIsClearing(true);
            toast('Click again to confirm deletion');
            setTimeout(() => setIsClearing(false), 3000);
            return;
        }

        try {
            await dataService.clearData();
            toast('All data cleared');
            setSettingsOpen(false);
        } catch {
            toast('Failed to clear data');
        }
        setIsClearing(false);
    };

    const themeOptions = [
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'dark', label: 'Dark', icon: Moon },
        { value: 'system', label: 'System', icon: Monitor },
    ] as const;

    return (
        <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>Customize your TabBellus experience.</DialogDescription>
                </DialogHeader>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('appearance')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'appearance'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Appearance
                    </button>
                    <button
                        onClick={() => setActiveTab('data')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'data'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Data
                    </button>
                    <button
                        onClick={() => setActiveTab('support')}
                        className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === 'support'
                            ? 'border-b-2 border-primary text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Support
                        {showSupportBadge && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="py-4 space-y-4">
                    {activeTab === 'appearance' && (
                        <div className="space-y-3">
                            <label className="text-sm font-medium">Theme</label>
                            <div className="grid grid-cols-3 gap-2">
                                {themeOptions.map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        onClick={() => setTheme(value)}
                                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${theme === value
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span className="text-xs font-medium">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'support' && (
                        <div className="space-y-4">
                            {isEligibleForPromo && (
                                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50">
                                    <div className="flex items-start gap-3">
                                        <Heart className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                                        <div>
                                            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">Loving TabBellus?</h4>
                                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
                                                You active usage helps us grow! If TabBellus has improved your workflow, please consider supporting development.
                                            </p>
                                            {/* TODO: Change the links when put in production */}
                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={() => openLink('https://chromewebstore.google.com/detail/tabbellus-workstation/ikgdoaampabbohhkapeelhafojdnnfec/reviews')}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors"
                                                >
                                                    Rate 5 Stars
                                                </button>
                                                <button
                                                    onClick={() => openLink('https://buymeacoffee.com/ramyhajmousa')}
                                                    className="px-3 py-1.5 bg-white dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200 text-xs font-medium rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/60 transition-colors"
                                                >
                                                    Buy Coffee
                                                </button>
                                                <button
                                                    onClick={handleDismissPromo}
                                                    className="ml-auto text-xs text-blue-600/60 dark:text-blue-400/60 hover:text-blue-600 dark:hover:text-blue-400"
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1">
                                {/* TODO: Change these links when put in production as well*/}
                                <button
                                    onClick={() => openLink('https://chromewebstore.google.com/detail/tabbellus-workstation/ikgdoaampabbohhkapeelhafojdnnfec/reviews')}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                >
                                    <Star className="w-4 h-4 text-orange-400" />
                                    <span className="text-sm font-medium">Rate TabBellus</span>
                                </button>
                                <button
                                    onClick={() => openLink('https://buymeacoffee.com/ramyhajmousa')}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                >
                                    <Coffee className="w-4 h-4 text-amber-600" />
                                    <span className="text-sm font-medium">Buy me a coffee</span>
                                </button>
                                <button
                                    onClick={() => openLink('https://github.com/RamyHajMousa/tabbellus/issues')}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                                >
                                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Report Issue / Request Feature</span>
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'data' && (
                        <div className="space-y-4">
                            {/* Export */}
                            <button
                                onClick={handleExport}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                            >
                                <Download className="w-5 h-5 text-muted-foreground" />
                                <div className="text-left">
                                    <p className="text-sm font-medium">Export Backup</p>
                                    <p className="text-xs text-muted-foreground">Download your spaces and tabs as JSON</p>
                                </div>
                            </button>

                            {/* Import */}
                            <button
                                onClick={handleImportClick}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                            >
                                <Upload className="w-5 h-5 text-muted-foreground" />
                                <div className="text-left">
                                    <p className="text-sm font-medium">Import Backup</p>
                                    <p className="text-xs text-muted-foreground">Restore from a JSON backup file</p>
                                </div>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            {/* Danger Zone */}
                            <div className="pt-4 border-t border-border">
                                <p className="text-xs text-muted-foreground mb-2">Danger Zone</p>
                                <button
                                    onClick={handleClearData}
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${isClearing
                                        ? 'border-destructive bg-destructive/10 text-destructive'
                                        : 'border-destructive/50 hover:border-destructive hover:bg-destructive/10 text-destructive/80 hover:text-destructive'
                                        }`}
                                >
                                    <Trash2 className="w-5 h-5" />
                                    <div className="text-left">
                                        <p className="text-sm font-medium">
                                            {isClearing ? 'Click again to confirm' : 'Delete All Data'}
                                        </p>
                                        <p className="text-xs opacity-80">This action cannot be undone</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
