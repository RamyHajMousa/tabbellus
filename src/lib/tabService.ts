export const ESTIMATED_RAM_PER_TAB_MB = 150;

export function formatSavedRam(discardedCount: number): string {
    const totalMb = discardedCount * ESTIMATED_RAM_PER_TAB_MB;
    if (totalMb >= 1000) {
        return `~${(totalMb / 1024).toFixed(1)} GB`;
    }
    return `~${totalMb} MB`;
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
     */
    async focusOrCreate(url: string): Promise<void> {
        if (!url) return;

        try {
            // 1. Find all tabs
            const allTabs = await chrome.tabs.query({});
            const target = this.normalizeUrl(url);

            // 2. Find matches
            const matches = allTabs.filter(tab => {
                if (!tab.url) return false;
                return this.normalizeUrl(tab.url) === target;
            });

            // 3. Logic: Pick the best match (most recently accessed if possible, though lastAccessed is tricky in MV3 without history permission, we'll use active or just first one for now as a robust default. Actually, `lastAccessed` property exists on Tab object since Chrome 121, let's try to use it if available, falling back to index 0)

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
                // 4a. Focus Existing
                await chrome.windows.update(bestMatch.windowId, { focused: true }).catch(() => { });
                await chrome.tabs.update(bestMatch.id, { active: true }).catch(async () => {
                    // Fallback: If update fails (tab closed?), create new
                    await chrome.tabs.create({ url }).catch(() => { });
                });
            } else {
                // 4b. Create New
                await chrome.tabs.create({ url }).catch(() => { });
            }
        } catch (e) {
            console.warn('TabService: Failed to focus or create tab:', e);
        }
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
}

// Singleton Export
export const tabService = new TabService();
