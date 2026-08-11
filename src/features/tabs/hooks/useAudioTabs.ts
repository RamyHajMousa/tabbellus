import { useState, useEffect, useCallback } from 'react';

export interface AudioTabInfo {
    tab: chrome.tabs.Tab;
    isMuted: boolean;
}

export function useAudioTabs(): {
    audioTabs: chrome.tabs.Tab[];
    audibleCount: number;
    toggleMuteTab: (tabId: number) => Promise<void>;
    muteAllAudioTabs: () => Promise<void>;
} {
    const [audioTabs, setAudioTabs] = useState<chrome.tabs.Tab[]>([]);

    const refreshAudioTabs = useCallback(async () => {
        try {
            if (typeof chrome === 'undefined' || !chrome.tabs) return;
            // Query all tabs in browser across windows that are audible or muted
            const allAudible = await chrome.tabs.query({ audible: true });
            // Also include tabs that are muted to allow unmuting
            const allMuted = await chrome.tabs.query({ muted: true });
            
            const combinedMap = new Map<number, chrome.tabs.Tab>();
            allAudible.forEach(t => t.id !== undefined && combinedMap.set(t.id, t));
            allMuted.forEach(t => t.id !== undefined && combinedMap.set(t.id, t));

            setAudioTabs(Array.from(combinedMap.values()));
        } catch (err) {
            console.warn('useAudioTabs: query failed', err);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        refreshAudioTabs();

        const handleTabUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
            if (changeInfo.audible !== undefined || changeInfo.mutedInfo !== undefined) {
                if (mounted) {
                    refreshAudioTabs();
                }
            }
        };

        const handleTabRemoved = () => {
            if (mounted) {
                refreshAudioTabs();
            }
        };

        const handleTabCreated = () => {
            if (mounted) {
                refreshAudioTabs();
            }
        };

        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.onUpdated?.addListener(handleTabUpdated);
            chrome.tabs.onRemoved?.addListener(handleTabRemoved);
            chrome.tabs.onCreated?.addListener(handleTabCreated);
        }

        return () => {
            mounted = false;
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
                chrome.tabs.onRemoved?.removeListener(handleTabRemoved);
                chrome.tabs.onCreated?.removeListener(handleTabCreated);
            }
        };
    }, [refreshAudioTabs]);

    const toggleMuteTab = useCallback(async (tabId: number) => {
        if (!tabId) return;
        try {
            const target = audioTabs.find(t => t.id === tabId);
            const nextMuted = !(target?.mutedInfo?.muted);
            await chrome.tabs.update(tabId, { muted: nextMuted });
            refreshAudioTabs();
        } catch (err) {
            console.warn('useAudioTabs: toggleMuteTab failed', err);
        }
    }, [audioTabs, refreshAudioTabs]);

    const muteAllAudioTabs = useCallback(async () => {
        try {
            const unmutedTabIds = audioTabs
                .filter(t => !t.mutedInfo?.muted && t.id !== undefined)
                .map(t => t.id!);

            await Promise.all(
                unmutedTabIds.map(id => chrome.tabs.update(id, { muted: true }).catch(() => {}))
            );
            refreshAudioTabs();
        } catch (err) {
            console.warn('useAudioTabs: muteAllAudioTabs failed', err);
        }
    }, [audioTabs, refreshAudioTabs]);

    // Count strictly audible (currently emitting sound) or unmuted playing tabs
    const audibleCount = audioTabs.filter(t => t.audible).length;

    return {
        audioTabs,
        audibleCount,
        toggleMuteTab,
        muteAllAudioTabs,
    };
}
