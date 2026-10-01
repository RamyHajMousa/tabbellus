/**
 * TabBellus Settings Configuration & Default Schema
 *
 * ZERO-REACT & ZERO-ZUSTAND GUARANTEE:
 * This module defines pure data interfaces and initial constants.
 * It MUST NEVER import React or Zustand, allowing safe consumption by
 * background services, sync engines, and UI stores alike.
 */

export interface AppSettings {
    theme: 'light' | 'dark' | 'system';
    badgeMode: 'none' | 'tabs' | 'read-later';
    showDomain: boolean;
    readLaterOpenBehavior: 'foreground' | 'background';
    readLaterAutoArchive: boolean;
    autoDiscardInterval: 0 | 15 | 30 | 60 | 120;
    spaceRestoreTrigger: 'single' | 'double';
    duplicateTabBehavior: 'allow' | 'focus-existing';
    settingsUpdatedAt: number;
    [key: string]: unknown;
}

export const PORTABLE_SETTINGS_KEYS: (keyof AppSettings)[] = [
    'duplicateTabBehavior',
    'spaceRestoreTrigger',
    'readLaterOpenBehavior',
    'readLaterAutoArchive',
];

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'system',
    badgeMode: 'read-later',
    showDomain: true,
    readLaterOpenBehavior: 'foreground',
    readLaterAutoArchive: true,
    autoDiscardInterval: 0,
    spaceRestoreTrigger: 'single',
    duplicateTabBehavior: 'focus-existing',
    settingsUpdatedAt: 0,
};

/**
 * In-memory fallback storage for headless / Node test environments where
 * `chrome.storage.local` is not defined.
 */
export const memoryStorageFallback: Record<string, string | object> = {};

