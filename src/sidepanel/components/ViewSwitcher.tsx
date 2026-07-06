import { useAppStore } from '@/store/appStore';
import { Activity, Layers, Clock } from 'lucide-react';


// Checking if lib/utils exists is safer, but I can write a safe version without it for now to avoid multiple steps, then refactor if needed.
// Actually, standard shadcn puts it in @/lib/utils.
// I'll stick to template literals to be safe and dependency-free for this file if utils isn't guaranteed.
// Wait, I haven't seen `lib/utils` in the file list. I'll use template literals.

const TABS = [
    { id: 'active', icon: Activity, label: 'Active' },
    { id: 'spaces', icon: Layers, label: 'Spaces' },
    { id: 'read-later', icon: Clock, label: 'Read Later' },
] as const;

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib';

// ... (keep TABS array) ...

export const ViewSwitcher = () => {
    const { activeView, setActiveView } = useAppStore();

    // Live count of unread items
    const unreadCount = useLiveQuery(() => db.readLater.where('status').equals('unread').count(), []) || 0;

    return (
        <div className="px-4 py-2 border-b border-border/40 bg-background">
            <div className="flex p-1 bg-muted/40 rounded-lg">
                {TABS.map((tab) => {
                    const isActive = activeView === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveView(tab.id)}
                            className={`
                                relative flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ease-out
                                ${isActive
                                    ? 'bg-background text-indigo-500 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                                }
                            `}
                        >
                            <tab.icon className={`w-3.5 h-3.5 ${isActive ? 'scale-110' : ''} transition-transform duration-200`} />
                            {tab.label}

                            {/* Unread Badge for Read Later */}
                            {tab.id === 'read-later' && unreadCount > 0 && (
                                <span className={`
                                    absolute -top-1 -right-1 min-w-badge-size h-badge-size flex items-center justify-center text-super-mini font-bold text-destructive-foreground bg-destructive rounded-full px-0.5 border-2 border-background shadow-sm
                                    animate-in zoom-in duration-200
                                `}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
