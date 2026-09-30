/**
 * Utility for formatting and mapping sync and encryption errors to user-facing messages.
 */

const KNOWN_ERROR_MAPPINGS: Record<string, string> = {
  INVALID_PASSPHRASE: 'Incorrect passphrase. Decryption failed.',
  UPDATE_REQUIRED:
    'Sync paused: Cloud vault was updated by a newer version of TabBellus. Please update your extension to resume syncing.',
};

/**
 * Maps sync error codes and exceptions to human-readable user-facing messages.
 *
 * @param err - Thrown error, error code string, or unknown exception.
 * @param defaultMessage - Fallback message if error is unknown or empty.
 * @returns Human-readable string suitable for UI toasts and alert boxes.
 */
export function formatSyncErrorMessage(
  err: unknown,
  defaultMessage: string = 'An unexpected error occurred. Please try again.',
): string {
  if (!err) {
    return defaultMessage;
  }

  let rawMessage = '';
  if (err instanceof Error) {
    rawMessage = err.message;
  } else if (typeof err === 'string') {
    rawMessage = err;
  } else if (
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    rawMessage = (err as { message: string }).message;
  } else if (
    typeof err === 'object' &&
    'error' in err &&
    typeof (err as { error: unknown }).error === 'string'
  ) {
    rawMessage = (err as { error: string }).error;
  } else {
    return defaultMessage;
  }

  const trimmed = rawMessage.trim();
  if (!trimmed) {
    return defaultMessage;
  }

  // Exact match with known error code
  if (KNOWN_ERROR_MAPPINGS[trimmed]) {
    return KNOWN_ERROR_MAPPINGS[trimmed];
  }

  // Token match within message
  if (trimmed.includes('INVALID_PASSPHRASE')) {
    return KNOWN_ERROR_MAPPINGS.INVALID_PASSPHRASE;
  }

  if (trimmed.includes('UPDATE_REQUIRED')) {
    return KNOWN_ERROR_MAPPINGS.UPDATE_REQUIRED;
  }

  // Return the descriptive error message (e.g. newer schema message, network error, disconnected message)
  return trimmed;
}
