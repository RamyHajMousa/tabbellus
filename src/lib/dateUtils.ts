/**
 * Native Date & Relative Time Utility
 * Uses the native browser Intl.RelativeTimeFormat API without third-party dependencies.
 */

/**
 * Normalizes input date/timestamp into Unix epoch milliseconds.
 */
export function normalizeTimestamp(timestamp: number | string | Date): number {
    if (timestamp instanceof Date) {
        return timestamp.getTime();
    }
    if (typeof timestamp === 'string') {
        const parsed = Date.parse(timestamp);
        return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof timestamp === 'number') {
        return isNaN(timestamp) ? 0 : timestamp;
    }
    return 0;
}

// Cached formatter for performance
const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Formats a timestamp into human-readable relative time (e.g. "yesterday", "2 weeks ago", "3 months ago").
 *
 * @param timestamp Timestamp in milliseconds, ISO string, or Date object
 * @returns Localized relative time string
 */
export function formatRelativeTime(timestamp: number | string | Date): string {
    const timeMs = normalizeTimestamp(timestamp);
    if (!timeMs) return '';

    const now = Date.now();
    const diffInSeconds = Math.round((timeMs - now) / 1000);
    const absSeconds = Math.abs(diffInSeconds);

    // Less than 45 seconds -> "now" / "just now"
    if (absSeconds < 45) {
        return relativeTimeFormatter.format(0, 'second');
    }

    // Less than 60 minutes
    if (absSeconds < 3600) {
        const minutes = Math.round(diffInSeconds / 60);
        return relativeTimeFormatter.format(minutes, 'minute');
    }

    // Less than 24 hours
    if (absSeconds < 86400) {
        const hours = Math.round(diffInSeconds / 3600);
        return relativeTimeFormatter.format(hours, 'hour');
    }

    // Less than 7 days
    if (absSeconds < 604800) {
        const days = Math.round(diffInSeconds / 86400);
        return relativeTimeFormatter.format(days, 'day');
    }

    // Less than 30 days -> in weeks
    if (absSeconds < 2592000) {
        const weeks = Math.round(diffInSeconds / 604800);
        return relativeTimeFormatter.format(weeks, 'week');
    }

    // Less than 365 days -> in months
    if (absSeconds < 31536000) {
        const months = Math.round(diffInSeconds / 2592000);
        return relativeTimeFormatter.format(months, 'month');
    }

    // 1 year or older -> in years
    const years = Math.round(diffInSeconds / 31536000);
    return relativeTimeFormatter.format(years, 'year');
}

/**
 * Evaluates whether an item is stale based on a threshold in days (default: 30 days).
 *
 * @param timestamp Timestamp in milliseconds, ISO string, or Date object
 * @param daysThreshold Number of days before an item is considered stale (default: 30)
 * @returns boolean indicating if the item is older than the threshold
 */
export function isStale(timestamp: number | string | Date, daysThreshold: number = 30): boolean {
    const timeMs = normalizeTimestamp(timestamp);
    if (!timeMs) return false;

    const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;
    return Date.now() - timeMs > thresholdMs;
}
