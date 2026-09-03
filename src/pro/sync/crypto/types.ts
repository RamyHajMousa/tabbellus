/**
 * TabBellus Pro Cryptographic Engine Types
 *
 * Defines typed interfaces, error structures, and session storage models
 * for client-side zero-knowledge end-to-end encryption (E2EE) of sync vaults.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Owned exclusively by the isolated Pro sync subsystem (`src/pro/sync/crypto/`).
 * - Free Core components interact with sync telemetry only via `@/core/contracts/sync.ts`.
 */

export interface EncryptedVaultEnvelope {
  version: 1;
  salt: string;       // Base64 16-byte salt
  iv: string;         // Base64 12-byte initialization vector
  ciphertext: string; // Base64 ciphertext + 16-byte auth tag
  iterations: number; // 600000
}

export interface KeyDerivationOptions {
  iterations?: number;
  salt?: Uint8Array;
}

export interface KeyStoreRecord {
  rawKey: string;
  salt: string;
  unlockedAt: number;
}

export type CryptoErrorCode =
  | 'INVALID_PASSPHRASE'
  | 'DECRYPTION_FAILED'
  | 'KEY_DERIVATION_FAILED'
  | 'SESSION_LOCKED';

export class CryptoEngineError extends Error {
  public readonly code: CryptoErrorCode;

  constructor(message: string, code: CryptoErrorCode) {
    super(message);
    this.name = 'CryptoEngineError';
    this.code = code;
    // Restore prototype chain when transpiling to ES5/ES6
    Object.setPrototypeOf(this, CryptoEngineError.prototype);
  }
}
