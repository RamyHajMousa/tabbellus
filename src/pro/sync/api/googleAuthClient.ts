/**
 * Google Auth Client
 *
 * Wraps `chrome.identity` OAuth2 token management for Google Drive API access.
 * All methods return normalized `DriveApiResult` — never throws uncaught exceptions.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - This module lives entirely within `src/pro/sync/api/`.
 * - Zero imports from `src/core/` implementation files.
 */

import type { DriveApiResult } from './types';

const REVOKE_URL = 'https://accounts.google.com/o/oauth2/revoke';

export class GoogleAuthClient {
  /**
   * Retrieves an OAuth2 access token from Chrome's identity system.
   *
   * @param interactive - If true, may prompt the user with a consent screen.
   *   Defaults to false for silent/background token refresh.
   * @returns Token string on success, or normalized error on failure.
   */
  async getAuthToken(interactive = false): Promise<DriveApiResult<string>> {
    try {
      const result = await chrome.identity.getAuthToken({ interactive });

      // chrome.identity.getAuthToken resolves with { token } in MV3,
      // but chrome.runtime.lastError may still be set on older Chromium builds.
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message ?? 'Failed to retrieve auth token.';
        return {
          success: false,
          error: message,
          authExpired: message.includes('not signed in') || message.includes('OAuth2'),
        };
      }

      const token = typeof result === 'string' ? result : result?.token;

      if (!token) {
        return {
          success: false,
          error: 'No token returned from Chrome identity.',
          authExpired: true,
        };
      }

      return { success: true, data: token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unexpected auth error.';
      return {
        success: false,
        error: message,
        authExpired: message.includes('not signed in') || message.includes('OAuth2'),
      };
    }
  }

  /**
   * Removes a cached OAuth2 token from Chrome's local token cache.
   * This forces the next `getAuthToken` call to fetch a fresh token.
   */
  async invalidateToken(token: string): Promise<void> {
    try {
      await chrome.identity.removeCachedAuthToken({ token });
    } catch {
      // Swallow — token may already be removed or cache may be empty.
    }
  }

  /**
   * Revokes a token at Google's OAuth2 revocation endpoint AND clears local cache.
   *
   * Use this when disconnecting the user's Google account from the extension,
   * not for routine token refresh (use `invalidateToken` for that).
   */
  async revokeToken(token: string): Promise<DriveApiResult<void>> {
    try {
      // Clear from Chrome's local cache first
      await this.invalidateToken(token);

      // Revoke at Google's server
      const response = await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Token revocation failed (HTTP ${response.status}).`,
          statusCode: response.status,
        };
      }

      return { success: true, data: undefined };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Token revocation failed.';
      return { success: false, error: `Connection error: ${message}` };
    }
  }
}

/** Singleton instance for use across the Pro sync subsystem. */
export const googleAuthClient = new GoogleAuthClient();
