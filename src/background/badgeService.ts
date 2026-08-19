import { db } from '@/lib/db';

const BADGE_BACKGROUND_COLOR = '#27272a';

/**
 * Dynamically computes and updates the Chrome extension action badge
 * based on user settings ('tabs' | 'read-later' | 'none').
 */
export const updateGlobalBadge = async (): Promise<void> => {
    try {
        if (typeof chrome === 'undefined' || !chrome.action) {
            return;
        }

        const res = await chrome.storage.local.get('tabbellus-settings');
        let badgeMode: 'none' | 'tabs' | 'read-later' = 'read-later';

        if (res && res['tabbellus-settings']) {
            try {
                const parsed = typeof res['tabbellus-settings'] === 'string'
                    ? JSON.parse(res['tabbellus-settings'])
                    : res['tabbellus-settings'];
                badgeMode = parsed?.state?.settings?.badgeMode
                    ?? parsed?.state?.badgeMode
                    ?? parsed?.settings?.badgeMode
                    ?? 'read-later';
            } catch (parseErr) {
                console.warn('Background Badge: Error parsing persisted settings:', parseErr);
            }
        }

        let badgeText = '';

        if (badgeMode === 'tabs') {
            if (chrome.tabs?.query) {
                const openTabs = await chrome.tabs.query({});
                const count = openTabs.length;
                badgeText = count > 0 ? String(count) : '';
            }
        } else if (badgeMode === 'read-later') {
            if (!db.isOpen()) {
                await db.open();
            }
            const unreadCount = await db.readLater.where('status').equals('unread').count();
            badgeText = unreadCount > 0 ? String(unreadCount) : '';
        } else {
            badgeText = '';
        }

        await chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
        await chrome.action.setBadgeText({ text: badgeText });
    } catch (error) {
        console.warn('Background Badge: Failed to update global badge:', error);
    }
};
