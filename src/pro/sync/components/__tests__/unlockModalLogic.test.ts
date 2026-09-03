/**
 * Unit Tests: Unlock Modal Logic Helpers
 */

import { describe, it, expect } from 'vitest';
import { validateUnlockDraft } from '../unlockModalLogic';

describe('unlockModalLogic', () => {
  describe('validateUnlockDraft', () => {
    it('rejects empty passphrase', () => {
      const result = validateUnlockDraft('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Please enter your passphrase.');
    });

    it('rejects whitespace-only passphrase', () => {
      const result = validateUnlockDraft('   ');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Please enter your passphrase.');
    });

    it('accepts non-empty passphrase', () => {
      const result = validateUnlockDraft('my-passphrase');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
