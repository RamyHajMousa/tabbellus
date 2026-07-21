/**
 * Chrome Session utilities for safe Undo-after-close patterns.
 * Replaces the fixed 100ms heuristic with a polling retry, and
 * centralises the sessionId capture so `restore()` is never called
 * without an explicit session reference.
 */

/**
 * Polls `chrome.sessions.getRecentlyClosed` until a sessionId appears
 * or retries are exhausted. Chrome doesn't fire an event when the
 * session stack updates, so a short polling loop is the most reliable
 * approach.
 *
 * @param maxRetries  Number of attempts (default 3 → waits up to 300ms total)
 * @returns The sessionId string, or undefined if none surfaced in time.
 */
export async function getRecentSessionId(maxRetries = 3): Promise<string | undefined> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 1 });
            const session = sessions[0];
            const id = session?.tab?.sessionId || session?.window?.sessionId;
            if (id) return id;
        } catch {
            // sessions API unavailable (e.g., incognito) — bail immediately
            return undefined;
        }
        await new Promise(r => setTimeout(r, 50 * (i + 1))); // 50ms, 100ms, 150ms
    }
    return undefined;
}

/** Filters out internal browser pages and invalid URLs. */
export function isValidUrl(raw?: string): raw is string {
    if (!raw) return false;
    return !raw.startsWith('chrome://') && !raw.startsWith('edge://') && !raw.startsWith('chrome-extension://') && !raw.startsWith('about:');
}

/**
 * Extracts the hostname with 'www.' stripped.
 */
export function tryParseHost(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
}

/**
 * Fuzzy matches two URLs to handle subdomain redirects and SPA mutations.
 * 
 * Rules:
 * 1. Hosts must match or be subdomains (e.g., 'internetbank.swedbank.se' matches 'swedbank.se')
 * 2. Paths must match or be extensions (e.g., '/maps/place/123' matches '/maps')
 * 3. If saved path is '/', it matches any path on that domain.
 */
export function isFuzzyMatch(savedUrl: string, closedUrl: string): boolean {
    try {
        const saved = new URL(savedUrl);
        const closed = new URL(closedUrl);

        // Hostname Normalization: strip www., lowercase
        const savedHost = saved.hostname.replace(/^www\./, '').toLowerCase();
        const closedHost = closed.hostname.replace(/^www\./, '').toLowerCase();

        // Hostname Check: 'internetbank.swedbank.se' ends with 'swedbank.se'
        if (!savedHost.endsWith(closedHost) && !closedHost.endsWith(savedHost)) {
            return false;
        }

        // Pathname Normalization: strip trailing slash
        const savedPath = saved.pathname.replace(/\/$/, '') || '/';
        const closedPath = closed.pathname.replace(/\/$/, '') || '/';

        // Pathname Check:
        // 1. Exact match (ignoring trailing slash)
        if (savedPath === closedPath) return true;
        // 2. Root path matches anything on domain
        if (savedPath === '/') return true;
        // 3. SPA extension: '/maps/place' starts with '/maps'
        if (closedPath.startsWith(savedPath)) return true;
        // 4. Common path prefix: same first segment = same SPA section
        //    Handles '/maps/@59...' vs '/maps/@60...' where dynamic params diverge
        const savedSegs = savedPath.split('/').filter(Boolean);
        const closedSegs = closedPath.split('/').filter(Boolean);
        if (savedSegs.length > 0 && closedSegs.length > 0 && savedSegs[0] === closedSegs[0]) {
            return true;
        }

        return false;
    } catch {
        // Fallback to strict string equality for non-standard URLs
        return savedUrl.trim().toLowerCase() === closedUrl.trim().toLowerCase();
    }
}
