/**
 * GoogleAuthClient Unit Tests
 *
 * Verifies OAuth2 token lifecycle management:
 * - Interactive and background token retrieval
 * - chrome.runtime.lastError normalization
 * - Token invalidation (removeCachedAuthToken)
 * - Token revocation endpoint handling
 * - Unexpected exception catch-all
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAuthClient } from '../googleAuthClient';

// ---------------------------------------------------------------------------
// Chrome API Mocks
// ---------------------------------------------------------------------------

const mockGetAuthToken = vi.fn();
const mockRemoveCachedAuthToken = vi.fn();

// Build the chrome global mock
const chromeMock = {
  identity: {
    getAuthToken: mockGetAuthToken,
    removeCachedAuthToken: mockRemoveCachedAuthToken,
  },
  runtime: {
    lastError: null as chrome.runtime.LastError | null,
  },
};

// Assign to globalThis so the client sees it
vi.stubGlobal('chrome', chromeMock);

describe('GoogleAuthClient', () => {
  let client: GoogleAuthClient;

  beforeEach(() => {
    client = new GoogleAuthClient();
    vi.clearAllMocks();
    chromeMock.runtime.lastError = null;
  });

  // =========================================================================
  // getAuthToken
  // =========================================================================

  describe('getAuthToken', () => {
    it('returns token on successful background retrieval', async () => {
      mockGetAuthToken.mockResolvedValue({ token: 'bg-token-123' });

      const result = await client.getAuthToken(false);

      expect(result).toEqual({ success: true, data: 'bg-token-123' });
      expect(mockGetAuthToken).toHaveBeenCalledWith({ interactive: false });
    });

    it('returns token on successful interactive retrieval', async () => {
      mockGetAuthToken.mockResolvedValue({ token: 'interactive-token-456' });

      const result = await client.getAuthToken(true);

      expect(result).toEqual({ success: true, data: 'interactive-token-456' });
      expect(mockGetAuthToken).toHaveBeenCalledWith({ interactive: true });
    });

    it('handles string return value from legacy chrome.identity API', async () => {
      mockGetAuthToken.mockResolvedValue('legacy-token-789');

      const result = await client.getAuthToken();

      expect(result).toEqual({ success: true, data: 'legacy-token-789' });
    });

    it('normalizes chrome.runtime.lastError into typed error result', async () => {
      mockGetAuthToken.mockResolvedValue({ token: undefined });
      chromeMock.runtime.lastError = {
        message: 'The user is not signed in.',
      };

      const result = await client.getAuthToken(true);

      expect(result).toEqual({
        success: false,
        error: 'The user is not signed in.',
        authExpired: true,
      });
    });

    it('returns authExpired for OAuth2 related lastError messages', async () => {
      mockGetAuthToken.mockResolvedValue({ token: undefined });
      chromeMock.runtime.lastError = {
        message: 'OAuth2 request failed: invalid scope',
      };

      const result = await client.getAuthToken(false);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.authExpired).toBe(true);
        expect(result.error).toContain('OAuth2');
      }
    });

    it('returns error when no token is returned and no lastError', async () => {
      mockGetAuthToken.mockResolvedValue({ token: undefined });

      const result = await client.getAuthToken();

      expect(result).toEqual({
        success: false,
        error: 'No token returned from Chrome identity.',
        authExpired: true,
      });
    });

    it('catches unexpected exceptions and normalizes them', async () => {
      mockGetAuthToken.mockRejectedValue(new Error('Extension context invalidated'));

      const result = await client.getAuthToken();

      expect(result).toEqual({
        success: false,
        error: 'Extension context invalidated',
        authExpired: false,
      });
    });

    it('handles non-Error thrown values gracefully', async () => {
      mockGetAuthToken.mockRejectedValue('string-error');

      const result = await client.getAuthToken();

      expect(result).toEqual({
        success: false,
        error: 'Unexpected auth error.',
        authExpired: false,
      });
    });
  });

  // =========================================================================
  // invalidateToken
  // =========================================================================

  describe('invalidateToken', () => {
    it('calls chrome.identity.removeCachedAuthToken with the token', async () => {
      mockRemoveCachedAuthToken.mockResolvedValue(undefined);

      await client.invalidateToken('token-to-remove');

      expect(mockRemoveCachedAuthToken).toHaveBeenCalledWith({ token: 'token-to-remove' });
    });

    it('swallows errors silently if token is already removed', async () => {
      mockRemoveCachedAuthToken.mockRejectedValue(new Error('Token not found'));

      // Should not throw
      await expect(client.invalidateToken('gone-token')).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // revokeToken
  // =========================================================================

  describe('revokeToken', () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    beforeEach(() => {
      mockFetch.mockClear();
      mockRemoveCachedAuthToken.mockResolvedValue(undefined);
    });

    it('revokes token at Google endpoint and clears local cache', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const result = await client.revokeToken('revoke-me');

      expect(result).toEqual({ success: true, data: undefined });
      expect(mockRemoveCachedAuthToken).toHaveBeenCalledWith({ token: 'revoke-me' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('accounts.google.com/o/oauth2/revoke?token=revoke-me'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns error on HTTP failure from revocation endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 });

      const result = await client.revokeToken('bad-token');

      expect(result).toEqual({
        success: false,
        error: 'Token revocation failed (HTTP 400).',
        statusCode: 400,
      });
    });

    it('normalizes network errors during revocation', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await client.revokeToken('offline-token');

      expect(result).toEqual({
        success: false,
        error: 'Connection error: Failed to fetch',
      });
    });
  });
});
