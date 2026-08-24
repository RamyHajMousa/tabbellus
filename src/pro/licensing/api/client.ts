/**
 * Lemon Squeezy License API Client
 *
 * Type-safe HTTP client for the Lemon Squeezy licensing API.
 * All methods return normalized `LicenseApiResult<T>` — network failures,
 * invalid keys, rate limits, and 4xx/5xx errors are caught and returned
 * as typed error results without throwing uncaught exceptions.
 */

import type {
  LicenseApiResult,
  ActivationData,
  ValidationData,
  DeactivationData,
} from './types';

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1/licenses';

/**
 * Safely parses a JSON response body, returning null on failure.
 */
async function safeParseJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extracts a human-readable error message from a Lemon Squeezy API error response.
 */
function extractErrorMessage(json: Record<string, unknown> | null, status: number): string {
  if (json && typeof json.error === 'string') {
    return json.error;
  }
  if (json && typeof json.message === 'string') {
    return json.message;
  }
  if (status === 429) {
    return 'Rate limit exceeded. Please try again later.';
  }
  if (status === 404) {
    return 'Invalid license key.';
  }
  if (status >= 500) {
    return 'License server is temporarily unavailable. Please try again later.';
  }
  return `Unexpected error (HTTP ${status}).`;
}

/**
 * Makes a POST request to the Lemon Squeezy licensing API.
 * Wraps all failure modes into a normalized result type.
 */
async function postLicenseEndpoint<T>(
  endpoint: string,
  body: Record<string, string>,
): Promise<LicenseApiResult<T>> {
  try {
    const response = await fetch(`${LS_API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    });

    const json = await safeParseJson(response);

    if (!response.ok) {
      return {
        success: false,
        error: extractErrorMessage(json, response.status),
      };
    }

    if (!json) {
      return {
        success: false,
        error: 'Invalid response from license server.',
      };
    }

    return {
      success: true,
      data: json as T,
    };
  } catch (err: unknown) {
    // Network failures, DNS resolution errors, timeouts, AbortError, etc.
    const message =
      err instanceof Error ? err.message : 'Network request failed.';
    return {
      success: false,
      error: `Connection error: ${message}`,
    };
  }
}

/**
 * Activates a license key for this device instance.
 *
 * @param licenseKey - The license key string to activate
 * @param instanceName - A human-readable name for this device instance
 * @returns Normalized result with activation data or error
 */
export async function activateLicense(
  licenseKey: string,
  instanceName: string,
): Promise<LicenseApiResult<ActivationData>> {
  if (!licenseKey || licenseKey.trim().length === 0) {
    return { success: false, error: 'License key is required.' };
  }

  const result = await postLicenseEndpoint<Record<string, unknown>>('activate', {
    license_key: licenseKey.trim(),
    instance_name: instanceName,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  const raw = result.data;

  // Normalize Lemon Squeezy response shape into our typed structure
  const activated = Boolean(raw.activated);
  const meta = (raw.meta as Record<string, unknown>) ?? {};
  const licenseKeyData = (raw.license_key as Record<string, unknown>) ?? (meta.license_key as Record<string, unknown>) ?? {};
  const instanceData = (raw.instance as Record<string, unknown>) ?? (meta.instance as Record<string, unknown>) ?? {};

  return {
    success: true,
    data: {
      activated,
      licenseKey: {
        key: String(licenseKeyData.key ?? licenseKey),
        status: String(licenseKeyData.status ?? 'active'),
      },
      instance: {
        id: String(instanceData.id ?? ''),
        name: String(instanceData.name ?? instanceName),
      },
    },
  };
}

/**
 * Validates an existing license key and instance.
 *
 * @param licenseKey - The license key to validate
 * @param instanceId - The instance ID to validate against
 * @returns Normalized result with validation data or error
 */
export async function validateLicense(
  licenseKey: string,
  instanceId: string,
): Promise<LicenseApiResult<ValidationData>> {
  if (!licenseKey || licenseKey.trim().length === 0) {
    return { success: false, error: 'License key is required.' };
  }

  const result = await postLicenseEndpoint<Record<string, unknown>>('validate', {
    license_key: licenseKey.trim(),
    instance_id: instanceId,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  const raw = result.data;
  const valid = Boolean(raw.valid);
  const meta = (raw.meta as Record<string, unknown>) ?? {};
  const licenseKeyData = (raw.license_key as Record<string, unknown>) ?? (meta.license_key as Record<string, unknown>) ?? {};

  return {
    success: true,
    data: {
      valid,
      licenseKey: {
        key: String(licenseKeyData.key ?? licenseKey),
        status: String(licenseKeyData.status ?? (valid ? 'active' : 'inactive')),
        expiresAt: licenseKeyData.expires_at ? String(licenseKeyData.expires_at) : null,
      },
    },
  };
}

/**
 * Deactivates a license key instance.
 *
 * @param licenseKey - The license key to deactivate
 * @param instanceId - The instance ID to deactivate
 * @returns Normalized result with deactivation data or error
 */
export async function deactivateLicense(
  licenseKey: string,
  instanceId: string,
): Promise<LicenseApiResult<DeactivationData>> {
  if (!licenseKey || licenseKey.trim().length === 0) {
    return { success: false, error: 'License key is required.' };
  }

  const result = await postLicenseEndpoint<Record<string, unknown>>('deactivate', {
    license_key: licenseKey.trim(),
    instance_id: instanceId,
  });

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      deactivated: Boolean(result.data.deactivated),
    },
  };
}
