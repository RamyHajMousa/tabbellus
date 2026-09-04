/**
 * Google Drive REST Client
 *
 * Type-safe HTTP client for Google Drive v3 REST API operations against
 * the `appDataFolder` hidden partition. Handles vault file CRUD with
 * multipart/related uploads and automatic 401 token recovery.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - This module lives entirely within `src/pro/sync/api/`.
 * - Zero imports from `src/core/` implementation files.
 */

import type { DriveApiResult, DriveFileMetadata, DriveFileListResponse, VaultPayload } from './types';
import { googleAuthClient } from './googleAuthClient';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a unique multipart boundary string.
 */
function generateBoundary(): string {
  return `tabbellus_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Constructs a multipart/related request body for Drive uploads.
 */
function buildMultipartBody(
  metadata: Record<string, unknown>,
  content: string,
  boundary: string,
): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');
}

/**
 * Helper to parse the Retry-After header from an HTTP response, defaulting to 60 seconds.
 */
function parseRetryAfter(response: Response, defaultSeconds = 60): number {
  try {
    const retryHeader = response.headers?.get?.('Retry-After');
    if (retryHeader) {
      const parsedInt = parseInt(retryHeader, 10);
      if (!isNaN(parsedInt) && parsedInt > 0) {
        return parsedInt;
      }
      const parsedDate = Date.parse(retryHeader);
      if (!isNaN(parsedDate)) {
        const diffSeconds = Math.round((parsedDate - Date.now()) / 1000);
        if (diffSeconds > 0) return diffSeconds;
      }
    }
  } catch {
    // Headers not accessible or malformed
  }
  return defaultSeconds;
}

/**
 * Normalizes a non-OK HTTP response into a typed DriveApiResult error.
 */
async function normalizeHttpError(response: Response): Promise<DriveApiResult<never>> {
  const status = response.status;
  const statusText = response.statusText;

  if (status === 401) {
    return { success: false, error: 'Authentication expired.', statusCode: 401, authExpired: true };
  }
  if (status === 429) {
    const retryAfterSeconds = parseRetryAfter(response, 60);
    return {
      success: false,
      error: 'Google Drive rate limit exceeded. Backing off.',
      statusCode: 429,
      rateLimited: true,
      retryAfterSeconds,
    };
  }
  if (status === 403) {
    let isRateLimit = false;
    try {
      if (typeof response.json === 'function') {
        const errorJson = await response.json();
        const reasons = errorJson?.error?.errors?.map((e: { reason?: string }) => e.reason) ?? [];
        if (
          reasons.includes('rateLimitExceeded') ||
          reasons.includes('userRateLimitExceeded') ||
          errorJson?.error?.message?.toLowerCase().includes('rate limit')
        ) {
          isRateLimit = true;
        }
      }
    } catch {
      // Body not JSON
    }

    if (isRateLimit) {
      const retryAfterSeconds = parseRetryAfter(response, 60);
      return {
        success: false,
        error: 'Google Drive rate limit exceeded. Backing off.',
        statusCode: 429,
        rateLimited: true,
        retryAfterSeconds,
      };
    }

    return { success: false, error: 'Access denied or rate limit exceeded.', statusCode: 403 };
  }
  if (status === 404) {
    return { success: false, error: 'File not found.', statusCode: 404 };
  }
  if (status >= 500) {
    return { success: false, error: `Google Drive server error (${status}).`, statusCode: status };
  }
  return { success: false, error: `Unexpected error (HTTP ${status} ${statusText}).`, statusCode: status };
}

/**
 * Normalizes a caught network exception into a typed DriveApiResult error.
 */
function normalizeNetworkError(err: unknown): DriveApiResult<never> {
  const message = err instanceof Error ? err.message : 'Network request failed.';
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('offline')) {
    return { success: false, error: 'Network offline or unreachable.' };
  }
  return { success: false, error: `Connection error: ${message}` };
}

// ---------------------------------------------------------------------------
// GoogleDriveClient
// ---------------------------------------------------------------------------

export class GoogleDriveClient {
  /**
   * Resilient execution handler wrapping all Drive API network calls.
   *
   * 401 Auto-Recovery Protocol:
   * 1. If HTTP 401 → invalidate current token → request fresh non-interactive token → retry once
   * 2. If retry also 401 → return { success: false, authExpired: true }
   */
  private async executeWithAuth<T>(
    operation: (token: string) => Promise<Response>,
    parseResponse: (response: Response) => Promise<T>,
  ): Promise<DriveApiResult<T>> {
    // Step 1: Get current token
    const tokenResult = await googleAuthClient.getAuthToken(false);
    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error, authExpired: tokenResult.authExpired };
    }

    let token = tokenResult.data;

    try {
      // Step 2: Execute the operation
      let response = await operation(token);

      // Step 3: 401 auto-recovery — invalidate + retry once
      if (response.status === 401) {
        await googleAuthClient.invalidateToken(token);

        const freshTokenResult = await googleAuthClient.getAuthToken(false);
        if (!freshTokenResult.success) {
          return {
            success: false,
            error: 'Authentication expired. Please sign in again.',
            statusCode: 401,
            authExpired: true,
          };
        }

        token = freshTokenResult.data;
        response = await operation(token);

        // If the retry also fails with 401, give up
        if (response.status === 401) {
          return {
            success: false,
            error: 'Authentication expired. Please sign in again.',
            statusCode: 401,
            authExpired: true,
          };
        }
      }

      // Step 4: Handle non-OK responses
      if (!response.ok) {
        return await normalizeHttpError(response);
      }

      // Step 5: Parse the successful response
      const data = await parseResponse(response);
      return { success: true, data };
    } catch (err: unknown) {
      return normalizeNetworkError(err);
    }
  }

  /**
   * Searches for a vault file in the appDataFolder by name.
   *
   * @param fileName - Name of the vault file to find. Defaults to 'tabbellus_vault.json'.
   * @returns The file list response containing matching files (may be empty).
   */
  async findVaultFile(
    fileName = 'tabbellus_vault.json',
  ): Promise<DriveApiResult<DriveFileListResponse>> {
    return this.executeWithAuth(
      (token) =>
        fetch(
          `${DRIVE_API_BASE}?spaces=appDataFolder` +
            `&q=name='${fileName}' and trashed=false` +
            `&fields=files(id,name,mimeType,modifiedTime,appProperties)`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
      async (response) => {
        const json = await response.json();
        return {
          files: (json.files ?? []) as DriveFileMetadata[],
          nextPageToken: json.nextPageToken as string | undefined,
        };
      },
    );
  }

  /**
   * Downloads the raw content of a vault file as a parsed VaultPayload.
   *
   * @param fileId - Google Drive file ID of the vault file.
   * @returns Parsed VaultPayload object.
   */
  async downloadVaultFile(fileId: string): Promise<DriveApiResult<VaultPayload>> {
    return this.executeWithAuth(
      (token) =>
        fetch(`${DRIVE_API_BASE}/${fileId}?alt=media`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      async (response) => (await response.json()) as VaultPayload,
    );
  }

  /**
   * Creates or updates a vault file in the appDataFolder.
   *
   * - If `existingFileId` is provided: PATCH (update) the existing file.
   * - If no `existingFileId`: POST (create) a new file with `parents: ['appDataFolder']`.
   *
   * Uses `multipart/related` upload for combined metadata + media.
   *
   * @param content - JSON string content for the vault file body.
   * @param existingFileId - Optional file ID to update instead of create.
   * @param fileName - Name for the file. Defaults to 'tabbellus_vault.json'.
   * @returns The created/updated file metadata.
   */
  async uploadVaultFile(
    content: string,
    existingFileId?: string,
    fileName = 'tabbellus_vault.json',
  ): Promise<DriveApiResult<DriveFileMetadata>> {
    const boundary = generateBoundary();

    const metadata: Record<string, unknown> = existingFileId
      ? { modifiedTime: new Date().toISOString() }
      : { name: fileName, parents: ['appDataFolder'] };

    const body = buildMultipartBody(metadata, content, boundary);

    return this.executeWithAuth(
      (token) => {
        const url = existingFileId
          ? `${DRIVE_UPLOAD_BASE}/${existingFileId}?uploadType=multipart`
          : `${DRIVE_UPLOAD_BASE}?uploadType=multipart`;

        const method = existingFileId ? 'PATCH' : 'POST';

        return fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        });
      },
      async (response) => (await response.json()) as DriveFileMetadata,
    );
  }
}

/** Singleton instance for use across the Pro sync subsystem. */
export const googleDriveClient = new GoogleDriveClient();
