/**
 * Usage Tracking for Value Milestone
 * 
 * Tracks daily engagement to prompt users for support after 7 days of active usage.
 * Uses chrome.storage.local for the heavy array of dates, and chrome.storage.sync for the "dismissed" state.
 */

interface UsageData {
    installDate: string;
    activeDays: string[]; // YYYY-MM-DD
}

interface SupportState {
    hasInteractedWithSupport: boolean;
}

const STORAGE_KEY = 'tabbellus_usage_stats';
const SYNC_KEY = 'tabbellus_support_state';

export const initUsageTracking = async (): Promise<void> => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Get current local data
        const local = await chrome.storage.local.get(STORAGE_KEY);
        const data: UsageData = local[STORAGE_KEY] || {
            installDate: new Date().toISOString(),
            activeDays: []
        };

        // Check if today is already recorded
        const lastActive = data.activeDays[data.activeDays.length - 1];
        if (lastActive === today) {
            return;
        }

        // Add today and save
        data.activeDays.push(today);
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
    } catch (e) {
        console.warn('initUsageTracking failed:', e);
    }
};

export const getUsageStats = async (): Promise<{ activeDayCount: number; isEligible: boolean }> => {
    try {
        // Get stats
        const local = await chrome.storage.local.get(STORAGE_KEY);
        const data: UsageData = local[STORAGE_KEY] || { installDate: '', activeDays: [] };

        // Get interaction state
        const sync = await chrome.storage.sync.get(SYNC_KEY);
        const state: SupportState = sync[SYNC_KEY] || { hasInteractedWithSupport: false };

        const activeDayCount = data.activeDays.length;

        // Eligible if 7+ days and hasn't dismissed/interacted
        const isEligible = activeDayCount >= 7 && !state.hasInteractedWithSupport;

        return { activeDayCount, isEligible };
    } catch (e) {
        console.warn('getUsageStats failed:', e);
        return { activeDayCount: 0, isEligible: false };
    }
};

export const markSupportInteracted = async (): Promise<void> => {
    try {
        await chrome.storage.sync.set({ [SYNC_KEY]: { hasInteractedWithSupport: true } });
    } catch (e) {
        console.warn('markSupportInteracted failed:', e);
    }
};
