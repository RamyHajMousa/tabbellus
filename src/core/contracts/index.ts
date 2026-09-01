/**
 * TabBellus Core Extension Point Contracts
 *
 * Owned by Free Core. Defines abstract lifecycle hooks, capability interfaces,
 * and slot registries for decoupled Pro runtime attachment.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact ONLY with contracts defined here.
 * - This module MUST NOT import anything from `src/pro/`.
 */

export interface EntitlementStatus {
  isPro: boolean;
  tier?: 'free' | 'pro' | 'enterprise';
  expiresAt?: number;
  gracePeriodActive?: boolean;
}

export interface LicensingContract {
  getEntitlement(): Promise<EntitlementStatus>;
  validateKey(licenseKey: string): Promise<{ success: boolean; error?: string }>;
  clearLicense(): Promise<void>;
  subscribe(callback: (status: EntitlementStatus) => void): () => void;
}

export interface ProModuleMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  requiredEntitlement?: 'pro' | 'enterprise';
}

export interface ProModule {
  readonly metadata: ProModuleMetadata;
  initialize(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

export interface FeatureSlotRegistration<T = unknown> {
  slotId: string;
  component: T;
  order?: number;
}

export * from './sync';
export * from './rules';

