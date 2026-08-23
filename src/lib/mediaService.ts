/**
 * Media Execution Service
 *
 * Decoupled service for toggling media playback on Chrome tabs
 * via `chrome.scripting.executeScript`. Handles restricted origins,
 * chrome:// URLs, and sandboxed iframes gracefully.
 */

export interface MediaToggleResult {
    success: boolean;
    state?: 'playing' | 'paused';
    error?: string;
}

/**
 * Toggles media playback on the target tab.
 *
 * Injects a self-contained script into all frames that searches for `<video>`
 * and `<audio>` DOM elements or queries `navigator.mediaSession`.
 * If any element is currently playing, all playing elements are paused.
 * If all elements are paused, paused elements are played.
 *
 * @param tabId  Chrome tab ID to target (must be a valid positive integer).
 * @returns      Result object with success flag, new playback state, and optional error.
 */
export async function toggleMediaPlayback(tabId: number): Promise<MediaToggleResult> {
    if (typeof tabId !== 'number' || tabId <= 0 || !Number.isInteger(tabId)) {
        return { success: false, error: 'Invalid tab ID' };
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            func: () => {
                const mediaElements = Array.from(
                    document.querySelectorAll<HTMLVideoElement | HTMLAudioElement>('video, audio')
                );

                if (mediaElements.length === 0) {
                    if ('mediaSession' in navigator && navigator.mediaSession.playbackState) {
                        const current = navigator.mediaSession.playbackState;
                        if (current === 'playing') {
                            navigator.mediaSession.playbackState = 'paused';
                            return { success: true, state: 'paused' as const };
                        } else if (current === 'paused') {
                            navigator.mediaSession.playbackState = 'playing';
                            return { success: true, state: 'playing' as const };
                        }
                    }
                    return { success: false, error: 'NO_MEDIA_FOUND' as const };
                }

                const playing = mediaElements.filter(el => !el.paused && !el.ended);

                if (playing.length > 0) {
                    // Pause all playing media elements
                    playing.forEach(el => {
                        try {
                            el.pause();
                        } catch {
                            // ignore execution error on cross-origin media
                        }
                    });
                    if ('mediaSession' in navigator) {
                        try {
                            navigator.mediaSession.playbackState = 'paused';
                        } catch {
                            // ignore
                        }
                    }
                    return { success: true, state: 'paused' as const };
                }

                // Resume paused media elements
                const paused = mediaElements.filter(el => el.paused && !el.ended);
                if (paused.length > 0) {
                    paused.forEach(el => {
                        try {
                            const playPromise = el.play();
                            if (playPromise && typeof playPromise.catch === 'function') {
                                playPromise.catch(() => { });
                            }
                        } catch {
                            // ignore execution error
                        }
                    });
                    if ('mediaSession' in navigator) {
                        try {
                            navigator.mediaSession.playbackState = 'playing';
                        } catch {
                            // ignore
                        }
                    }
                    return { success: true, state: 'playing' as const };
                }

                return { success: false, error: 'NO_MEDIA_FOUND' as const };
            },
        });

        if (!results || results.length === 0) {
            return { success: false, error: 'NO_MEDIA_FOUND' };
        }

        // Aggregate results across frames — first successful frame result wins
        for (const frame of results) {
            const res = frame?.result as unknown;
            if (!res) continue;
            if (res === 'paused' || res === 'playing') {
                return { success: true, state: res as 'playing' | 'paused' };
            }
            if (typeof res === 'object' && res !== null && 'success' in res) {
                const typed = res as { success: boolean; state?: 'playing' | 'paused' };
                if (typed.success && typed.state) {
                    return { success: true, state: typed.state };
                }
            }
        }

        return { success: false, error: 'NO_MEDIA_FOUND' };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[mediaService] Failed to toggle media on tab ${tabId}:`, message);
        return { success: false, error: message };
    }
}
