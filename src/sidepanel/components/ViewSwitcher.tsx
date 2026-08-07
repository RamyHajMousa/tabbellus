import { useAppStore } from '@/store/appStore';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, Layers, Clock } from 'lucide-react';
import { readLaterService } from '@/lib/readLaterService';

const TABS = [
    { id: 'active', icon: Activity, label: 'Active' },
    { id: 'spaces', icon: Layers, label: 'Spaces' },
    { id: 'read-later', icon: Clock, label: 'Read Later' },
] as const;

export const ViewSwitcher = () => {
    const { activeView, setActiveView } = useAppStore();

    // Live count of unread items
    const unreadCount = useLiveQuery(readLaterService.getUnreadCountQuery(), []) || 0;

    return (
        <div className="px-4 py-2 border-b border-border bg-background">
            <div className="flex p-1 bg-muted rounded-lg">
                {TABS.map((tab) => {
                    const isActive = activeView === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveView(tab.id)}
                            className={`
                                relative flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ease-out
                                ${isActive
                                    ? 'bg-background text-primary'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }
                            `}
                        >
                            <tab.icon className={`w-3.5 h-3.5 ${isActive ? 'scale-110' : ''} transition-transform duration-200`} />
                            {tab.label}

                            {/* Unread Badge for Read Later */}
                            {tab.id === 'read-later' && unreadCount > 0 && (
                                <span className={`
                                    absolute -top-1 -right-1 min-w-badge-size h-badge-size flex items-center justify-center text-super-mini font-bold text-destructive-foreground bg-destructive rounded-full px-0.5 border-2 border-background
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
