import React from 'react';
import ReactDOM from 'react-dom/client';
import { useAppStore } from '@/store/appStore';
import { ToastProvider } from '@/components/ui/Toaster';
import { ActiveSession } from '@/features/tabs';
import { SpaceList } from '@/features/spaces';
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
    return (
        <div className="h-screen w-full bg-background text-foreground flex flex-col font-sans overflow-hidden">
            {/* Header */}
            <header className="p-4 border-b border-border/50">
                <h1 className="text-xl font-bold tracking-tight">TabBellus</h1>
                <p className="text-xs text-muted-foreground">Workspace Manager</p>
            </header>

            {/* Active Session & Capture */}
            <ActiveSession />

            {/* Space List */}
            <div className="flex-1 overflow-hidden">
                <SpaceList />
            </div>
        </div>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <HydrationGuard>
            <ToastProvider>
                <SidePanel />
            </ToastProvider>
        </HydrationGuard>
    </React.StrictMode>
);
