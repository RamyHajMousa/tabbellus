export const ESTIMATED_RAM_PER_TAB_MB = 150;

export function formatSavedRam(discardedCount: number): string {
    const totalMb = discardedCount * ESTIMATED_RAM_PER_TAB_MB;
    if (totalMb >= 1000) {
        return `~${(totalMb / 1024).toFixed(1)} GB`;
    }
    return `~${totalMb} MB`;
}

export interface FocusOrCreateResult {
    action: 'focused' | 'created';
    tabId: number;
    windowId: number;
}

class TabService {
    /**
     * Normalizes a URL for comparison by stripping trailing slashes, handling case, and removing tracking params.
     */
    normalizeUrl(url: string): string {
        try {
            const u = new URL(url);
            
            // Remove common tracking parameters
            const paramsToDelete: string[] = [];
            u.searchParams.forEach((_, key) => {
                const lowerKey = key.toLowerCase();
                if (lowerKey.startsWith('utm_') || lowerKey === 'gclid' || lowerKey === 'fbclid' || lowerKey === 'ref') {
                    paramsToDelete.push(key);
                }
            });
            paramsToDelete.forEach(key => u.searchParams.delete(key));

            // Protocol + Host + Pathname (without trailing slash) + Search + Hash
            let clean = u.origin + u.pathname.replace(/\/$/, '') + u.search + u.hash;
            return clean.toLowerCase();
        } catch {
            return url.trim().replace(/\/$/, '').toLowerCase();
        }
    }

    /**
     * Focuses an existing tab with the matching URL, or creates a new one.
     * @param url The URL to navigate to.
     * @returns Typed result containing the action ('focused' | 'created'), tabId, and windowId.
     */
    async focusOrCreate(url: string): Promise<FocusOrCreateResult | undefined> {
        if (!url) return undefined;

        try {
            // 1. Find all tabs
            const allTabs = await chrome.tabs.query({});
            const target = this.normalizeUrl(url);

            // 2. Find matches
            const matches = allTabs.filter(tab => {
                if (!tab.url) return false;
                return this.normalizeUrl(tab.url) === target;
            });

            // 3. Logic: Pick the best match (most recently accessed if possible, falling back to index 0)
            let bestMatch = matches[0];
            if (matches.length > 1) {
                // Sort by lastAccessed descending if available
                matches.sort((a, b) => {
                    const timeA = (a as any).lastAccessed || 0;
                    const timeB = (b as any).lastAccessed || 0;
                    return timeB - timeA;
                });
                bestMatch = matches[0];
            }

            if (bestMatch && bestMatch.id && bestMatch.windowId) {
                // 4a. Focus Existing Window & Tab
                await chrome.windows.update(bestMatch.windowId, { focused: true }).catch(() => { });
                try {
                    await chrome.tabs.update(bestMatch.id, { active: true });
                    return {
                        action: 'focused',
                        tabId: bestMatch.id,
                        windowId: bestMatch.windowId
                    };
                } catch {
                    // Fallback: If update fails (tab closed in race condition), create new
                    const newTab = await chrome.tabs.create({ url }).catch(() => null);
                    if (newTab && newTab.id && newTab.windowId) {
                        return {
                            action: 'created',
                            tabId: newTab.id,
                            windowId: newTab.windowId
                        };
                    }
                }
            } else {
                // 4b. Create New Tab
                const newTab = await chrome.tabs.create({ url }).catch(() => null);
                if (newTab && newTab.id && newTab.windowId) {
                    return {
                        action: 'created',
                        tabId: newTab.id,
                        windowId: newTab.windowId
                    };
                }
            }
        } catch (e) {
            console.warn('TabService: Failed to focus or create tab:', e);
        }
        return undefined;
    }

    /**
     * Identifies duplicate tabs based on normalized URLs.
     * Hierarchy for retained tab: Pinned > Active > Lowest Index
     */
    calculateDuplicates(tabs: chrome.tabs.Tab[]): { duplicates: chrome.tabs.Tab[], retained: chrome.tabs.Tab[] } {
        const grouped = new Map<string, chrome.tabs.Tab[]>();
        
        tabs.forEach(tab => {
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
            const normalized = this.normalizeUrl(tab.url);
            if (!grouped.has(normalized)) {
                grouped.set(normalized, []);
            }
            grouped.get(normalized)!.push(tab);
        });

        const duplicates: chrome.tabs.Tab[] = [];
        const retained: chrome.tabs.Tab[] = [];

        grouped.forEach(group => {
            if (group.length > 1) {
                // Sort by priority: Pinned > Active > Index
                group.sort((a, b) => {
                    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                    if (a.active !== b.active) return a.active ? -1 : 1;
                    return a.index - b.index;
                });
                
                retained.push(group[0]);
                duplicates.push(...group.slice(1));
            } else if (group.length === 1) {
                retained.push(group[0]);
            }
        });

        return { duplicates, retained };
    }

    /**
     * Retrieves the current zoom factor of the specified tab.
     * Defaults to 1.0 (100%) if query fails or tab is invalid.
     */
    async getTabZoom(tabId: number): Promise<number> {
        if (!tabId || tabId < 0) return 1.0;
        try {
            return await chrome.tabs.getZoom(tabId);
        } catch (err) {
            console.warn('TabService: getZoom failed:', err);
            return 1.0;
        }
    }

    /**
     * Sets the zoom factor for the specified tab, clamped between 0.25 and 5.0.
     */
    async setTabZoom(tabId: number, zoomFactor: number): Promise<void> {
        if (!tabId || tabId < 0) return;
        const clampedZoom = Math.min(Math.max(0.25, Number(zoomFactor.toFixed(2))), 5.0);
        try {
            await chrome.tabs.setZoom(tabId, clampedZoom);
        } catch (err) {
            console.warn('TabService: setZoom failed:', err);
        }
    }
}

// Singleton Export
export const tabService = new TabService();
