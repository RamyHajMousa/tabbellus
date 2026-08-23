import { create } from 'zustand';
import { toggleMediaPlayback } from '@/lib/mediaService';

export type MediaPlaybackState = 'playing' | 'paused';

export interface ActiveMediaSessionState {
    /**
     * Multi-tab dictionary mapping Chrome tab IDs to their active playback state.
     * e.g. { 101: 'playing', 102: 'paused' }
     */
    mediaSessions: Record<number, MediaPlaybackState>;
    /**
     * Map of tab IDs to their last known URLs for navigation teardown detection.
     */
    lastKnownUrls: Record<number, string>;
    /**
     * Sets or updates media session state for an individual tab.
     */
    setTabMediaState: (tabId: number, state: MediaPlaybackState | 'idle', url?: string | null) => void;
    /**
     * Removes an individual tab from the media session registry.
     */
    removeTabMediaSession: (tabId: number) => void;
    /**
     * Clears all media sessions.
     */
    clearAllSessions: () => void;
    /**
     * Toggles media playback for a target tab with immediate optimistic state flip.
     */
    togglePlayback: (tabId: number) => Promise<void>;
    /**
     * Initializes Chrome runtime listeners for audible updates, removals, and navigations.
     */
    initSessionListener: () => () => void;
}

export const useActiveMediaSession = create<ActiveMediaSessionState>((set, get) => ({
    mediaSessions: {},
    lastKnownUrls: {},

    setTabMediaState: (tabId: number, state: MediaPlaybackState | 'idle', url?: string | null) => {
        if (state === 'idle') {
            get().removeTabMediaSession(tabId);
            return;
        }

        set((prev) => ({
            mediaSessions: {
                ...prev.mediaSessions,
                [tabId]: state,
            },
            lastKnownUrls: {
                ...prev.lastKnownUrls,
                ...(url ? { [tabId]: url } : {}),
            },
        }));
    },

    removeTabMediaSession: (tabId: number) => {
        set((prev) => {
            if (!(tabId in prev.mediaSessions) && !(tabId in prev.lastKnownUrls)) {
                return prev;
            }
            const nextSessions = { ...prev.mediaSessions };
            const nextUrls = { ...prev.lastKnownUrls };
            delete nextSessions[tabId];
            delete nextUrls[tabId];
            return {
                mediaSessions: nextSessions,
                lastKnownUrls: nextUrls,
            };
        });
    },

    clearAllSessions: () => {
        set({
            mediaSessions: {},
            lastKnownUrls: {},
        });
    },

    togglePlayback: async (tabId: number) => {
        if (!tabId || typeof tabId !== 'number' || tabId <= 0) return;

        const currentSessions = get().mediaSessions;
        const currentState = currentSessions[tabId] ?? 'playing';
        const nextState: MediaPlaybackState = currentState === 'playing' ? 'paused' : 'playing';

        // 1. Immediate optimistic state flip for this specific tab
        set((prev) => ({
            mediaSessions: {
                ...prev.mediaSessions,
                [tabId]: nextState,
            },
        }));

        // 2. Programmatic script execution
        const result = await toggleMediaPlayback(tabId);

        // 3. Reconcile with verified returned state
        if (!result.success) {
            // Revert state on failure
            set((prev) => ({
                mediaSessions: {
                    ...prev.mediaSessions,
                    [tabId]: currentState,
                },
            }));
        } else if (result.state) {
            set((prev) => ({
                mediaSessions: {
                    ...prev.mediaSessions,
                    [tabId]: result.state!,
                },
            }));
        }
    },

    initSessionListener: () => {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            return () => { };
        }

        // Initial scan for currently audible tabs
        chrome.tabs.query({ audible: true }).then((tabs) => {
            if (tabs.length > 0) {
                const initialSessions: Record<number, MediaPlaybackState> = {};
                const initialUrls: Record<number, string> = {};
                tabs.forEach((tab) => {
                    if (tab.id && !tab.discarded) {
                        initialSessions[tab.id] = 'playing';
                        if (tab.url) initialUrls[tab.id] = tab.url;
                    }
                });
                set((prev) => ({
                    mediaSessions: { ...prev.mediaSessions, ...initialSessions },
                    lastKnownUrls: { ...prev.lastKnownUrls, ...initialUrls },
                }));
            }
        }).catch(() => { });

        const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
            const { mediaSessions, lastKnownUrls } = get();
            const isTracked = tabId in mediaSessions;
            const knownUrl = lastKnownUrls[tabId];

            // 1. Activation: Tab becomes audible -> track as 'playing'
            if (changeInfo.audible === true) {
                set((prev) => ({
                    mediaSessions: {
                        ...prev.mediaSessions,
                        [tabId]: 'playing',
                    },
                    lastKnownUrls: {
                        ...prev.lastKnownUrls,
                        [tabId]: tab.url || changeInfo.url || knownUrl || '',
                    },
                }));
                return;
            }

            // 2. Events for currently tracked tabs
            if (isTracked) {
                // Teardown: URL navigation
                if (changeInfo.url && knownUrl && changeInfo.url !== knownUrl) {
                    get().removeTabMediaSession(tabId);
                    return;
                }

                // Teardown: Tab discarded
                if (tab.discarded || changeInfo.discarded) {
                    get().removeTabMediaSession(tabId);
                    return;
                }

                // Pause Retention: Audible transitioned from true to false
                if (changeInfo.audible === false) {
                    if (mediaSessions[tabId] === 'playing') {
                        set((prev) => ({
                            mediaSessions: {
                                ...prev.mediaSessions,
                                [tabId]: 'paused',
                            },
                        }));
                    }
                }
            }
        };

        const handleTabRemoved = (removedTabId: number) => {
            get().removeTabMediaSession(removedTabId);
        };

        chrome.tabs.onUpdated?.addListener(handleTabUpdated);
        chrome.tabs.onRemoved?.addListener(handleTabRemoved);

        return () => {
            chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
            chrome.tabs.onRemoved?.removeListener(handleTabRemoved);
        };
    },
}));

// Automatically initialize listeners in extension runtime
if (typeof chrome !== 'undefined' && chrome.tabs) {
    useActiveMediaSession.getState().initSessionListener();
}
