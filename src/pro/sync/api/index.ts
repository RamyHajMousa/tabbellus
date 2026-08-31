/**
 * TabBellus Sync API — Public Barrel Export
 *
 * Re-exports all types, classes, and singletons from the Google Drive
 * authentication and REST client layer.
 *
 * STRICT CONSTRAINTS:
 * - Zero imports from `src/core/` implementation files (only type contracts allowed).
 * - Zero outward exports leaking into Free Core (`src/lib/`, `src/features/`, etc.).
 * - This barrel is consumed exclusively by Pro sync orchestration modules.
 */

// --- Types ---
export type {
  DriveFileMetadata,
  DriveFileListResponse,
  DriveApiResult,
  VaultPayload,
} from './types';

// --- Google Auth Client ---
export { GoogleAuthClient, googleAuthClient } from './googleAuthClient';

// --- Google Drive REST Client ---
export { GoogleDriveClient, googleDriveClient } from './googleDriveClient';
