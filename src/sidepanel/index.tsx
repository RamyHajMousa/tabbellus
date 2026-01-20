import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useAppStore } from '@/store/appStore';
import { spaceService } from '@/lib/spaceService';
import '@/index.css';

const HydrationGuard = ({ children }: { children: React.ReactNode }) => {
    const isHydrated = useAppStore((state) => state.isHydrated);

    if (!isHydrated) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
            </div>
        );
    }

    return <>{children}</>;
};

const SidePanel = () => {
    const [spaceName, setSpaceName] = useState('');
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const handleCapture = async () => {
        if (!spaceName.trim()) return;

        try {
            setStatus('idle');
            await spaceService.captureCurrentWindow(spaceName);
            setSpaceName('');
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (error) {
            console.error(error);
            setStatus('error');
            setErrorMessage((error as Error).message);
        }
    };

    const isValid = spaceName.trim().length > 0;

    return (
        <div className="h-screen w-full p-4 bg-background text-foreground flex flex-col font-sans">
            <header className="mb-6">
                <h1 className="text-xl font-bold tracking-tight">TabBellus</h1>
                <p className="text-xs text-muted-foreground">Workspace Manager</p>
            </header>

            <div className="space-y-4">
                <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                    <label className="text-sm font-medium mb-2 block">Capture Current Window</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={spaceName}
                            onChange={(e) => setSpaceName(e.target.value)}
                            placeholder="e.g., Project Alpha"
                            className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>
                    <button
                        onClick={handleCapture}
                        disabled={!isValid}
                        className={`w-full mt-3 h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                            ${isValid
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                            }`}
                    >
                        Capture Window
                    </button>

                    {status === 'success' && (
                        <p className="text-xs text-green-500 mt-2 font-medium">✓ Space saved successfully!</p>
                    )}
                    {status === 'error' && (
                        <p className="text-xs text-destructive mt-2 font-medium">Error: {errorMessage}</p>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto mt-6">
                {/* Space List placeholder */}
                <p className="text-center text-sm text-muted-foreground/60 italic">
                    Your spaces will appear here.
                </p>
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <HydrationGuard>
            <SidePanel />
        </HydrationGuard>
    </React.StrictMode>
);
