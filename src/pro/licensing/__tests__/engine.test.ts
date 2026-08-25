/**
 * ProLicensingEngine Tests
 *
 * Tests the concrete licensing engine with mocked dependencies:
 * - Initial hydration from cached storage
 * - validateKey() success/failure flows with subscriber notification
 * - clearLicense() with deactivation and subscriber notification
 * - Subscriber add/remove lifecycle
 * - 24h background revalidation trigger
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the API module
vi.mock('../api/client', () => ({
  activateLicense: vi.fn(),
  validateLicense: vi.fn(),
  deactivateLicense: vi.fn(),
}));

// Mock the storage modules
vi.mock('../storage/instanceManager', () => ({
  getOrCreateInstanceId: vi.fn().mockResolvedValue('mock-instance-uuid'),
  getInstanceId: vi.fn().mockResolvedValue('mock-instance-uuid'),
}));

vi.mock('../storage/licenseStorage', () => ({
  saveLicenseData: vi.fn().mockResolvedValue(undefined),
  loadLicenseData: vi.fn().mockResolvedValue(null),
  clearLicenseData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../storage/graceEvaluator', () => ({
  evaluateGracePeriod: vi.fn().mockReturnValue({ isPro: false, tier: 'free' }),
}));

import { ProLicensingEngine } from '../index';
import { activateLicense, deactivateLicense } from '../api/client';
import { loadLicenseData, saveLicenseData, clearLicenseData } from '../storage/licenseStorage';
import { getOrCreateInstanceId } from '../storage/instanceManager';
import { evaluateGracePeriod } from '../storage/graceEvaluator';

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish default mock return values after clearAllMocks
  vi.mocked(loadLicenseData).mockResolvedValue(null);
  vi.mocked(evaluateGracePeriod).mockReturnValue({ isPro: false, tier: 'free' });
  vi.mocked(saveLicenseData).mockResolvedValue(undefined);
  vi.mocked(clearLicenseData).mockResolvedValue(undefined);
  vi.mocked(getOrCreateInstanceId).mockResolvedValue('mock-instance-uuid');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProLicensingEngine', () => {
  it('should initialize with free tier when no cached data exists', async () => {
    vi.mocked(loadLicenseData).mockResolvedValue(null);
    vi.mocked(evaluateGracePeriod).mockReturnValue({ isPro: false, tier: 'free' });

    const engine = new ProLicensingEngine();

    // Wait for async hydration
    await vi.waitFor(async () => {
      const status = await engine.getEntitlement();
      expect(status.isPro).toBe(false);
      expect(status.tier).toBe('free');
    });
  });

  it('should hydrate from cached storage and evaluate grace period', async () => {
    const cachedData = {
      licenseKey: 'CACHED-KEY',
      instanceId: 'inst-1',
      status: 'active' as const,
      tier: 'pro' as const,
      validatedAt: Date.now() - 3600000, // 1 hour ago
      expiresAt: null,
    };

    vi.mocked(loadLicenseData).mockResolvedValue(cachedData);
    vi.mocked(evaluateGracePeriod).mockReturnValue({
      isPro: true,
      tier: 'pro',
      gracePeriodActive: false,
    });

    const engine = new ProLicensingEngine();

    await vi.waitFor(async () => {
      const status = await engine.getEntitlement();
      expect(status.isPro).toBe(true);
      expect(status.tier).toBe('pro');
    });

    expect(evaluateGracePeriod).toHaveBeenCalledWith(cachedData);
  });

  it('should activate a valid license key and notify subscribers', async () => {
    vi.mocked(loadLicenseData).mockResolvedValue(null);
    vi.mocked(activateLicense).mockResolvedValue({
      success: true,
      data: {
        activated: true,
        licenseKey: { key: 'NEW-KEY-1234', status: 'active' },
        instance: { id: 'new-inst-1', name: 'device' },
      },
    });

    const engine = new ProLicensingEngine();
    await vi.waitFor(async () => {
      await engine.getEntitlement();
    });

    const listener = vi.fn();
    engine.subscribe(listener);

    // Clear the initial subscription callback
    listener.mockClear();

    const result = await engine.validateKey('NEW-KEY-1234');

    expect(result.success).toBe(true);
    expect(saveLicenseData).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ isPro: true, tier: 'pro' }),
    );
  });

  it('should return error for invalid key without modifying state', async () => {
    vi.mocked(loadLicenseData).mockResolvedValue(null);
    vi.mocked(activateLicense).mockResolvedValue({
      success: false,
      error: 'Invalid license key',
    });

    const engine = new ProLicensingEngine();
    // Wait for async hydration to complete by checking isPro is defined (not undefined)
    await vi.waitFor(async () => {
      const s = await engine.getEntitlement();
      expect(s.isPro).toBeDefined();
    });

    const result = await engine.validateKey('INVALID-KEY');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid license key');

    const status = await engine.getEntitlement();
    expect(status.isPro).toBe(false);
  });

  it('should return error for empty key without API call', async () => {
    vi.mocked(loadLicenseData).mockResolvedValue(null);

    const engine = new ProLicensingEngine();
    await vi.waitFor(async () => {
      await engine.getEntitlement();
    });

    const result = await engine.validateKey('');

    expect(result.success).toBe(false);
    expect(result.error).toContain('enter a license key');
    expect(activateLicense).not.toHaveBeenCalled();
  });

  it('should clear license and notify subscribers of free tier', async () => {
    const cachedData = {
      licenseKey: 'ACTIVE-KEY',
      instanceId: 'inst-1',
      status: 'active' as const,
      tier: 'pro' as const,
      validatedAt: Date.now(),
      expiresAt: null,
    };

    vi.mocked(loadLicenseData).mockResolvedValue(cachedData);
    vi.mocked(evaluateGracePeriod).mockReturnValue({
      isPro: true,
      tier: 'pro',
      gracePeriodActive: false,
    });
    vi.mocked(deactivateLicense).mockResolvedValue({
      success: true,
      data: { deactivated: true },
    });

    const engine = new ProLicensingEngine();
    await vi.waitFor(async () => {
      const s = await engine.getEntitlement();
      expect(s.isPro).toBe(true);
    });

    const listener = vi.fn();
    engine.subscribe(listener);
    listener.mockClear();

    await engine.clearLicense();

    expect(clearLicenseData).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ isPro: false, tier: 'free' }),
    );

    const status = await engine.getEntitlement();
    expect(status.isPro).toBe(false);
  });

  it('should support subscriber unsubscription', async () => {
    vi.mocked(loadLicenseData).mockResolvedValue(null);

    const engine = new ProLicensingEngine();
    await vi.waitFor(async () => {
      await engine.getEntitlement();
    });

    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    // Should have been called once immediately on subscribe
    expect(listener).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();
    listener.mockClear();

    // Trigger a state change — listener should NOT be called
    vi.mocked(activateLicense).mockResolvedValue({
      success: true,
      data: {
        activated: true,
        licenseKey: { key: 'KEY', status: 'active' },
        instance: { id: 'inst', name: 'dev' },
      },
    });
    await engine.validateKey('KEY');

    expect(listener).not.toHaveBeenCalled();
  });

  describe('Dev Testing Harness', () => {
    it('should bypass API for DEV- prefix keys and activate Pro', async () => {
      vi.mocked(loadLicenseData).mockResolvedValue(null);

      const engine = new ProLicensingEngine();
      await vi.waitFor(async () => {
        await engine.getEntitlement();
      });

      const listener = vi.fn();
      engine.subscribe(listener);
      listener.mockClear();

      const result = await engine.validateKey('DEV-KEY-123');

      expect(result.success).toBe(true);
      expect(activateLicense).not.toHaveBeenCalled();
      expect(saveLicenseData).toHaveBeenCalledWith(
        expect.objectContaining({
          licenseKey: 'DEV-KEY-123',
          instanceId: 'dev-instance',
          status: 'active',
          tier: 'pro',
        }),
      );
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isPro: true, tier: 'pro' }),
      );

      const status = await engine.getEntitlement();
      expect(status.isPro).toBe(true);
      expect(status.tier).toBe('pro');
    });

    it('should bypass API for TB-TEST- prefix keys and activate Pro', async () => {
      vi.mocked(loadLicenseData).mockResolvedValue(null);

      const engine = new ProLicensingEngine();
      await vi.waitFor(async () => {
        await engine.getEntitlement();
      });

      const result = await engine.validateKey('TB-TEST-456');

      expect(result.success).toBe(true);
      expect(activateLicense).not.toHaveBeenCalled();
      expect(saveLicenseData).toHaveBeenCalledWith(
        expect.objectContaining({
          licenseKey: 'TB-TEST-456',
          instanceId: 'dev-instance',
          status: 'active',
          tier: 'pro',
        }),
      );

      const status = await engine.getEntitlement();
      expect(status.isPro).toBe(true);
    });

    it('should still call Lemon Squeezy API for standard keys', async () => {
      vi.mocked(loadLicenseData).mockResolvedValue(null);
      vi.mocked(activateLicense).mockResolvedValue({
        success: true,
        data: {
          activated: true,
          licenseKey: { key: 'REAL-KEY-789', status: 'active' },
          instance: { id: 'real-inst', name: 'device' },
        },
      });

      const engine = new ProLicensingEngine();
      await vi.waitFor(async () => {
        await engine.getEntitlement();
      });

      const result = await engine.validateKey('REAL-KEY-789');

      expect(result.success).toBe(true);
      expect(activateLicense).toHaveBeenCalledWith('REAL-KEY-789', 'mock-instance-uuid');
    });

    it('should reset to free after clearLicense following dev bypass', async () => {
      vi.mocked(loadLicenseData).mockResolvedValue(null);
      vi.mocked(deactivateLicense).mockResolvedValue({
        success: true,
        data: { deactivated: true },
      });

      const engine = new ProLicensingEngine();
      await vi.waitFor(async () => {
        await engine.getEntitlement();
      });

      // Activate via dev bypass
      await engine.validateKey('DEV-RESET-TEST');
      const proStatus = await engine.getEntitlement();
      expect(proStatus.isPro).toBe(true);

      // Clear and verify reset
      await engine.clearLicense();
      const freeStatus = await engine.getEntitlement();
      expect(freeStatus.isPro).toBe(false);
      expect(freeStatus.tier).toBe('free');
      expect(clearLicenseData).toHaveBeenCalled();
    });
  });
});

