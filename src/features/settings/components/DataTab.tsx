import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, Trash2, AlertTriangle, Database, FileText, Check, RefreshCw } from 'lucide-react';
import { dataService } from '@/lib/dataService';
import { useToast } from '@/components/ui/Toaster';
import { useClipboard } from '@/hooks/useClipboard';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { useStorageTelemetry } from '../hooks/useStorageTelemetry';
import { getOS, getBrowserVersion, isEdge } from '@/lib/platform';
import { useAppStore } from '@/store/appStore';

interface DataTabProps {
    onImportSuccess?: () => void;
    onClearSuccess?: () => void;
}

export const DataTab: React.FC<DataTabProps> = ({ onImportSuccess, onClearSuccess }) => {
    const { toast } = useToast();
    const { copy, hasCopied } = useClipboard();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isClearing, setIsClearing] = useState(false);
    const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { counts, usageFormatted, isLoading, refresh } = useStorageTelemetry();

    // Clean up danger zone safety timer on unmount
    useEffect(() => {
        return () => {
            if (clearTimerRef.current) {
                clearTimeout(clearTimerRef.current);
                clearTimerRef.current = null;
            }
        };
    }, []);

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
            await refresh();
            onImportSuccess?.();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Invalid backup file';
            toast('Failed to import backup', { description: message });
            console.error('Import error:', err);
        } finally {
            // Reset input value to allow selecting same file again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleClearData = async () => {
        if (!isClearing) {
            setIsClearing(true);
            toast('Click again within 3s to confirm full wipe');
            if (clearTimerRef.current) {
                clearTimeout(clearTimerRef.current);
            }
            clearTimerRef.current = setTimeout(() => {
                setIsClearing(false);
                clearTimerRef.current = null;
            }, 3000);
            return;
        }

        if (clearTimerRef.current) {
            clearTimeout(clearTimerRef.current);
            clearTimerRef.current = null;
        }

        try {
            await dataService.clearData();
            toast('All data cleared successfully');
            await refresh();
            onClearSuccess?.();
        } catch {
            toast('Failed to clear data');
        } finally {
            setIsClearing(false);
        }
    };

    const handleCopyDiagnostic = () => {
        const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest
            ? chrome.runtime.getManifest().version
            : '1.2.2';

        const browserName = isEdge() ? 'Edge' : 'Chrome';
        const browserVersion = getBrowserVersion();
        const browserFormatted = browserVersion !== 'Unknown' ? `${browserName} ${browserVersion}` : browserName;

        const settings = useAppStore.getState().settings;

        const formatAutoDiscard = (interval: number): string => {
            switch (interval) {
                case 15: return '15m';
                case 30: return '30m';
                case 60: return '1h';
                case 120: return '2h';
                default: return 'Off';
            }
        };

        const report = [
            `### TabBellus Diagnostic Report`,
            ``,
            `#### Environment`,
            `- **Extension Version**: ${version}`,
            `- **Operating System**: ${getOS()}`,
            `- **Browser**: ${browserFormatted}`,
            ``,
            `#### Database & Storage Metrics`,
            `- **Spaces Count**: ${counts.spaces}`,
            `- **Saved Tabs Count**: ${counts.tabs}`,
            `- **Read Later Count**: ${counts.readLater}`,
            `- **Estimated Storage Size**: ${usageFormatted}`,
            ``,
            `#### Active App Configuration`,
            `- **Theme**: ${settings.theme}`,
            `- **URL Subtitles**: ${settings.showDomain ? 'shown' : 'hidden'}`,
            `- **Extension Badge Mode**: ${settings.badgeMode}`,
            `- **Auto-Discard Idle Tabs**: ${formatAutoDiscard(settings.autoDiscardInterval)}`,
            `- **Space Restore Trigger**: ${settings.spaceRestoreTrigger === 'single' ? 'Single-Click' : 'Double-Click'}`,
            `- **Duplicate Tab Handling**: ${settings.duplicateTabBehavior === 'focus-existing' ? 'Focus Open Tab' : 'Open New Tab'}`,
            `- **Read Later Ingestion**: Opening: ${settings.readLaterOpenBehavior === 'foreground' ? 'Foreground' : 'Background'} | Auto-Archive: ${settings.readLaterAutoArchive ? 'Enabled' : 'Disabled'}`,
            ``,
            `#### Raw Diagnostics`,
            `- **User Agent**: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}`,
            `- **Timestamp (UTC)**: ${new Date().toISOString()}`,
        ].join('\n');

        copy(report);
        toast('Copied diagnostic report to clipboard');
    };

    return (
        <div className="space-y-4">
            {/* Local Storage Health Card */}
            <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Local Storage Health
                        </span>
                    </div>
                    <TooltipSimple content="Refresh storage telemetry" side="top">
                        <button
                            type="button"
                            onClick={() => refresh()}
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                            aria-label="Refresh telemetry"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </TooltipSimple>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1">
                    <div className="p-2 rounded-md bg-muted/40 border border-border/50 text-center">
                        <p className="text-[11px] text-muted-foreground">Spaces</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">{counts.spaces}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/40 border border-border/50 text-center">
                        <p className="text-[11px] text-muted-foreground">Tabs</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">{counts.tabs}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/40 border border-border/50 text-center">
                        <p className="text-[11px] text-muted-foreground">Read Later</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">{counts.readLater}</p>
                    </div>
                    <div className="p-2 rounded-md bg-muted/40 border border-border/50 text-center">
                        <p className="text-[11px] text-muted-foreground">Est. Size</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">{usageFormatted}</p>
                    </div>
                </div>
            </div>

            {/* Backup & Restore Section */}
            <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Backup & Restore
                </label>

                {/* Export */}
                <TooltipSimple content="Export all saved spaces, tabs, and read-later links to a JSON backup file" side="top">
                    <button
                        type="button"
                        onClick={handleExport}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-colors"
                    >
                        <Download className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="text-left">
                            <p className="text-sm font-medium text-foreground">Export Backup</p>
                            <p className="text-xs text-muted-foreground">Download your spaces and tabs as JSON</p>
                        </div>
                    </button>
                </TooltipSimple>

                {/* Import */}
                <TooltipSimple content="Restore spaces, tabs, and read-later links from a JSON backup file" side="top">
                    <button
                        type="button"
                        onClick={handleImportClick}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-colors"
                    >
                        <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="text-left">
                            <p className="text-sm font-medium text-foreground">Import Backup</p>
                            <p className="text-xs text-muted-foreground">Restore from a JSON backup file</p>
                        </div>
                    </button>
                </TooltipSimple>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>

            {/* Diagnostic Report Section */}
            <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                    <div>
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Diagnostic Report
                        </label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Generate a sanitized system and storage report for troubleshooting.
                        </p>
                    </div>
                </div>

                <TooltipSimple content="Copy sanitized system and telemetry markdown report" side="top">
                    <button
                        type="button"
                        onClick={handleCopyDiagnostic}
                        className="w-full flex items-center justify-between gap-4 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                    >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                            <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                            <div className="text-left min-w-0">
                                <p className="text-sm font-medium text-foreground">Copy Diagnostic Summary</p>
                                <p className="text-xs text-muted-foreground leading-normal">Sanitized report for GitHub issues or support</p>
                            </div>
                        </div>
                        {hasCopied ? (
                            <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded bg-primary/10 border border-primary/20 text-primary shrink-0">
                                <Check className="w-3.5 h-3.5" />
                                Copied
                            </span>
                        ) : (
                            <span className="text-xs font-medium px-2.5 py-1 rounded bg-muted border border-border text-foreground shrink-0 group-hover:bg-background transition-colors">
                                Copy
                            </span>
                        )}
                    </button>
                </TooltipSimple>
            </div>

            {/* Danger Zone */}
            <div className="pt-3 border-t border-border space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Danger Zone</span>
                </div>
                <button
                    type="button"
                    onClick={handleClearData}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${isClearing
                        ? 'border-destructive bg-destructive text-destructive-foreground'
                        : 'border-destructive/60 hover:bg-destructive hover:text-destructive-foreground text-destructive'
                        }`}
                >
                    <Trash2 className="w-5 h-5 shrink-0" />
                    <div className="text-left">
                        <p className="text-sm font-medium">
                            {isClearing ? 'Click again to confirm deletion' : 'Delete All Data'}
                        </p>
                        <p className="text-xs opacity-90">This action permanently purges IndexedDB and cannot be undone</p>
                    </div>
                </button>
            </div>
        </div>
    );
};
