import { describe, it, expect } from 'vitest';
import { isFuzzyMatch, isValidUrl, tryParseHost } from '../sessionUtils';

describe('isValidUrl', () => {
    it('should return true for valid HTTP/HTTPS URLs', () => {
        expect(isValidUrl('https://example.com')).toBe(true);
        expect(isValidUrl('http://github.com/foo')).toBe(true);
    });

    it('should return false for empty or undefined URLs', () => {
        expect(isValidUrl('')).toBe(false);
        expect(isValidUrl(undefined)).toBe(false);
    });

    it('should return false for internal browser pages', () => {
        expect(isValidUrl('chrome://settings')).toBe(false);
        expect(isValidUrl('edge://extensions')).toBe(false);
        expect(isValidUrl('chrome-extension://abc/popup.html')).toBe(false);
        expect(isValidUrl('about:blank')).toBe(false);
    });
});

describe('tryParseHost', () => {
    it('should extract hostname with www. stripped', () => {
        expect(tryParseHost('https://www.example.com/path')).toBe('example.com');
        expect(tryParseHost('http://example.org/')).toBe('example.org');
    });

    it('should lowercase the hostname', () => {
        expect(tryParseHost('HTTPS://SUB.EXAMPLE.COM')).toBe('sub.example.com');
    });

    it('should return empty string for invalid URLs', () => {
        expect(tryParseHost('not-a-url')).toBe('');
    });
});

describe('isFuzzyMatch', () => {
    it('should match exact URL strings', () => {
        expect(isFuzzyMatch('https://example.com/foo', 'https://example.com/foo')).toBe(true);
    });

    it('should normalize and match subdomains', () => {
        // www normalization
        expect(isFuzzyMatch('https://www.example.com/foo', 'https://example.com/foo')).toBe(true);
        // subdomain matching
        expect(isFuzzyMatch('https://internetbank.swedbank.se/home', 'https://swedbank.se/home')).toBe(true);
        expect(isFuzzyMatch('https://swedbank.se/home', 'https://internetbank.swedbank.se/home')).toBe(true);
    });

    it('should check path compatibility', () => {
        // root path matches anything on the domain
        expect(isFuzzyMatch('https://example.com/', 'https://example.com/some/deep/path')).toBe(true);
        // path extension / SPA subroutes
        expect(isFuzzyMatch('https://example.com/maps', 'https://example.com/maps/place/123')).toBe(true);
        // common path prefix matching (first path segment)
        expect(isFuzzyMatch('https://example.com/maps/place/abc', 'https://example.com/maps/place/xyz')).toBe(true);
    });

    it('should return false for non-matching hosts or paths', () => {
        expect(isFuzzyMatch('https://example.com/maps', 'https://google.com/maps')).toBe(false);
        expect(isFuzzyMatch('https://example.com/maps', 'https://example.com/settings')).toBe(false);
    });
});
