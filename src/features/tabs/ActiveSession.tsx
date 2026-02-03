import { useState, useMemo } from 'react';
import { spaceService, db, getGroupColorClasses } from '@/lib';
import { useToast } from '@/components/ui/Toaster';
import { Save, LayoutGrid, Ghost } from 'lucide-react';
import { useCurrentTabs } from './hooks/useCurrentTabs';
import { TabRow } from './components/TabRow';
import { GroupRow } from './components/GroupRow';

export const ActiveSession = () => {
    const { tabs, groups, activeTabId } = useCurrentTabs();
    const [spaceName, setSpaceName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    // Grouping Topology
    const groupedTabs = useMemo(() => {

        const groupMap = new Map<number, chrome.tabs.Tab[]>();

        // 1. Bucket tabs
        tabs.forEach(tab => {
            const gid = tab.groupId;
            if (!groupMap.has(gid)) {
                groupMap.set(gid, []);
                // Preserve order of appearance of GROUPS based on their first tab? 
                // Or just iterate tabs and push new groups as we see them?
                // The API order is usually index-based.
            }
            groupMap.get(gid)!.push(tab);
        });

        // 2. Linearize based on tab order (Chrome usually keeps tabs in a group contiguous)
        // We'll iterate the tabs list to discover group order.


        // Better approach:
        // Identify contiguous blocks. 
        // But for now, let's stick to a simpler model: Render Grouped items by Group ID, then Ungrouped? 
        // No, visual fidelity requires order.

        // Final Approach: iterate `tabs`.
        // If tab is ungrouped -> add to render list.
        // If tab is grouped -> if group not yet added, add GROUP block (which contains all its tabs), then mark group as added.

        const renderList: ({ type: 'tab', tab: chrome.tabs.Tab } | { type: 'group', groupId: number, tabs: chrome.tabs.Tab[] })[] = [];
        const processedGroups = new Set<number>();

        tabs.forEach(tab => {
            if (tab.groupId === -1) {
                renderList.push({ type: 'tab', tab });
            } else {
                if (!processedGroups.has(tab.groupId)) {
                    processedGroups.add(tab.groupId);
                    const tabsInGroup = groupMap.get(tab.groupId) || [];
                    renderList.push({ type: 'group', groupId: tab.groupId, tabs: tabsInGroup });
                }
            }
        });

        return renderList;
    }, [tabs]);

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
            await db.readLater.add({
                url: tab.url,
                title: tab.title,
                favicon: tab.favIconUrl,
                addedAt: Date.now(),
                status: 'unread'
            });
            await chrome.tabs.remove(tab.id).catch(() => { });
            toast("Saved to Read Later", { duration: 1500 });
        } catch (err) {
            console.error(err);
            toast("Failed to save to Read Later");
        }
    };

    const handleClose = async (e: React.MouseEvent, tab: chrome.tabs.Tab) => {
        e.stopPropagation();
        if (!tab.id) return;

        const tabId = tab.id;
        const tabUrl = tab.url || '';

        // Skip Undo for blank tabs (Chrome doesn't save these)
        const isBlankTab = tabUrl === '' || tabUrl === 'chrome://newtab/' || tabUrl === 'about:blank';

        try {
            await chrome.tabs.remove(tabId);

            if (isBlankTab) {
                toast("Tab closed", { duration: 2000 });
                return;
            }

            // Wait briefly for Chrome to update session stack
            await new Promise(r => setTimeout(r, 100));

            // Fetch the most recently closed session
            const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 1 });
            const session = sessions[0];
            const sessionId = session?.tab?.sessionId || session?.window?.sessionId;

            if (sessionId) {
                toast("Tab closed", {
                    duration: 4000,
                    onUndo: () => {
                        chrome.sessions.restore(sessionId).catch(console.error);
                    }
                });
            } else {
                // No sessionId available (e.g., incognito)
                toast("Tab closed", { duration: 2000 });
            }
        } catch {
            // Tab might already be closed
        }
    };

    const handleCloseGroup = (e: React.MouseEvent, groupTabs: chrome.tabs.Tab[]) => {
        e.stopPropagation();
        const ids = groupTabs.map(t => t.id).filter((id): id is number => id !== undefined);

        if (ids.length > 0) {
            chrome.tabs.remove(ids).then(() => {
                toast(`Closed group with ${ids.length} tabs`, {
                    duration: 4000,
                    onUndo: () => {
                        chrome.sessions.restore().catch(console.error);
                    }
                });
            }).catch(() => { });
        }
    };

    const handleArchiveGroup = async (e: React.MouseEvent, group: chrome.tabGroups.TabGroup, tabs: chrome.tabs.Tab[]) => {
        e.stopPropagation();
        const ids = tabs.map(t => t.id).filter((id): id is number => id !== undefined);
        if (ids.length === 0) return;

        try {
            await spaceService.createSpaceFromTabs(group.title || '', tabs);
            await chrome.tabs.remove(ids);
            toast("Group archived to Spaces", { duration: 2000 });
        } catch (err) {
            console.error(err);
            toast("Failed to archive group");
        }
    };

    return (
        <div className="flex flex-col h-full select-none">
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
                {groupedTabs.map((item, index) => {
                    if (item.type === 'tab') {
                        return (
                            <TabRow
                                key={item.tab.id || `tab-u-${index}`}
                                tab={item.tab}
                                isActive={item.tab.id === activeTabId}
                                onClose={(e) => handleClose(e, item.tab)}
                                onReadLater={(e) => handleReadLater(e, item.tab)}
                            />
                        );
                    } else {
                        // Group Block
                        const group = groups.get(item.groupId);
                        if (!group) return null; // Should ideally not happen if synced
                        const colors = getGroupColorClasses(group.color);

                        return (
                            <div key={`group-${item.groupId}`} className="mb-1">
                                <GroupRow
                                    group={group}
                                    onClose={(e) => handleCloseGroup(e, item.tabs)}
                                    onArchive={(e) => handleArchiveGroup(e, group, item.tabs)}
                                />

                                {/* Group Children */}
                                {!group.collapsed && (
                                    <div className={`pl-[14px] border-l-2 ml-2 space-y-0.5 mt-0.5 relative ${colors.border}`}>
                                        {/* Visual Guide Line Extension can be CSS-ed, but simple border-l worked well in context */}
                                        {item.tabs.map(t => (
                                            <TabRow
                                                key={t.id || `tab-g-${t.index}`}
                                                tab={t}
                                                isActive={t.id === activeTabId}
                                                onClose={(e) => handleClose(e, t)}
                                                onReadLater={(e) => handleReadLater(e, t)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }
                })}

                {tabs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground opacity-50">
                        <Ghost className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-xs">No active tabs</p>
                    </div>
                )}
            </div>
        </div>
    );
};
