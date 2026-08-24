/**
 * Device Instance & License Storage Tests
 *
 * Tests the storage layer with mocked chrome.storage APIs:
 * - Instance UUID generation and persistence
 * - License data save/load/clear round-trip
 * - Sync-to-local fallback on quota error
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOrCreateInstanceId, getInstanceId } from '../storage/instanceManager';
import { saveLicenseData, loadLicenseData, clearLicenseData } from '../storage/licenseStorage';
import type { LicenseStorageData } from '../storage/licenseStorage';

// Mock chrome.storage
const localStore: Record<string, unknown> = {};
const syncStore: Record<string, unknown> = {};

beforeEach(() => {
  // Clear stores
  Object.keys(localStore).forEach((k) => delete localStore[k]);
  Object.keys(syncStore).forEach((k) => delete syncStore[k]);

  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('mock-uuid-1234-5678-9abc-def012345678'),
  });

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          return { [key]: localStore[key] };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(localStore, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete localStore[key];
        }),
      },
      sync: {
        get: vi.fn(async (key: string) => {
          return { [key]: syncStore[key] };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(syncStore, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete syncStore[key];
        }),
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('instanceManager', () => {
  it('should generate a new UUID on first call', async () => {
    const id = await getOrCreateInstanceId();

    expect(id).toBe('mock-uuid-1234-5678-9abc-def012345678');
    expect(localStore['tabbellus_instance_id']).toBe('mock-uuid-1234-5678-9abc-def012345678');
  });

  it('should return persisted UUID on subsequent calls', async () => {
    localStore['tabbellus_instance_id'] = 'existing-uuid-from-storage';

    const id = await getOrCreateInstanceId();

    expect(id).toBe('existing-uuid-from-storage');
    // crypto.randomUUID should NOT have been called
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('should return null from getInstanceId when no ID exists', async () => {
    const id = await getInstanceId();
    expect(id).toBeNull();
  });

  it('should return existing ID from getInstanceId', async () => {
    localStore['tabbellus_instance_id'] = 'existing-uuid';

    const id = await getInstanceId();
    expect(id).toBe('existing-uuid');
  });
});

describe('licenseStorage', () => {
  const testData: LicenseStorageData = {
    licenseKey: 'TEST-KEY-1234',
    instanceId: 'inst-uuid-1',
    status: 'active',
    tier: 'pro',
    validatedAt: Date.now(),
    expiresAt: null,
  };

  it('should save and load license data via sync storage', async () => {
    await saveLicenseData(testData);

    expect(syncStore['tabbellus_license']).toEqual(testData);

    const loaded = await loadLicenseData();
    expect(loaded).toEqual(testData);
  });

  it('should fall back to local storage when sync write fails', async () => {
    // Make sync.set throw quota error
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(
      new Error('QUOTA_BYTES_PER_ITEM quota exceeded'),
    );

    await saveLicenseData(testData);

    // Should have fallen back to local
    expect(localStore['tabbellus_license']).toEqual(testData);
  });

  it('should load from local storage when sync has no data', async () => {
    localStore['tabbellus_license'] = testData;

    const loaded = await loadLicenseData();
    expect(loaded).toEqual(testData);
  });

  it('should clear from both sync and local storage', async () => {
    syncStore['tabbellus_license'] = testData;
    localStore['tabbellus_license'] = testData;

    await clearLicenseData();

    expect(syncStore['tabbellus_license']).toBeUndefined();
    expect(localStore['tabbellus_license']).toBeUndefined();
  });

  it('should return null when no license data exists', async () => {
    const loaded = await loadLicenseData();
    expect(loaded).toBeNull();
  });
});
