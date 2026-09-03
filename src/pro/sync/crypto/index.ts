/**
 * TabBellus Pro Cryptographic Engine & Key Store Subsystem Root
 *
 * Provides client-side zero-knowledge end-to-end encryption (E2EE) primitives
 * and ephemeral session key storage for cloud sync vaults.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components must NEVER import from this layer.
 * - Free Core interacts with sync status only via `@/core/contracts/sync.ts`.
 */

export * from './types';
export * from './webCrypto';
export * from './keyStore';
