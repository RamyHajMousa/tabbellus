/**
 * TabBellus Pro Cloud Sync Subsystem Root
 *
 * Re-exports the API layer and the reconciliation engine layer.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components must NEVER statically import from here.
 * - Free Core interacts with sync strictly through `@/core/contracts/sync.ts`
 *   and `contractRegistry.getSyncProvider()`.
 */

// --- Sync REST API Layer ---
export * from './api';

// --- Sync Reconciliation Engine Layer ---
export * from './engine';

// --- Sync Cryptographic Engine Layer ---
export * from './crypto';

// --- Sync UI Components Layer ---
export * from './components';

