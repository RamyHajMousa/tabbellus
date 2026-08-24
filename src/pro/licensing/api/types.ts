/**
 * Lemon Squeezy License API Response Types
 *
 * Normalized type definitions for the Lemon Squeezy licensing API responses.
 * All API methods return `LicenseApiResult<T>` to ensure consistent error handling.
 */

/** Normalized API response envelope — never throws, always returns typed result */
export interface LicenseApiResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Parsed activation response from POST /activate */
export interface ActivationData {
  activated: boolean;
  licenseKey: {
    key: string;
    status: string;
  };
  instance: {
    id: string;
    name: string;
  };
}

/** Parsed validation response from POST /validate */
export interface ValidationData {
  valid: boolean;
  licenseKey: {
    key: string;
    status: string;
    expiresAt: string | null;
  };
}

/** Parsed deactivation response from POST /deactivate */
export interface DeactivationData {
  deactivated: boolean;
}
