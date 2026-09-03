/**
 * Unit Tests: Encryption Modal Logic Helpers
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePassphraseStrength,
  validateSetupDraft,
} from '../encryptionModalLogic';

describe('encryptionModalLogic', () => {
  describe('calculatePassphraseStrength', () => {
    it('returns score 0 and "Too Weak" for empty passphrase', () => {
      const result = calculatePassphraseStrength('');
      expect(result.score).toBe(0);
      expect(result.label).toBe('Too Weak');
    });

    it('returns score 1 and "Too Weak" for passphrase shorter than 8 characters', () => {
      const result = calculatePassphraseStrength('Ab1!');
      expect(result.score).toBe(1);
      expect(result.label).toBe('Too Weak');
      expect(result.colorClass).toContain('red');
    });

    it('returns score 1 and "Weak" for 8-char passphrase with low complexity', () => {
      const result = calculatePassphraseStrength('abcdefgh');
      expect(result.score).toBe(1);
      expect(result.label).toBe('Weak');
      expect(result.colorClass).toContain('red');
    });

    it('returns score 2 and "Fair" for 8-char passphrase with two variety factors', () => {
      // lower + upper = 1, number = 1 -> bonus 2
      const result = calculatePassphraseStrength('Abcdefgh1');
      expect(result.score).toBe(2);
      expect(result.label).toBe('Fair');
      expect(result.colorClass).toContain('amber');
    });

    it('returns score 3 and "Strong" for 8-char passphrase with three variety factors', () => {
      // lower + upper = 1, number = 1, special = 1 -> bonus 3
      const result = calculatePassphraseStrength('Abcdef1!');
      expect(result.score).toBe(3);
      expect(result.label).toBe('Strong');
      expect(result.colorClass).toContain('blue');
    });

    it('returns score 4 and "Very Strong" for long passphrase with full variety', () => {
      // lower + upper = 1, number = 1, special = 1, length >= 12 = 1 -> bonus 4
      const result = calculatePassphraseStrength('SuperSecretP@ssw0rd!');
      expect(result.score).toBe(4);
      expect(result.label).toBe('Very Strong');
      expect(result.colorClass).toContain('emerald');
    });
  });

  describe('validateSetupDraft', () => {
    it('rejects empty passphrase', () => {
      const result = validateSetupDraft('', '');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Passphrase is required.');
    });

    it('rejects passphrase with only whitespace', () => {
      const result = validateSetupDraft('   ', '   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Passphrase is required.');
    });

    it('rejects passphrase shorter than 8 characters', () => {
      const result = validateSetupDraft('short1', 'short1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Passphrase must be at least 8 characters long.');
    });

    it('rejects mismatching confirmation passphrase', () => {
      const result = validateSetupDraft('correct-pass-123', 'wrong-pass-123');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Passphrases do not match.');
    });

    it('accepts matching valid passphrases of 8+ characters', () => {
      const result = validateSetupDraft('correct-pass-123', 'correct-pass-123');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
