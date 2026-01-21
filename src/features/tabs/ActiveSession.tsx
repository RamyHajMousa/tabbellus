import { useState, useEffect } from 'react';
import { spaceService } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { Save, LayoutGrid } from 'lucide-react';

export const ActiveSession = () => {
    const [tabCount, setTabCount] = useState(0);
    const [spaceName, setSpaceName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        // Initial count
        chrome.tabs.query({ currentWindow: true }).then(tabs => setTabCount(tabs.length));

        // Listen for tab changes to update count in real-time
        const listener = () => {
            chrome.tabs.query({ currentWindow: true }).then(tabs => setTabCount(tabs.length));
        };

        chrome.tabs.onCreated.addListener(listener);
        chrome.tabs.onRemoved.addListener(listener);

        return () => {
            chrome.tabs.onCreated.removeListener(listener);
            chrome.tabs.onRemoved.removeListener(listener);
        };
    }, []);

    const handleCapture = async () => {
        if (!spaceName.trim()) return;

        // 1. Pre-validation: Check for valid tabs
        const tabs = await chrome.tabs.query({ currentWindow: true });
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

    return (
        <div className="p-4 bg-card border-b border-border shadow-sm">
            <div className="flex items-center gap-2 mb-3">
                <LayoutGrid className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-sm">Active Session</h2>
                <span className="ml-auto text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    {tabCount} Tabs
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
    );
};
