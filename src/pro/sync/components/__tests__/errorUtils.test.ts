import { describe, it, expect } from 'vitest';
import { formatSyncErrorMessage } from '../errorUtils';

describe('formatSyncErrorMessage (T5)', () => {
  it('maps INVALID_PASSPHRASE error code to a readable user-facing message', () => {
    const errorFromCode = new Error('INVALID_PASSPHRASE');
    expect(formatSyncErrorMessage(errorFromCode)).toBe(
      'Incorrect passphrase. Decryption failed.',
    );

    const stringCode = 'INVALID_PASSPHRASE';
    expect(formatSyncErrorMessage(stringCode)).toBe(
      'Incorrect passphrase. Decryption failed.',
    );
  });

  it('maps UPDATE_REQUIRED error code to newer-schema update message', () => {
    const err = new Error('UPDATE_REQUIRED');
    expect(formatSyncErrorMessage(err)).toBe(
      'Sync paused: Cloud vault was updated by a newer version of TabBellus. Please update your extension to resume syncing.',
    );
  });

  it('maps SYNC_BUSY error code and objects to sync busy message', () => {
    expect(formatSyncErrorMessage('SYNC_BUSY')).toBe(
      'Sync is busy — please try again in a moment',
    );
    expect(formatSyncErrorMessage(new Error('SYNC_BUSY'))).toBe(
      'Sync is busy — please try again in a moment',
    );
    expect(formatSyncErrorMessage({ code: 'SYNC_BUSY' })).toBe(
      'Sync is busy — please try again in a moment',
    );
    expect(
      formatSyncErrorMessage(
        new Error('Sync is busy — please try again in a moment'),
      ),
    ).toBe('Sync is busy — please try again in a moment');
  });

  it('surfaces existing newer-schema update message without modification', () => {
    const fullMessage =
      'Sync paused: Cloud vault was updated by a newer version of TabBellus. Please update your extension to resume syncing.';
    const err = new Error(fullMessage);
    expect(formatSyncErrorMessage(err)).toBe(fullMessage);
  });

  it('surfaces descriptive error messages directly', () => {
    const disconnectedErr = new Error(
      'Cannot disable encryption while disconnected. Please connect Google Drive first.',
    );
    expect(formatSyncErrorMessage(disconnectedErr)).toBe(
      'Cannot disable encryption while disconnected. Please connect Google Drive first.',
    );

    const lockedErr = new Error(
      'Cannot disable encryption while vault is locked. Please unlock first.',
    );
    expect(formatSyncErrorMessage(lockedErr)).toBe(
      'Cannot disable encryption while vault is locked. Please unlock first.',
    );
  });

  it('falls back to defaultMessage when error is null, undefined, or empty', () => {
    expect(formatSyncErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
    expect(formatSyncErrorMessage(undefined, 'Custom fallback')).toBe('Custom fallback');
    expect(formatSyncErrorMessage('', 'Custom fallback')).toBe('Custom fallback');
    expect(formatSyncErrorMessage(new Error('   '), 'Custom fallback')).toBe(
      'Custom fallback',
    );
  });
});
