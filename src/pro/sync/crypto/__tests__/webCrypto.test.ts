/**
 * WebCryptoEngine Unit Test Suite
 *
 * Verifies PBKDF2 key derivation, AES-256-GCM authenticated encryption/decryption,
 * bit-tampering detection, authentication tag verification, and Base64 conversions.
 */

import { describe, it, expect } from 'vitest';
import {
  WebCryptoEngine,
  PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  IV_BYTE_LENGTH,
  uint8ArrayToBase64,
  base64ToUint8Array,
  generateSalt,
  deriveKeyFromPassphrase,
  encryptPayload,
  decryptPayload,
} from '../webCrypto';
import { CryptoEngineError } from '../types';

describe('WebCryptoEngine', () => {
  describe('Constants & Configuration', () => {
    it('defines standard cryptographic parameters matching security requirements', () => {
      expect(PBKDF2_ITERATIONS).toBe(600_000);
      expect(SALT_BYTE_LENGTH).toBe(16);
      expect(IV_BYTE_LENGTH).toBe(12);
      expect(WebCryptoEngine.KEY_BIT_LENGTH).toBe(256);
    });
  });

  describe('Base64 Helpers (No Node Buffer dependency)', () => {
    it('roundtrips arbitrary binary byte buffers including all byte values [0..255]', () => {
      const allBytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        allBytes[i] = i;
      }

      const encoded = uint8ArrayToBase64(allBytes);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = base64ToUint8Array(encoded);
      expect(decoded.length).toBe(256);
      expect(Array.from(decoded)).toEqual(Array.from(allBytes));
    });

    it('roundtrips empty byte arrays', () => {
      const empty = new Uint8Array(0);
      const encoded = uint8ArrayToBase64(empty);
      expect(encoded).toBe('');

      const decoded = base64ToUint8Array(encoded);
      expect(decoded.length).toBe(0);
    });

    it('handles large binary payloads across chunk boundaries without stack overflow', () => {
      // 100 KB payload (> 32KB chunk limit)
      const large = new Uint8Array(100 * 1024);
      for (let i = 0; i < large.length; i++) {
        large[i] = i % 256;
      }

      const encoded = uint8ArrayToBase64(large);
      const decoded = base64ToUint8Array(encoded);
      expect(decoded.length).toBe(large.length);
      expect(decoded[0]).toBe(large[0]);
      expect(decoded[50000]).toBe(large[50000]);
      expect(decoded[large.length - 1]).toBe(large[large.length - 1]);
    });
  });

  describe('Salt Generation', () => {
    it('generates cryptographically random 16-byte salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();

      expect(salt1).toBeInstanceOf(Uint8Array);
      expect(salt1.byteLength).toBe(SALT_BYTE_LENGTH);
      expect(salt2.byteLength).toBe(SALT_BYTE_LENGTH);
      // Successive random values should not be equal
      expect(uint8ArrayToBase64(salt1)).not.toBe(uint8ArrayToBase64(salt2));
    });
  });

  describe('PBKDF2 Key Derivation', () => {
    it('produces identical raw AES-GCM key bytes for identical passphrase and salt', async () => {
      const passphrase = 'correct horse battery staple';
      const salt = generateSalt();

      // Use lower iterations for fast unit test verification of determinism
      const key1 = await deriveKeyFromPassphrase(passphrase, salt, 10_000);
      const key2 = await deriveKeyFromPassphrase(passphrase, salt, 10_000);

      const rawKey1 = await crypto.subtle.exportKey('raw', key1);
      const rawKey2 = await crypto.subtle.exportKey('raw', key2);

      expect(uint8ArrayToBase64(new Uint8Array(rawKey1))).toBe(
        uint8ArrayToBase64(new Uint8Array(rawKey2))
      );
    });

    it('produces different key bytes when passphrase differs', async () => {
      const salt = generateSalt();
      const key1 = await deriveKeyFromPassphrase('passphrase-A', salt, 10_000);
      const key2 = await deriveKeyFromPassphrase('passphrase-B', salt, 10_000);

      const rawKey1 = await crypto.subtle.exportKey('raw', key1);
      const rawKey2 = await crypto.subtle.exportKey('raw', key2);

      expect(uint8ArrayToBase64(new Uint8Array(rawKey1))).not.toBe(
        uint8ArrayToBase64(new Uint8Array(rawKey2))
      );
    });

    it('produces different key bytes when salt differs', async () => {
      const passphrase = 'identical-passphrase';
      const salt1 = generateSalt();
      const salt2 = generateSalt();

      const key1 = await deriveKeyFromPassphrase(passphrase, salt1, 10_000);
      const key2 = await deriveKeyFromPassphrase(passphrase, salt2, 10_000);

      const rawKey1 = await crypto.subtle.exportKey('raw', key1);
      const rawKey2 = await crypto.subtle.exportKey('raw', key2);

      expect(uint8ArrayToBase64(new Uint8Array(rawKey1))).not.toBe(
        uint8ArrayToBase64(new Uint8Array(rawKey2))
      );
    });

    it('derives extractable 256-bit AES-GCM key with encrypt and decrypt usages', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('my-secret-passphrase', salt, 10_000);

      expect(key.algorithm.name).toBe('AES-GCM');
      expect((key.algorithm as AesKeyGenParams).length).toBe(256);
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });
  });

  describe('Payload Encryption & Decryption Roundtrip', () => {
    it('successfully encrypts and decrypts structured JSON string payload', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('vault-master-passphrase', salt, 10_000);

      const complexPayload = JSON.stringify({
        schemaVersion: '1.0.0',
        spaces: [
          { id: 1, name: 'Work Space', isPinned: true, color: 'blue' },
          { id: 2, name: 'Personal', isPinned: false },
        ],
        tabs: [
          { id: 101, spaceId: 1, url: 'https://github.com', title: 'GitHub', order: 0 },
          { id: 102, spaceId: 1, url: 'https://docs.google.com', title: 'Docs', order: 1 },
        ],
        readLater: [
          { id: 201, url: 'https://example.com/article', status: 'unread', addedAt: 1700000000 },
        ],
      });

      const envelope = await encryptPayload(complexPayload, key, salt);

      expect(envelope.version).toBe(1);
      expect(envelope.iterations).toBe(PBKDF2_ITERATIONS);
      expect(envelope.salt).toBe(uint8ArrayToBase64(salt));
      expect(envelope.iv).toBeDefined();
      expect(envelope.ciphertext).toBeDefined();

      const decrypted = await decryptPayload(envelope, key);
      expect(decrypted).toBe(complexPayload);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(complexPayload));
    });

    it('handles unicode characters and multilingual strings properly', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('unicode-passphrase', salt, 10_000);
      const text = '🌟 TabBellus Sync! 日本語 text with special chars: 🚀 <>&"\'';

      const envelope = await encryptPayload(text, key, salt);
      const decrypted = await decryptPayload(envelope, key);

      expect(decrypted).toBe(text);
    });

    it('produces different IVs and different ciphertexts for two successive encryptions of identical plaintext', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('repeated-encryption-key', salt, 10_000);
      const plaintext = 'Identical plaintext for both runs';

      const envelope1 = await encryptPayload(plaintext, key, salt);
      const envelope2 = await encryptPayload(plaintext, key, salt);

      expect(envelope1.iv).not.toBe(envelope2.iv);
      expect(envelope1.ciphertext).not.toBe(envelope2.ciphertext);

      // Both must still decrypt to original plaintext
      expect(await decryptPayload(envelope1, key)).toBe(plaintext);
      expect(await decryptPayload(envelope2, key)).toBe(plaintext);
    });
  });

  describe('Cryptographic Tamper Detection & Authentication Tag Integrity', () => {
    it('throws CryptoEngineError with INVALID_PASSPHRASE if a single bit of ciphertext is flipped', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('secure-passphrase', salt, 10_000);
      const plaintext = 'Sensitive browser tabs payload';

      const envelope = await encryptPayload(plaintext, key, salt);

      // Mutate 1 bit in the raw ciphertext bytes
      const rawBytes = base64ToUint8Array(envelope.ciphertext);
      rawBytes[0] ^= 0x01; // flip least significant bit of first byte
      const tamperedEnvelope = {
        ...envelope,
        ciphertext: uint8ArrayToBase64(rawBytes),
      };

      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toThrow(CryptoEngineError);
      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toMatchObject({
        code: 'INVALID_PASSPHRASE',
      });
    });

    it('throws CryptoEngineError with INVALID_PASSPHRASE if the authentication tag (last 16 bytes) is modified', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('secure-passphrase', salt, 10_000);
      const plaintext = 'Payload with authentication tag';

      const envelope = await encryptPayload(plaintext, key, salt);

      // In AES-GCM, the last 16 bytes of the WebCrypto ciphertext buffer is the auth tag
      const rawBytes = base64ToUint8Array(envelope.ciphertext);
      const tagOffset = rawBytes.length - 1;
      rawBytes[tagOffset] ^= 0x80; // flip highest bit of last tag byte

      const tamperedEnvelope = {
        ...envelope,
        ciphertext: uint8ArrayToBase64(rawBytes),
      };

      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toThrow(CryptoEngineError);
      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toMatchObject({
        code: 'INVALID_PASSPHRASE',
      });
    });

    it('throws CryptoEngineError with INVALID_PASSPHRASE if IV is tampered', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('secure-passphrase', salt, 10_000);
      const plaintext = 'Payload with modified IV';

      const envelope = await encryptPayload(plaintext, key, salt);

      const ivBytes = base64ToUint8Array(envelope.iv);
      ivBytes[0] ^= 0x02;

      const tamperedEnvelope = {
        ...envelope,
        iv: uint8ArrayToBase64(ivBytes),
      };

      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toThrow(CryptoEngineError);
      await expect(decryptPayload(tamperedEnvelope, key)).rejects.toMatchObject({
        code: 'INVALID_PASSPHRASE',
      });
    });

    it('throws CryptoEngineError with INVALID_PASSPHRASE when decrypting with a key derived from the wrong passphrase', async () => {
      const salt = generateSalt();
      const correctKey = await deriveKeyFromPassphrase('correct-horse-battery-staple', salt, 10_000);
      const wrongKey = await deriveKeyFromPassphrase('incorrect-guess', salt, 10_000);

      const plaintext = 'Secret vault contents';
      const envelope = await encryptPayload(plaintext, correctKey, salt);

      await expect(decryptPayload(envelope, wrongKey)).rejects.toThrow(CryptoEngineError);
      await expect(decryptPayload(envelope, wrongKey)).rejects.toMatchObject({
        code: 'INVALID_PASSPHRASE',
      });
    });

    it('throws CryptoEngineError with DECRYPTION_FAILED on malformed Base64 or envelope structure', async () => {
      const salt = generateSalt();
      const key = await deriveKeyFromPassphrase('passphrase', salt, 10_000);

      const malformedEnvelope = {
        version: 1 as const,
        salt: '!!!not-base64@@@',
        iv: 'invalid-iv-format',
        ciphertext: 'invalid-ciphertext',
        iterations: 600000,
      };

      await expect(decryptPayload(malformedEnvelope, key)).rejects.toThrow(CryptoEngineError);
    });
  });
});
