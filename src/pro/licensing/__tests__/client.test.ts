/**
 * Lemon Squeezy API Client Tests
 *
 * Tests the HTTP client with mocked fetch to verify:
 * - Successful activation response parsing
 * - Invalid/expired key error normalization
 * - Network timeout/failure error normalization
 * - Rate limit (429) error normalization
 * - Malformed JSON response handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { activateLicense, validateLicense, deactivateLicense } from '../api/client';

// Mock global fetch
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('activateLicense', () => {
  it('should return success with activation data on valid response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        activated: true,
        license_key: { key: 'TEST-KEY-1234', status: 'active' },
        instance: { id: 'inst-uuid-1', name: 'tabbellus-device' },
      }),
    );

    const result = await activateLicense('TEST-KEY-1234', 'tabbellus-device');

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.activated).toBe(true);
    expect(result.data!.licenseKey.key).toBe('TEST-KEY-1234');
    expect(result.data!.instance.id).toBe('inst-uuid-1');
  });

  it('should return error for empty license key without making API call', async () => {
    const result = await activateLicense('', 'device');

    expect(result.success).toBe(false);
    expect(result.error).toBe('License key is required.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should normalize 404 invalid key error', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Invalid license key' }, 404),
    );

    const result = await activateLicense('INVALID-KEY', 'device');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should normalize 429 rate limit error', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({}, 429),
    );

    const result = await activateLicense('VALID-KEY', 'device');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit');
  });

  it('should normalize network failure errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

    const result = await activateLicense('VALID-KEY', 'device');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Connection error');
    expect(result.error).toContain('Failed to fetch');
  });

  it('should handle malformed JSON response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const result = await activateLicense('VALID-KEY', 'device');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid response');
  });
});

describe('validateLicense', () => {
  it('should return valid validation data on success', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        valid: true,
        license_key: { key: 'TEST-KEY', status: 'active', expires_at: null },
      }),
    );

    const result = await validateLicense('TEST-KEY', 'inst-1');

    expect(result.success).toBe(true);
    expect(result.data!.valid).toBe(true);
    expect(result.data!.licenseKey.status).toBe('active');
  });

  it('should return invalid validation data for expired key', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        valid: false,
        license_key: { key: 'EXPIRED-KEY', status: 'expired', expires_at: '2025-01-01' },
      }),
    );

    const result = await validateLicense('EXPIRED-KEY', 'inst-1');

    expect(result.success).toBe(true);
    expect(result.data!.valid).toBe(false);
    expect(result.data!.licenseKey.status).toBe('expired');
  });

  it('should handle server errors (5xx)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({}, 503),
    );

    const result = await validateLicense('TEST-KEY', 'inst-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('temporarily unavailable');
  });
});

describe('deactivateLicense', () => {
  it('should return success on valid deactivation', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ deactivated: true }),
    );

    const result = await deactivateLicense('TEST-KEY', 'inst-1');

    expect(result.success).toBe(true);
    expect(result.data!.deactivated).toBe(true);
  });

  it('should handle deactivation failure gracefully', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Instance not found' }, 400),
    );

    const result = await deactivateLicense('TEST-KEY', 'inst-1');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
