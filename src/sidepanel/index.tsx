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

import { GlobalHeader } from './components/GlobalHeader';
import { ViewSwitcher } from './components/ViewSwitcher';

import { ReadLaterList } from '@/features/read-later';
import { useActiveSpacesSync } from '@/hooks/useActiveSpacesSync';
import { OmniSearch } from '@/features/search';
import { SettingsDialog } from '@/features/settings';
import { initUsageTracking } from '@/lib/usageTracker';

// ...

const SidePanel = () => {
    const { activeView, theme } = useAppStore((state) => ({
        activeView: state.activeView,
        theme: state.theme
    }));

    // Cross-window sync for activeSpaces
    useActiveSpacesSync();

    // Initialize usage tracking
    React.useEffect(() => {
        initUsageTracking();
    }, []);

    React.useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");

        if (theme === "system") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
            root.classList.add(systemTheme);
            return;
        }

        root.classList.add(theme);
    }, [theme]);

    // Listen for window closures to cleanup activeSpaces
    React.useEffect(() => {
        const handleWindowRemoved = (windowId: number) => {
            useAppStore.getState().unregisterWindow(windowId);
        };

        chrome.windows.onRemoved.addListener(handleWindowRemoved);

        return () => {
            chrome.windows.onRemoved.removeListener(handleWindowRemoved);
        };
    }, []);

    return (
        <div className="h-screen w-full bg-background text-foreground flex flex-col font-sans overflow-hidden">
            <GlobalHeader />
            <ViewSwitcher />

            <div className="flex-1 overflow-y-auto">
                {activeView === 'active' && <ActiveSession />}
                {activeView === 'spaces' && <SpaceList />}
                {activeView === 'read-later' && <ReadLaterList />}
            </div>

            <OmniSearch />
            <SettingsDialog />
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
