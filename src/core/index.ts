/**
 * TabBellus Free Core Public API
 *
 * Exposes pure contracts, the contract registry, reactive entitlement hooks,
 * and declarative feature gating primitives.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * This module and all submodules under `src/core/` MUST NEVER import from `src/pro/`.
 */

export * from './contracts';
export * from './contracts/registry';
export * from './hooks/useEntitlement';
export * from './components/FeatureGate';
