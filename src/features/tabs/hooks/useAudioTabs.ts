import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveMediaSession } from './useActiveMediaSession';

export interface AudioTabInfo {
    tab: chrome.tabs.Tab;
    isMuted: boolean;
}

/**
 * Pure function to query and retain audio tabs across Chrome windows.
 *
 * Discovers audible, muted, and active media session tabs, retaining paused
 * and muted media tabs until tab removal, tab discard, or URL change.
 */
export async function queryAudioTabs(trackedTabIds: Map<number, string>): Promise<chrome.tabs.Tab[]> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return [];

    try {
        // 1. Query live audible and muted tabs from browser
        const allAudible = await chrome.tabs.query({ audible: true });
        const allMuted = await chrome.tabs.query({ muted: true });

        // Register newly audible or muted tabs
        allAudible.forEach(t => {
            if (t.id !== undefined && !t.discarded) {
                trackedTabIds.set(t.id, t.url || '');
            }
        });
        allMuted.forEach(t => {
            if (t.id !== undefined && !t.discarded) {
                trackedTabIds.set(t.id, t.url || '');
            }
        });

        // Also check multi-tab active media session store
        const { mediaSessions, lastKnownUrls } = useActiveMediaSession.getState();
        for (const [tabIdStr, state] of Object.entries(mediaSessions)) {
            const tabId = Number(tabIdStr);
            if (state === 'playing' || state === 'paused') {
                trackedTabIds.set(tabId, lastKnownUrls[tabId] || '');
            }
        }

        // 2. Fetch and retain all tracked tabs (including paused & muted media tabs)
        const combinedMap = new Map<number, chrome.tabs.Tab>();

        for (const [id, originalUrl] of Array.from(trackedTabIds.entries())) {
            try {
                const tab = await chrome.tabs.get(id);
                if (!tab || tab.discarded) {
                    trackedTabIds.delete(id);
                    continue;
                }
                // If URL changed (tab navigated to another page), drop it
                if (originalUrl && tab.url && tab.url !== originalUrl) {
                    trackedTabIds.delete(id);
                    continue;
                }
                combinedMap.set(id, tab);
            } catch {
                // Tab was closed
                trackedTabIds.delete(id);
            }
        }

        return Array.from(combinedMap.values());
    } catch (err) {
        console.warn('queryAudioTabs failed', err);
        return [];
    }
}

/**
 * Hook managing audio/media tabs across all Chrome windows.
 *
 * Retains tabs when they are audible, muted, or paused, ensuring the
 * Audio Control Popover stays open and active across playback and mute toggles.
 */
export function useAudioTabs(): {
    audioTabs: chrome.tabs.Tab[];
    audibleCount: number;
    toggleMuteTab: (tabId: number) => Promise<void>;
    muteAllAudioTabs: () => Promise<void>;
    unmuteAllAudioTabs: () => Promise<void>;
} {
    const [audioTabs, setAudioTabs] = useState<chrome.tabs.Tab[]>([]);
    const trackedTabIdsRef = useRef<Map<number, string>>(new Map()); // tabId -> url

    const refreshAudioTabs = useCallback(async () => {
        const tabs = await queryAudioTabs(trackedTabIdsRef.current);
        setAudioTabs(tabs);
    }, []);

    useEffect(() => {
        let mounted = true;

        refreshAudioTabs();

        const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
            if (changeInfo.audible !== undefined || changeInfo.mutedInfo !== undefined || changeInfo.url || changeInfo.discarded) {
                if (changeInfo.discarded || (changeInfo.url && trackedTabIdsRef.current.has(tabId))) {
                    const original = trackedTabIdsRef.current.get(tabId);
                    if (changeInfo.url && original && changeInfo.url !== original) {
                        trackedTabIdsRef.current.delete(tabId);
                    }
                }
                if (mounted) {
                    refreshAudioTabs();
                }
            }
        };

        const handleTabRemoved = (tabId: number) => {
            trackedTabIdsRef.current.delete(tabId);
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
                unmutedTabIds.map(id => chrome.tabs.update(id, { muted: true }).catch(() => { }))
            );
            refreshAudioTabs();
        } catch (err) {
            console.warn('useAudioTabs: muteAllAudioTabs failed', err);
        }
    }, [audioTabs, refreshAudioTabs]);

    const unmuteAllAudioTabs = useCallback(async () => {
        try {
            const mutedTabIds = audioTabs
                .filter(t => t.mutedInfo?.muted && t.id !== undefined)
                .map(t => t.id!);

            await Promise.all(
                mutedTabIds.map(id => chrome.tabs.update(id, { muted: false }).catch(() => { }))
            );
            refreshAudioTabs();
        } catch (err) {
            console.warn('useAudioTabs: unmuteAllAudioTabs failed', err);
        }
    }, [audioTabs, refreshAudioTabs]);

    // Count strictly audible (currently emitting sound) or unmuted playing tabs
    const audibleCount = audioTabs.filter(t => t.audible).length;

    return {
        audioTabs,
        audibleCount,
        toggleMuteTab,
        muteAllAudioTabs,
        unmuteAllAudioTabs,
    };
}
