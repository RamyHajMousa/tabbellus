/**
 * TabBellus Pro Cloud Sync Subsystem Root
 *
 * Re-exports the client layer, API layer, and UI components layer.
 *
 * ZERO-CONTAMINATION & SINGLE-OWNER BOUNDARY:
 * - Free Core components must NEVER statically import from here.
 * - Free Core interacts with sync strictly through `@/core/contracts/sync.ts`
 *   and `contractRegistry.getSyncProvider()`.
 * - The background service worker is the SOLE owner of `src/pro/sync/engine/`.
 *   This entry point MUST NOT re-export the engine layer.
 */

// --- Sync Client Layer ---
export * from './client/backgroundSyncClient';

// --- Sync Protocol Layer ---
export * from './protocol';

// --- Sync REST API Layer ---
export * from './api';

// --- Sync Cryptographic Engine Layer ---
export * from './crypto';

// --- Sync UI Components Layer ---
export * from './components';
