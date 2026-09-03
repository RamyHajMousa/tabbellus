/**
 * SessionKeyStore Unit Test Suite
 *
 * Verifies ephemeral session key storage in chrome.storage.session,
 * in-memory caching, key export/import roundtrips, session clearing,
 * and fail-open in-memory degradation when chrome.storage.session is absent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionKeyStore } from '../keyStore';
import {
  generateSalt,
  deriveKeyFromPassphrase,
  encryptPayload,
  decryptPayload,
  uint8ArrayToBase64,
} from '../webCrypto';
import { KeyStoreRecord } from '../types';

describe('SessionKeyStore', () => {
  let store: SessionKeyStore;
  let mockSessionStorage: Record<string, unknown>;

  beforeEach(() => {
    mockSessionStorage = {};

    // Setup chrome.storage.session mock
    const mockChrome = {
      storage: {
        session: {
          get: vi.fn((key: string) => Promise.resolve({ [key]: mockSessionStorage[key] })),
          set: vi.fn((items: Record<string, unknown>) => {
            Object.assign(mockSessionStorage, items);
            return Promise.resolve();
          }),
          remove: vi.fn((key: string) => {
            delete mockSessionStorage[key];
            return Promise.resolve();
          }),
        },
      },
    };

    vi.stubGlobal('chrome', mockChrome);
    store = new SessionKeyStore();
  });

  it('starts in locked state with isUnlocked() returning false', async () => {
    expect(await store.isUnlocked()).toBe(false);
    expect(await store.loadSession()).toBeNull();
  });

  it('saves session by exporting raw key to chrome.storage.session and updating memory cache', async () => {
    const saltBytes = generateSalt();
    const saltBase64 = uint8ArrayToBase64(saltBytes);
    const key = await deriveKeyFromPassphrase('passphrase-123', saltBytes, 10_000);

    await store.saveSession(key, saltBase64);

    expect(await store.isUnlocked()).toBe(true);

    // Verify written to mock chrome.storage.session
    const savedRecord = mockSessionStorage['tabbellus_vault_session'] as KeyStoreRecord;
    expect(savedRecord).toBeDefined();
    expect(savedRecord.salt).toBe(saltBase64);
    expect(typeof savedRecord.rawKey).toBe('string');
    expect(savedRecord.rawKey.length).toBeGreaterThan(0);
    expect(typeof savedRecord.unlockedAt).toBe('number');
  });

  it('loads session from in-memory cache directly without hitting chrome.storage.session', async () => {
    const saltBytes = generateSalt();
    const saltBase64 = uint8ArrayToBase64(saltBytes);
    const key = await deriveKeyFromPassphrase('passphrase-123', saltBytes, 10_000);

    await store.saveSession(key, saltBase64);

    // Reset spy call counts
    vi.mocked(chrome.storage.session.get).mockClear();

    const session = await store.loadSession();
    expect(session).not.toBeNull();
    expect(session?.key).toBe(key);
    expect(session?.salt).toBe(saltBase64);
    // Did not query storage because memory cache was hit
    expect(chrome.storage.session.get).not.toHaveBeenCalled();
  });

  it('re-imports raw key from chrome.storage.session when memory cache is cold', async () => {
    const saltBytes = generateSalt();
    const saltBase64 = uint8ArrayToBase64(saltBytes);
    const originalKey = await deriveKeyFromPassphrase('passphrase-123', saltBytes, 10_000);

    // Save with store instance A
    await store.saveSession(originalKey, saltBase64);

    // Create fresh store instance B (cold memory cache, but session storage populated)
    const freshStore = new SessionKeyStore();
    expect(await freshStore.isUnlocked()).toBe(true);

    const loaded = await freshStore.loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded?.salt).toBe(saltBase64);
    expect(loaded?.key).toBeDefined();

    // Verify the re-imported key can decrypt payloads encrypted with originalKey
    const plaintext = 'Secret tabs snapshot';
    const envelope = await encryptPayload(plaintext, originalKey, saltBytes);
    const decrypted = await decryptPayload(envelope, loaded!.key);
    expect(decrypted).toBe(plaintext);
  });

  it('purges in-memory cache and chrome.storage.session on clearSession()', async () => {
    const saltBytes = generateSalt();
    const saltBase64 = uint8ArrayToBase64(saltBytes);
    const key = await deriveKeyFromPassphrase('passphrase-123', saltBytes, 10_000);

    await store.saveSession(key, saltBase64);
    expect(await store.isUnlocked()).toBe(true);

    await store.clearSession();

    expect(await store.isUnlocked()).toBe(false);
    expect(await store.loadSession()).toBeNull();
    expect(mockSessionStorage['tabbellus_vault_session']).toBeUndefined();
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('tabbellus_vault_session');
  });

  it('gracefully degrades to in-memory only storage when chrome.storage.session is undefined', async () => {
    // Stub global chrome without storage.session
    vi.stubGlobal('chrome', {});

    const memoryStore = new SessionKeyStore();
    const saltBytes = generateSalt();
    const saltBase64 = uint8ArrayToBase64(saltBytes);
    const key = await deriveKeyFromPassphrase('passphrase-123', saltBytes, 10_000);

    // Should not throw
    await expect(memoryStore.saveSession(key, saltBase64)).resolves.not.toThrow();
    expect(await memoryStore.isUnlocked()).toBe(true);

    const session = await memoryStore.loadSession();
    expect(session?.key).toBe(key);
    expect(session?.salt).toBe(saltBase64);

    await expect(memoryStore.clearSession()).resolves.not.toThrow();
    expect(await memoryStore.isUnlocked()).toBe(false);
  });

  it('returns null and does not throw when session storage contains malformed or empty data', async () => {
    mockSessionStorage['tabbellus_vault_session'] = { invalid: true };

    const corruptStore = new SessionKeyStore();
    expect(await corruptStore.isUnlocked()).toBe(false);
    expect(await corruptStore.loadSession()).toBeNull();
  });
});
