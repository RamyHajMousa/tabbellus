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
import { ActiveSpaceAnchor } from './components/ActiveSpaceAnchor';
import { ViewSwitcher } from './components/ViewSwitcher';

import { ReadLaterList } from '@/features/read-later';
import { useActiveSpacesSync } from '@/hooks/useActiveSpacesSync';
import { OmniSearch } from '@/features/search';
import { HistoryDialog } from '@/features/history/HistoryDialog';
import { SettingsDialog } from '@/features/settings';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { initUsageTracking } from '@/lib/usageTracker';

// ...

const SidePanel = () => {
    const { activeView, theme } = useAppStore((state) => ({
        activeView: state.activeView,
        theme: state.theme,
    }));

    // Cross-window sync for activeSpaces
    useActiveSpacesSync();

    // Initialize usage tracking
    React.useEffect(() => {
        initUsageTracking();
    }, []);

    // Theme synchronization
    React.useEffect(() => {
        const root = window.document.documentElement;

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

            const applySystemTheme = (e: MediaQueryList | MediaQueryListEvent) => {
                root.classList.remove('light', 'dark');
                root.classList.add(e.matches ? 'dark' : 'light');
            };

            // Apply initial system theme immediately
            applySystemTheme(mediaQuery);

            // Listen for real-time OS color scheme switches
            mediaQuery.addEventListener('change', applySystemTheme);

            return () => {
                mediaQuery.removeEventListener('change', applySystemTheme);
            };
        }

        root.classList.remove('light', 'dark');
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
            <ActiveSpaceAnchor />
            <ViewSwitcher />

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ErrorBoundary>
                    {activeView === 'active' && <ActiveSession />}
                    {activeView === 'spaces' && <SpaceList />}
                    {activeView === 'read-later' && <ReadLaterList />}
                </ErrorBoundary>
            </div>

            <OmniSearch />
            <HistoryDialog />
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
