import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isFuzzyMatch, isValidUrl, tryParseHost } from '../sessionUtils';

describe('isValidUrl', () => {
    it('should return true for valid HTTP/HTTPS URLs', () => {
        assert.strictEqual(isValidUrl('https://example.com'), true);
        assert.strictEqual(isValidUrl('http://github.com/foo'), true);
    });

    it('should return false for empty or undefined URLs', () => {
        assert.strictEqual(isValidUrl(''), false);
        assert.strictEqual(isValidUrl(undefined), false);
    });

    it('should return false for internal browser pages', () => {
        assert.strictEqual(isValidUrl('chrome://settings'), false);
        assert.strictEqual(isValidUrl('edge://extensions'), false);
        assert.strictEqual(isValidUrl('chrome-extension://abc/popup.html'), false);
        assert.strictEqual(isValidUrl('about:blank'), false);
    });
});

describe('tryParseHost', () => {
    it('should extract hostname with www. stripped', () => {
        assert.strictEqual(tryParseHost('https://www.example.com/path'), 'example.com');
        assert.strictEqual(tryParseHost('http://example.org/'), 'example.org');
    });

    it('should lowercase the hostname', () => {
        assert.strictEqual(tryParseHost('HTTPS://SUB.EXAMPLE.COM'), 'sub.example.com');
    });

    it('should return empty string for invalid URLs', () => {
        assert.strictEqual(tryParseHost('not-a-url'), '');
    });
});

describe('isFuzzyMatch', () => {
    it('should match exact URL strings', () => {
        assert.strictEqual(isFuzzyMatch('https://example.com/foo', 'https://example.com/foo'), true);
    });

    it('should normalize and match subdomains', () => {
        // www normalization
        assert.strictEqual(isFuzzyMatch('https://www.example.com/foo', 'https://example.com/foo'), true);
        // subdomain matching
        assert.strictEqual(isFuzzyMatch('https://internetbank.swedbank.se/home', 'https://swedbank.se/home'), true);
        assert.strictEqual(isFuzzyMatch('https://swedbank.se/home', 'https://internetbank.swedbank.se/home'), true);
    });

    it('should check path compatibility', () => {
        // root path matches anything on the domain
        assert.strictEqual(isFuzzyMatch('https://example.com/', 'https://example.com/some/deep/path'), true);
        // path extension / SPA subroutes
        assert.strictEqual(isFuzzyMatch('https://example.com/maps', 'https://example.com/maps/place/123'), true);
        // common path prefix matching (first path segment)
        assert.strictEqual(isFuzzyMatch('https://example.com/maps/place/abc', 'https://example.com/maps/place/xyz'), true);
    });

    it('should return false for non-matching hosts or paths', () => {
        assert.strictEqual(isFuzzyMatch('https://example.com/maps', 'https://google.com/maps'), false);
        assert.strictEqual(isFuzzyMatch('https://example.com/maps', 'https://example.com/settings'), false);
    });
});
