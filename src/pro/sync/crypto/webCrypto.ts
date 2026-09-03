/**
 * TabBellus Pure WebCrypto Engine
 *
 * Provides cryptographic primitives for Zero-Knowledge End-to-End Encryption (E2EE)
 * of user sync vaults using native W3C Web Cryptography APIs (SubtleCrypto).
 *
 * Security Architecture:
 * - Key Derivation: PBKDF2-HMAC-SHA256 with 600,000 iterations (OWASP 2023+ recommendation)
 *   and cryptographically secure 16-byte random salt.
 * - Authenticated Encryption: AES-256-GCM with fresh 12-byte (96-bit) IV per encryption
 *   and 128-bit authentication tag appended to ciphertext.
 * - Zero Dependencies: Pure W3C WebCrypto, TextEncoder, TextDecoder, and chunked
 *   btoa/atob conversions without Node.js `Buffer` or third-party crypto libraries.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Owned exclusively by `src/pro/sync/crypto/`.
 * - Free Core components interact with sync telemetry only via `@/core/contracts/sync.ts`.
 */

import { EncryptedVaultEnvelope, CryptoEngineError } from './types';

// Cryptographic Security Constants
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;
export const KEY_BIT_LENGTH = 256;

/**
 * Encodes a Uint8Array into a standard Base64 string in chunks.
 * Avoids call stack overflow on large buffers and works in Browser,
 * Service Worker, and Node.js environments without Node `Buffer`.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    return '';
  }
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000; // 32KB chunks
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Decodes a standard Base64 string into a Uint8Array.
 * Works across Browser, Service Worker, and Node.js environments
 * without Node `Buffer`.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (!base64) {
    return new Uint8Array(0);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a cryptographically strong 16-byte random salt using `crypto.getRandomValues`.
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Derives an AES-256-GCM CryptoKey from a user passphrase and salt via PBKDF2-HMAC-SHA256.
 * The derived key is extractable to enable ephemeral session caching in `SessionKeyStore`.
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  try {
    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passphrase);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passphraseBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: KEY_BIT_LENGTH,
      },
      true, // extractable for session caching
      ['encrypt', 'decrypt']
    );

    return derivedKey;
  } catch (err: unknown) {
    if (err instanceof CryptoEngineError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Key derivation failed';
    throw new CryptoEngineError(message, 'KEY_DERIVATION_FAILED');
  }
}

/**
 * Encrypts a plaintext string with AES-256-GCM using a freshly generated 12-byte IV.
 * Returns an EncryptedVaultEnvelope containing Base64-encoded strings and metadata.
 */
export async function encryptPayload(
  plaintext: string,
  key: CryptoKey,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<EncryptedVaultEnvelope> {
  try {
    const iv = new Uint8Array(IV_BYTE_LENGTH);
    crypto.getRandomValues(iv);

    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encodedData
    );

    return {
      version: 1,
      salt: uint8ArrayToBase64(salt),
      iv: uint8ArrayToBase64(iv),
      ciphertext: uint8ArrayToBase64(new Uint8Array(encryptedBuffer)),
      iterations,
    };
  } catch (err: unknown) {
    if (err instanceof CryptoEngineError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Encryption failed';
    throw new CryptoEngineError(message, 'DECRYPTION_FAILED');
  }
}

/**
 * Decrypts an EncryptedVaultEnvelope using AES-256-GCM.
 * Validates the authentication tag; on auth tag failure or corrupted ciphertext/IV,
 * maps the exception directly to `CryptoEngineError('INVALID_PASSPHRASE')`.
 */
export async function decryptPayload(
  envelope: EncryptedVaultEnvelope,
  key: CryptoKey
): Promise<string> {
  let ivBytes: Uint8Array;
  let ciphertextBytes: Uint8Array;

  try {
    ivBytes = base64ToUint8Array(envelope.iv);
    ciphertextBytes = base64ToUint8Array(envelope.ciphertext);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Corrupted payload structure';
    throw new CryptoEngineError(message, 'DECRYPTION_FAILED');
  }

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as unknown as BufferSource,
      },
      key,
      ciphertextBytes as unknown as BufferSource
    );
  } catch (err: unknown) {
    if (err instanceof CryptoEngineError) {
      throw err;
    }
    // AES-GCM authentication tag verification failure / wrong key produces an OperationError
    const isOperationError =
      (err instanceof DOMException && err.name === 'OperationError') ||
      (err instanceof Error &&
        (err.name === 'OperationError' ||
          err.message.toLowerCase().includes('operation-specific') ||
          err.message.toLowerCase().includes('tag') ||
          err.message.toLowerCase().includes('mac')));

    if (isOperationError) {
      throw new CryptoEngineError(
        'Invalid passphrase or corrupted payload',
        'INVALID_PASSPHRASE'
      );
    }

    const message = err instanceof Error ? err.message : 'Decryption failed';
    throw new CryptoEngineError(message, 'DECRYPTION_FAILED');
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(decryptedBuffer);
}

/**
 * Singleton namespace class wrapping WebCrypto operations.
 */
export class WebCryptoEngine {
  public static readonly PBKDF2_ITERATIONS = PBKDF2_ITERATIONS;
  public static readonly SALT_BYTE_LENGTH = SALT_BYTE_LENGTH;
  public static readonly IV_BYTE_LENGTH = IV_BYTE_LENGTH;
  public static readonly KEY_BIT_LENGTH = KEY_BIT_LENGTH;

  public static uint8ArrayToBase64(bytes: Uint8Array): string {
    return uint8ArrayToBase64(bytes);
  }

  public static base64ToUint8Array(base64: string): Uint8Array {
    return base64ToUint8Array(base64);
  }

  public static generateSalt(): Uint8Array {
    return generateSalt();
  }

  public static deriveKeyFromPassphrase(
    passphrase: string,
    salt: Uint8Array,
    iterations = PBKDF2_ITERATIONS
  ): Promise<CryptoKey> {
    return deriveKeyFromPassphrase(passphrase, salt, iterations);
  }

  public static encryptPayload(
    plaintext: string,
    key: CryptoKey,
    salt: Uint8Array,
    iterations = PBKDF2_ITERATIONS
  ): Promise<EncryptedVaultEnvelope> {
    return encryptPayload(plaintext, key, salt, iterations);
  }

  public static decryptPayload(
    envelope: EncryptedVaultEnvelope,
    key: CryptoKey
  ): Promise<string> {
    return decryptPayload(envelope, key);
  }
}
