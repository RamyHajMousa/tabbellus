/**
 * GoogleDriveClient Unit Tests
 *
 * Verifies Google Drive REST API operations:
 * - findVaultFile: file found vs. empty results
 * - downloadVaultFile: media response parsing
 * - uploadVaultFile: multipart boundary structure for POST (create) and PATCH (update)
 * - 401 token invalidation and single-retry flow
 * - 403, 404, and network failure normalization
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveClient } from '../googleDriveClient';
import { googleAuthClient } from '../googleAuthClient';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../googleAuthClient', () => ({
  googleAuthClient: {
    getAuthToken: vi.fn(),
    invalidateToken: vi.fn(),
    revokeToken: vi.fn(),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockedAuth = vi.mocked(googleAuthClient);

describe('GoogleDriveClient', () => {
  let client: GoogleDriveClient;

  beforeEach(() => {
    client = new GoogleDriveClient();
    vi.clearAllMocks();
    // Default: auth succeeds with a valid token
    mockedAuth.getAuthToken.mockResolvedValue({ success: true, data: 'test-token' });
    mockedAuth.invalidateToken.mockResolvedValue(undefined);
  });

  // =========================================================================
  // findVaultFile
  // =========================================================================

  describe('findVaultFile', () => {
    it('returns files when vault file is found', async () => {
      const driveResponse = {
        files: [
          {
            id: 'file-001',
            name: 'tabbellus_vault.json',
            mimeType: 'application/json',
            modifiedTime: '2026-08-27T10:00:00.000Z',
            appProperties: {},
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(driveResponse),
      });

      const result = await client.findVaultFile();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(1);
        expect(result.data.files[0].id).toBe('file-001');
        expect(result.data.files[0].name).toBe('tabbellus_vault.json');
      }

      // Verify correct query URL
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('spaces=appDataFolder'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
    });

    it('returns empty files array when no vault file exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ files: [] }),
      });

      const result = await client.findVaultFile();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.files).toHaveLength(0);
      }
    });

    it('uses custom fileName when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ files: [] }),
      });

      await client.findVaultFile('custom_vault.json');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("name='custom_vault.json'"),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // downloadVaultFile
  // =========================================================================

  describe('downloadVaultFile', () => {
    it('parses JSON vault payload from media download', async () => {
      const vaultPayload = {
        schemaVersion: '1.0.0',
        clientTimestamp: '2026-08-27T10:00:00.000Z',
        payload: '{"spaces":[],"tabs":[]}',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(vaultPayload),
      });

      const result = await client.downloadVaultFile('file-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.schemaVersion).toBe('1.0.0');
        expect(result.data.payload).toBe('{"spaces":[],"tabs":[]}');
      }

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('file-001?alt=media'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
    });
  });

  // =========================================================================
  // uploadVaultFile
  // =========================================================================

  describe('uploadVaultFile', () => {
    it('creates new vault file with POST and appDataFolder parent', async () => {
      const uploadedFile = {
        id: 'new-file-001',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(uploadedFile),
      });

      const content = JSON.stringify({ schemaVersion: '1.0.0', payload: '{}' });
      const result = await client.uploadVaultFile(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('new-file-001');
      }

      // Verify POST to upload endpoint
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('upload/drive/v3/files?uploadType=multipart');
      expect(url).not.toContain('/new-file-001');
      expect(options.method).toBe('POST');

      // Verify multipart boundary structure
      expect(options.headers['Content-Type']).toMatch(/multipart\/related; boundary=tabbellus_/);
      expect(options.body).toContain('appDataFolder');
      expect(options.body).toContain('tabbellus_vault.json');
      expect(options.body).toContain(content);
    });

    it('updates existing vault file with PATCH', async () => {
      const updatedFile = {
        id: 'existing-file-001',
        name: 'tabbellus_vault.json',
        mimeType: 'application/json',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(updatedFile),
      });

      const content = JSON.stringify({ schemaVersion: '1.0.0', payload: '{"updated":true}' });
      const result = await client.uploadVaultFile(content, 'existing-file-001');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('existing-file-001');
      }

      // Verify PATCH to upload endpoint with file ID
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('upload/drive/v3/files/existing-file-001?uploadType=multipart');
      expect(options.method).toBe('PATCH');

      // Should contain modifiedTime metadata, NOT parents
      expect(options.body).toContain('modifiedTime');
      expect(options.body).not.toContain('appDataFolder');
    });

    it('constructs valid multipart boundary body with separators', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'test', name: 'test', mimeType: 'application/json' }),
      });

      await client.uploadVaultFile('{"test":true}');

      const body: string = mockFetch.mock.calls[0][1].body;
      const contentType: string = mockFetch.mock.calls[0][1].headers['Content-Type'];

      // Extract boundary from Content-Type header
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      expect(boundaryMatch).toBeTruthy();
      const boundary = boundaryMatch![1];

      // Verify boundary structure
      expect(body).toContain(`--${boundary}`);
      expect(body).toContain(`--${boundary}--`);
      expect(body).toContain('Content-Type: application/json; charset=UTF-8');
    });
  });

  // =========================================================================
  // 401 Auto-Recovery Protocol
  // =========================================================================

  describe('401 token recovery', () => {
    it('invalidates token and retries once on 401', async () => {
      // First call returns 401
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
        // Retry succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ files: [] }),
        });

      // Fresh token on retry
      mockedAuth.getAuthToken
        .mockResolvedValueOnce({ success: true, data: 'stale-token' })
        .mockResolvedValueOnce({ success: true, data: 'fresh-token' });

      const result = await client.findVaultFile();

      expect(result.success).toBe(true);
      expect(mockedAuth.invalidateToken).toHaveBeenCalledWith('stale-token');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify retry used the fresh token
      const retryHeaders = mockFetch.mock.calls[1][1].headers;
      expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
    });

    it('returns authExpired when retry also returns 401', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

      mockedAuth.getAuthToken
        .mockResolvedValueOnce({ success: true, data: 'stale-token' })
        .mockResolvedValueOnce({ success: true, data: 'still-stale' });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.authExpired).toBe(true);
        expect(result.statusCode).toBe(401);
      }
    });

    it('returns authExpired when fresh token retrieval fails after 401', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

      mockedAuth.getAuthToken
        .mockResolvedValueOnce({ success: true, data: 'stale-token' })
        .mockResolvedValueOnce({ success: false, error: 'Not signed in', authExpired: true });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.authExpired).toBe(true);
      }
    });
  });

  // =========================================================================
  // HTTP Error Normalization
  describe('HTTP error normalization', () => {
    it('normalizes 429 with Retry-After header as rate limit', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => (name.toLowerCase() === 'retry-after' ? '45' : null),
        },
      });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(429);
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(45);
        expect(result.error).toContain('rate limit exceeded');
      }
    });

    it('normalizes 403 with userRateLimitExceeded as rate limit', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: {
          get: () => null,
        },
        json: async () => ({
          error: {
            errors: [{ reason: 'userRateLimitExceeded' }],
            message: 'User Rate Limit Exceeded',
          },
        }),
      });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(429);
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(60);
        expect(result.error).toContain('rate limit exceeded');
      }
    });

    it('normalizes 403 as access denied when not a rate limit', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(403);
        expect(result.rateLimited).toBeUndefined();
        expect(result.error).toContain('Access denied');
      }
    });

    it('normalizes 404 as file not found', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      const result = await client.downloadVaultFile('nonexistent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(404);
        expect(result.error).toContain('not found');
      }
    });

    it('normalizes 500+ as server error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.statusCode).toBe(503);
        expect(result.error).toContain('server error');
      }
    });

    it('normalizes network offline errors', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('offline');
      }
    });

    it('normalizes generic network errors', async () => {
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Connection error');
      }
    });
  });

  // =========================================================================
  // Auth token failure before request
  // =========================================================================

  describe('pre-request auth failure', () => {
    it('returns error when initial token retrieval fails', async () => {
      mockedAuth.getAuthToken.mockResolvedValue({
        success: false,
        error: 'User not signed in.',
        authExpired: true,
      });

      const result = await client.findVaultFile();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('User not signed in.');
        expect(result.authExpired).toBe(true);
      }
      // fetch should never be called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
