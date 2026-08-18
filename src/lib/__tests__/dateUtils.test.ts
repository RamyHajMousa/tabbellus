import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, isStale, normalizeTimestamp } from '@/lib/dateUtils';

describe('dateUtils — Native Relative Time & Staleness', () => {
    const FIXED_NOW = 1700000000000; // Fixed timestamp for deterministic testing

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('normalizeTimestamp', () => {
        it('should handle Date object, number, and string correctly', () => {
            const date = new Date(FIXED_NOW);
            expect(normalizeTimestamp(date)).toBe(FIXED_NOW);
            expect(normalizeTimestamp(FIXED_NOW)).toBe(FIXED_NOW);
            expect(normalizeTimestamp(date.toISOString())).toBe(FIXED_NOW);
            expect(normalizeTimestamp('invalid-date')).toBe(0);
        });
    });

    describe('formatRelativeTime', () => {
        it('should return empty string for invalid timestamp', () => {
            expect(formatRelativeTime(0)).toBe('');
            expect(formatRelativeTime('invalid')).toBe('');
        });

        it('should format seconds as now / just now', () => {
            expect(formatRelativeTime(FIXED_NOW - 10 * 1000)).toBe('now');
        });

        it('should format minutes ago', () => {
            expect(formatRelativeTime(FIXED_NOW - 5 * 60 * 1000)).toBe('5 minutes ago');
            expect(formatRelativeTime(FIXED_NOW - 1 * 60 * 1000)).toBe('1 minute ago');
        });

        it('should format hours ago', () => {
            expect(formatRelativeTime(FIXED_NOW - 3 * 3600 * 1000)).toBe('3 hours ago');
            expect(formatRelativeTime(FIXED_NOW - 1 * 3600 * 1000)).toBe('1 hour ago');
        });

        it('should format days ago / yesterday', () => {
            expect(formatRelativeTime(FIXED_NOW - 1 * 86400 * 1000)).toBe('yesterday');
            expect(formatRelativeTime(FIXED_NOW - 4 * 86400 * 1000)).toBe('4 days ago');
        });

        it('should format weeks ago', () => {
            expect(formatRelativeTime(FIXED_NOW - 14 * 86400 * 1000)).toBe('2 weeks ago');
        });

        it('should format months ago', () => {
            expect(formatRelativeTime(FIXED_NOW - 60 * 86400 * 1000)).toBe('2 months ago');
        });

        it('should format years ago', () => {
            expect(formatRelativeTime(FIXED_NOW - 400 * 86400 * 1000)).toBe('last year');
            expect(formatRelativeTime(FIXED_NOW - 800 * 86400 * 1000)).toBe('2 years ago');
        });
    });

    describe('isStale', () => {
        it('should return false for invalid timestamp', () => {
            expect(isStale(0)).toBe(false);
            expect(isStale('invalid')).toBe(false);
        });

        it('should return false for recent items (under threshold)', () => {
            const tenDaysAgo = FIXED_NOW - 10 * 86400 * 1000;
            expect(isStale(tenDaysAgo, 30)).toBe(false);
        });

        it('should return true for items older than the threshold', () => {
            const thirtyOneDaysAgo = FIXED_NOW - 31 * 86400 * 1000;
            expect(isStale(thirtyOneDaysAgo, 30)).toBe(true);
        });

        it('should support custom thresholds', () => {
            const eightDaysAgo = FIXED_NOW - 8 * 86400 * 1000;
            expect(isStale(eightDaysAgo, 7)).toBe(true);
            expect(isStale(eightDaysAgo, 14)).toBe(false);
        });
    });
});
