/**
 * TabBellus Sync API Types
 *
 * Type definitions for the Google Drive REST API integration layer.
 * Used exclusively within `src/pro/sync/api/` — does NOT import from `src/core/`.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - These types are consumed only by Pro sync modules.
 * - Free Core accesses sync state exclusively via `src/core/contracts/sync.ts`.
 */

// ---------------------------------------------------------------------------
// Google Drive File Metadata
// ---------------------------------------------------------------------------

/** Subset of the Google Drive v3 File resource we actually consume. */
export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
}

/** Paginated file list response from `files.list`. */
export interface DriveFileListResponse {
  files: DriveFileMetadata[];
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Drive API Result — Discriminated Union
// ---------------------------------------------------------------------------

/**
 * Discriminated union for Drive API call results.
 *
 * Unlike `LicenseApiResult<T>` (where `data` is optional on success),
 * this union enforces that `data` is always present on the `success: true`
 * branch, enabling exhaustive compile-time checks:
 *
 * ```ts
 * const result = await googleDriveClient.findVaultFile();
 * if (result.success) {
 *   result.data; // ← DriveFileListResponse, guaranteed
 * } else {
 *   result.error; // ← string, guaranteed
 * }
 * ```
 */
export type DriveApiResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      statusCode?: number;
      authExpired?: boolean;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    };

// ---------------------------------------------------------------------------
// Vault Payload Envelope
// ---------------------------------------------------------------------------

/**
 * Generic JSON envelope for sync payloads stored in Google Drive appDataFolder.
 *
 * - `schemaVersion`: Semantic version of the vault schema (e.g. "1.0.0").
 * - `clientTimestamp`: ISO 8601 timestamp of when the client produced this payload.
 * - `payload`: Cleartext JSON string (or encrypted ciphertext when E2EE is active).
 * - `iv`: Base64-encoded initialization vector (present only when encrypted).
 * - `salt`: Base64-encoded salt for key derivation (present only when encrypted).
 */
export interface VaultPayload {
  schemaVersion: string;
  clientTimestamp: string;
  payload: string;
  iv?: string;
  salt?: string;
  isEncrypted?: boolean;
}
