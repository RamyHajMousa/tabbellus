/**
 * Pure validation and state helpers backing `VaultUnlockModal`.
 *
 * Kept side-effect-free and independently testable under Node SSR test environments.
 */

export interface UnlockDraftValidation {
  isValid: boolean;
  error?: string;
}

/**
 * Validates the passphrase unlock draft.
 */
export function validateUnlockDraft(passphrase: string): UnlockDraftValidation {
  if (!passphrase || passphrase.trim().length === 0) {
    return {
      isValid: false,
      error: 'Please enter your passphrase.',
    };
  }

  return {
    isValid: true,
  };
}
