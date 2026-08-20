/**
 * DiscardService — Tab Memory Reclamation Engine
 *
 * Stateless evaluation service that determines tab eligibility for memory
 * suspension via chrome.tabs.discard() and executes sweep cycles.
 */

export const isInternalOrUnsupportedUrl = (url?: string): boolean => {
    if (!url) return true;
    const lower = url.toLowerCase().trim();
    return (
        lower.startsWith('chrome://') ||
        lower.startsWith('edge://') ||
        lower.startsWith('about:') ||
        lower.startsWith('chrome-extension://') ||
        lower.startsWith('devtools://') ||
        lower.startsWith('view-source:') ||
        lower.startsWith('javascript:')
    );
};

export type EvaluatableTab = chrome.tabs.Tab & { lastAccessed?: number };

/**
 * Tab Discard Predicate:
 * Evaluates whether a candidate tab is eligible for chrome.tabs.discard().
 * Satisfied ONLY when ALL of the following criteria match:
 * 1. tab.active === false
 * 2. tab.pinned === false
 * 3. tab.audible === false
 * 4. tab.discarded === false
 * 5. tab.id is defined and not present in lockedTabIds
 * 6. tab.url is a valid web scheme (not internal/browser scheme)
 * 7. intervalMinutes > 0 and Date.now() - (tab.lastAccessed ?? 0) >= intervalInMilliseconds
 */
export const isTabEligibleForDiscard = (
    tab: EvaluatableTab,
    intervalMinutes: number,
    lockedTabIds: number[] = [],
    currentTime: number = Date.now()
): boolean => {
    if (!intervalMinutes || intervalMinutes <= 0) {
        return false;
    }

    if (tab.active || tab.pinned || tab.audible || tab.discarded) {
        return false;
    }

    if (tab.id === undefined || lockedTabIds.includes(tab.id)) {
        return false;
    }

    if (isInternalOrUnsupportedUrl(tab.url)) {
        return false;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    const lastAccessed = tab.lastAccessed ?? 0;
    const elapsed = currentTime - lastAccessed;

    return elapsed >= intervalMs;
};

/**
 * Extracts all eligible discard candidate tabs from a list of tabs.
 */
export const getDiscardCandidates = (
    tabs: EvaluatableTab[],
    intervalMinutes: number,
    lockedTabIds: number[] = [],
    currentTime: number = Date.now()
): EvaluatableTab[] => {
    if (!intervalMinutes || intervalMinutes <= 0) {
        return [];
    }

    return tabs.filter((tab) =>
        isTabEligibleForDiscard(tab, intervalMinutes, lockedTabIds, currentTime)
    );
};

/**
 * Executes a full tab memory reclamation sweep across all open browser tabs.
 * @param intervalMinutes Optional interval in minutes override. If omitted, reads from storage.
 * @returns Total number of successfully discarded tabs.
 */
export const runDiscardSweep = async (intervalMinutes?: number): Promise<number> => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query || !chrome.tabs?.discard) {
        return 0;
    }

    let interval = intervalMinutes;

    if (interval === undefined) {
        try {
            const res = await chrome.storage.local.get('tabbellus-settings');
            if (res && res['tabbellus-settings']) {
                const parsed = typeof res['tabbellus-settings'] === 'string'
                    ? JSON.parse(res['tabbellus-settings'])
                    : res['tabbellus-settings'];
                interval = parsed?.state?.settings?.autoDiscardInterval
                    ?? parsed?.settings?.autoDiscardInterval
                    ?? 0;
            } else {
                interval = 0;
            }
        } catch (err) {
            console.warn('DiscardService: Error loading settings:', err);
            interval = 0;
        }
    }

    if (!interval || interval <= 0) {
        return 0;
    }

    try {
        const lockedRes = await chrome.storage.session.get('lockedTabIds').catch(() => ({ lockedTabIds: [] }));
        const lockedTabIds: number[] = Array.isArray(lockedRes?.lockedTabIds) ? lockedRes.lockedTabIds : [];

        const allTabs = await chrome.tabs.query({});
        const candidates = getDiscardCandidates(allTabs, interval, lockedTabIds);

        if (candidates.length === 0) {
            return 0;
        }

        let discardedCount = 0;
        for (const tab of candidates) {
            if (tab.id !== undefined) {
                try {
                    await chrome.tabs.discard(tab.id);
                    discardedCount++;
                } catch (discardErr) {
                    console.warn(`DiscardService: Could not discard tab ${tab.id}:`, discardErr);
                }
            }
        }

        console.log(`DiscardService: Sweep completed. Discarded ${discardedCount}/${candidates.length} candidate tabs.`);
        return discardedCount;
    } catch (err) {
        console.error('DiscardService: Sweep failed with error:', err);
        return 0;
    }
};
