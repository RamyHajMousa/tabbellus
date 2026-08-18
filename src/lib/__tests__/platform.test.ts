import { describe, it, expect, afterEach } from 'vitest';
import { isMac, formatKeyBinding, getReadLaterShortcutText, isEdge, getOS } from '@/lib/platform';

describe('platform — OS Detection & Keybinding Utilities', () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
        Object.defineProperty(globalThis, 'navigator', {
            value: originalNavigator,
            configurable: true,
            writable: true,
        });
    });

    describe('isMac & formatKeyBinding', () => {
        it('should detect macOS from userAgent and format Mac shortcuts', () => {
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                    platform: 'MacIntel',
                },
                configurable: true,
                writable: true,
            });

            expect(isMac()).toBe(true);
            expect(formatKeyBinding('⌥ R', 'Alt+R')).toBe('⌥ R');
            expect(getReadLaterShortcutText()).toBe('⌥ R');
            expect(getOS()).toBe('MacOS');
        });

        it('should detect Windows from userAgent and format Windows shortcuts', () => {
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    platform: 'Win32',
                },
                configurable: true,
                writable: true,
            });

            expect(isMac()).toBe(false);
            expect(formatKeyBinding('⌥ R', 'Alt+R')).toBe('Alt+R');
            expect(getReadLaterShortcutText()).toBe('Alt+R');
            expect(getOS()).toBe('Windows');
        });

        it('should detect Edge browser correctly', () => {
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
                },
                configurable: true,
                writable: true,
            });

            expect(isEdge()).toBe(true);
        });
    });
});
