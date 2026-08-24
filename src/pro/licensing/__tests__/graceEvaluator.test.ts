/**
 * Offline Grace Period Evaluator Tests
 *
 * Tests the deterministic grace period logic:
 * - Null/missing data → free tier
 * - Recent validation (within 7 days) → pro with grace flag
 * - Expired validation (>7 days) → free tier
 * - Boundary conditions (exactly 7 days)
 * - Inactive status → free tier regardless of timing
 * - Explicit expiration date handling
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateGracePeriod } from '../storage/graceEvaluator';
import type { LicenseStorageData } from '../storage/licenseStorage';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;
const SEVEN_DAYS = 7 * ONE_DAY;

function createMockStorage(overrides: Partial<LicenseStorageData> = {}): LicenseStorageData {
  return {
    licenseKey: 'TEST-KEY',
    instanceId: 'inst-1',
    status: 'active',
    tier: 'pro',
    validatedAt: Date.now(),
    expiresAt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateGracePeriod', () => {
  it('should return free tier for null data', () => {
    const result = evaluateGracePeriod(null);
    expect(result.isPro).toBe(false);
    expect(result.tier).toBe('free');
  });

  it('should return pro for recently validated license (1 hour ago)', () => {
    const data = createMockStorage({
      validatedAt: Date.now() - ONE_HOUR,
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(true);
    expect(result.tier).toBe('pro');
    // Within 24h — gracePeriodActive should be false
    expect(result.gracePeriodActive).toBe(false);
  });

  it('should return pro with grace flag for validation 2 days ago', () => {
    const data = createMockStorage({
      validatedAt: Date.now() - (2 * ONE_DAY),
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(true);
    expect(result.tier).toBe('pro');
    expect(result.gracePeriodActive).toBe(true);
  });

  it('should return pro with grace flag for validation 6 days ago', () => {
    const data = createMockStorage({
      validatedAt: Date.now() - (6 * ONE_DAY),
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(true);
    expect(result.gracePeriodActive).toBe(true);
  });

  it('should return free tier for validation older than 7 days', () => {
    const data = createMockStorage({
      validatedAt: Date.now() - SEVEN_DAYS - ONE_HOUR,
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(false);
    expect(result.tier).toBe('free');
  });

  it('should return pro at exactly 6 days 23 hours (boundary - inside grace)', () => {
    const data = createMockStorage({
      validatedAt: Date.now() - (SEVEN_DAYS - ONE_HOUR),
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(true);
  });

  it('should return free tier for inactive status regardless of timing', () => {
    const data = createMockStorage({
      status: 'inactive',
      validatedAt: Date.now() - ONE_HOUR, // Recently validated but status is inactive
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(false);
    expect(result.tier).toBe('free');
  });

  it('should return free tier for expired status', () => {
    const data = createMockStorage({
      status: 'expired',
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(false);
  });

  it('should return free tier for disabled status', () => {
    const data = createMockStorage({
      status: 'disabled',
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(false);
  });

  it('should return free tier when expiresAt has passed', () => {
    const data = createMockStorage({
      validatedAt: Date.now() - ONE_HOUR,
      expiresAt: Date.now() - ONE_DAY, // Expired yesterday
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(false);
    expect(result.tier).toBe('free');
  });

  it('should preserve enterprise tier from cached data', () => {
    const data = createMockStorage({
      tier: 'enterprise',
      validatedAt: Date.now() - ONE_HOUR,
    });

    const result = evaluateGracePeriod(data);
    expect(result.isPro).toBe(true);
    expect(result.tier).toBe('enterprise');
  });
});
