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
