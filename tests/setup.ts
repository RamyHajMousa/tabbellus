/**
 * Global test setup — runs before every test file.
 *
 * Patches globalThis.indexedDB with an in-memory shim so Dexie
 * transactions execute in Node without a real browser.
 */
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { db } from '@/lib/db';

/**
 * Wipe all Dexie tables between tests for full transaction isolation.
 * This prevents state leakage across test cases without tearing down
 * and reconstructing the entire database instance.
 */
afterEach(async () => {
  await db.transaction('rw', db.spaces, db.tabs, db.readLater, async () => {
    await db.spaces.clear();
    await db.tabs.clear();
    await db.readLater.clear();
  });
});
