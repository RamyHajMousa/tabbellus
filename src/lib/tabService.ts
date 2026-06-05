

class TabService {
    /**
     * Normalizes a URL for comparison by stripping trailing slashes and handling case.
     */
    private normalizeUrl(url: string): string {
        try {
            const u = new URL(url);
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
}

// Singleton Export
export const tabService = new TabService();
