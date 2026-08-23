import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toggleMediaPlayback } from '../mediaService';

// ── Chrome API Mocks ──────────────────────────────────────────────────────────

beforeEach(() => {
    vi.restoreAllMocks();

    // Base mock for chrome.scripting.executeScript
    (globalThis as any).chrome = {
        scripting: {
            executeScript: vi.fn(),
        },
    };
});

describe('mediaService – toggleMediaPlayback', () => {
    it('dispatches chrome.scripting.executeScript with correct target and allFrames', async () => {
        const mockExecute = vi.fn().mockResolvedValue([{ result: { success: true, state: 'paused' } }]);
        chrome.scripting.executeScript = mockExecute;

        await toggleMediaPlayback(42);

        expect(mockExecute).toHaveBeenCalledTimes(1);
        const callArgs = mockExecute.mock.calls[0][0];
        expect(callArgs.target).toEqual({ tabId: 42, allFrames: true });
        expect(typeof callArgs.func).toBe('function');
    });

    it('returns success with paused state when media is paused (object format)', async () => {
        chrome.scripting.executeScript = vi.fn().mockResolvedValue([{ result: { success: true, state: 'paused' } }]);

        const result = await toggleMediaPlayback(1);

        expect(result).toEqual({ success: true, state: 'paused' });
    });

    it('returns success with playing state when media is resumed (object format)', async () => {
        chrome.scripting.executeScript = vi.fn().mockResolvedValue([{ result: { success: true, state: 'playing' } }]);

        const result = await toggleMediaPlayback(1);

        expect(result).toEqual({ success: true, state: 'playing' });
    });

    it('supports backward-compatible string result format from frame', async () => {
        chrome.scripting.executeScript = vi.fn().mockResolvedValue([{ result: 'paused' }]);

        const result = await toggleMediaPlayback(1);

        expect(result).toEqual({ success: true, state: 'paused' });
    });

    it('normalizes errors when executeScript rejects (restricted origin) and logs warning', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        chrome.scripting.executeScript = vi.fn().mockRejectedValue(
            new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.')
        );

        const result = await toggleMediaPlayback(99);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot access contents');
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('handles invalid tab IDs gracefully without invoking executeScript', async () => {
        expect(await toggleMediaPlayback(-1)).toEqual({ success: false, error: 'Invalid tab ID' });
        expect(await toggleMediaPlayback(0)).toEqual({ success: false, error: 'Invalid tab ID' });
        expect(await toggleMediaPlayback(NaN)).toEqual({ success: false, error: 'Invalid tab ID' });
        expect(await toggleMediaPlayback(1.5)).toEqual({ success: false, error: 'Invalid tab ID' });
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('returns NO_MEDIA_FOUND error when no controllable media is found', async () => {
        chrome.scripting.executeScript = vi.fn().mockResolvedValue([{ result: { success: false, error: 'NO_MEDIA_FOUND' } }]);

        const result = await toggleMediaPlayback(5);

        expect(result.success).toBe(false);
        expect(result.error).toBe('NO_MEDIA_FOUND');
    });

    it('returns NO_MEDIA_FOUND when executeScript returns empty results array', async () => {
        chrome.scripting.executeScript = vi.fn().mockResolvedValue([]);

        const result = await toggleMediaPlayback(5);

        expect(result.success).toBe(false);
        expect(result.error).toBe('NO_MEDIA_FOUND');
    });
});
