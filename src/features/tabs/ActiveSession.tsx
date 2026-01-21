import { useState } from 'react';
import { spaceService, db } from '@/lib'; // Ensure 'db' is exported from @/lib or import from db directly
import { useToast } from '@/components/ui/Toaster';
import { Save, LayoutGrid } from 'lucide-react';
import { useCurrentTabs } from './hooks/useCurrentTabs';
import { TabRow } from './components/TabRow';

export const ActiveSession = () => {
    const { tabs, activeTabId } = useCurrentTabs();
    const [spaceName, setSpaceName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const handleCapture = async () => {
        if (!spaceName.trim()) return;

        const validTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'));

        if (validTabs.length === 0) {
            toast("No valid tabs to capture. Open some websites first!", { duration: 3000 });
            return;
        }

        setIsSaving(true);
        try {
            await spaceService.captureCurrentWindow(spaceName);
            setSpaceName('');
            toast("Space saved successfully", { duration: 2000 });
        } catch (error) {
            console.error(error);
            toast("Failed to save space", { duration: 3000 });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReadLater = async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
        e.stopPropagation();
        if (!tab.url || !tab.id) return;

        try {
            // 1. Save to DB
            await db.readLater.add({
                url: tab.url,
                title: tab.title,
                addedAt: Date.now(),
                status: 'unread'
            });

            // 2. Close Tab (Clear the Deck)
            await chrome.tabs.remove(tab.id).catch(() => { });

            toast("Saved to Read Later", { duration: 1500 });
        } catch (err) {
            console.error(err);
            toast("Failed to save to Read Later");
        }
    };

    const handleClose = (e: React.MouseEvent, tabId?: number) => {
        e.stopPropagation();
        if (tabId) chrome.tabs.remove(tabId).catch(() => { });
    };

    return (
        <div className="flex flex-col h-full">
            {/* Capture Header */}
            <div className="p-4 bg-card border-b border-border shadow-sm flex-shrink-0 z-10 w-full">
                <div className="flex items-center gap-2 mb-3">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold text-sm">Active Session</h2>
                    <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {tabs.length} Tabs
                    </span>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        value={spaceName}
                        onChange={(e) => setSpaceName(e.target.value)}
                        placeholder="Name this space..."
                        className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
                    />
                    <button
                        onClick={handleCapture}
                        disabled={!spaceName.trim() || isSaving}
                        className="h-9 w-9 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        title="Save Space"
                    >
                        <Save className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable Tab List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0 bg-background/50">
                {tabs.map((tab, index) => (
                    <TabRow
                        key={tab.id || `tab-${index}`}
                        tab={tab}
                        isActive={tab.id === activeTabId}
                        onClose={(e) => handleClose(e, tab.id)}
                        onReadLater={(e) => handleReadLater(e, tab)}
                    />
                ))}
                {tabs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground opacity-50">
                        <p className="text-xs">No active tabs</p>
                    </div>
                )}
            </div>
        </div>
    );
};
