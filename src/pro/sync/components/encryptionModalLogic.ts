/**
 * Pure validation, strength evaluation, and submission helpers backing `EncryptionSetupModal`.
 *
 * Kept side-effect-free and independently testable under Node SSR test environments.
 */

export interface PassphraseStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  colorClass: string;
}

export interface SetupDraftValidation {
  isValid: boolean;
  error?: string;
}

/**
 * Calculates passphrase strength based on length, complexity, and character variety.
 *
 * Scored 0 to 4:
 * 0: Empty -> 'Too Weak'
 * 1: < 8 chars or single-dimension -> 'Too Weak' or 'Weak'
 * 2: >= 8 chars with 2 variety factors -> 'Fair'
 * 3: >= 8 chars with 3 variety factors -> 'Strong'
 * 4: >= 12 chars with full variety -> 'Very Strong'
 */
export function calculatePassphraseStrength(passphrase: string): PassphraseStrength {
  if (!passphrase || passphrase.length === 0) {
    return {
      score: 0,
      label: 'Too Weak',
      colorClass: 'bg-zinc-300 dark:bg-zinc-700',
    };
  }

  if (passphrase.length < 8) {
    return {
      score: 1,
      label: 'Too Weak',
      colorClass: 'bg-red-500',
    };
  }

  const hasLower = /[a-z]/.test(passphrase);
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasNumber = /[0-9]/.test(passphrase);
  const hasSpecial = /[^a-zA-Z0-9]/.test(passphrase);
  const isLong = passphrase.length >= 12;

  let bonus = 0;
  if (hasLower && hasUpper) bonus += 1;
  if (hasNumber) bonus += 1;
  if (hasSpecial) bonus += 1;
  if (isLong) bonus += 1;

  if (bonus <= 1) {
    return {
      score: 1,
      label: 'Weak',
      colorClass: 'bg-red-500',
    };
  }
  if (bonus === 2) {
    return {
      score: 2,
      label: 'Fair',
      colorClass: 'bg-amber-500',
    };
  }
  if (bonus === 3) {
    return {
      score: 3,
      label: 'Strong',
      colorClass: 'bg-blue-500',
    };
  }
  return {
    score: 4,
    label: 'Very Strong',
    colorClass: 'bg-emerald-500',
  };
}

/**
 * Validates the passphrase setup draft (non-empty, minimum 8 characters, exact match).
 */
export function validateSetupDraft(passphrase: string, confirm: string): SetupDraftValidation {
  if (!passphrase || passphrase.trim().length === 0) {
    return {
      isValid: false,
      error: 'Passphrase is required.',
    };
  }

  if (passphrase.length < 8) {
    return {
      isValid: false,
      error: 'Passphrase must be at least 8 characters long.',
    };
  }

  if (passphrase !== confirm) {
    return {
      isValid: false,
      error: 'Passphrases do not match.',
    };
  }

  return {
    isValid: true,
  };
}
