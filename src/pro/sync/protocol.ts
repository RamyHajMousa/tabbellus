/**
 * TabBellus Pro Cloud Sync Protocol (MV3 Messaging)
 *
 * Defines message types, payloads, and response structures for communication
 * between side-panel/UI clients and the background service worker sync dispatcher.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core does NOT import this file directly; it communicates via `SyncProvider`.
 * - Tokens and sensitive credentials MUST NEVER be carried in message payloads.
 */

import type { SyncOptions } from '@/core/contracts/sync';

export type SyncMessageType =
  | 'TABBELLUS_SYNC_GET_STATUS'
  | 'TABBELLUS_SYNC_CONNECT'
  | 'TABBELLUS_SYNC_DISCONNECT'
  | 'TABBELLUS_SYNC_SYNC_NOW'
  | 'TABBELLUS_SYNC_SETUP_ENCRYPTION'
  | 'TABBELLUS_SYNC_DISABLE_ENCRYPTION'
  | 'TABBELLUS_SYNC_UNLOCK_VAULT'
  | 'TABBELLUS_SYNC_LOCK_VAULT'
  | 'TABBELLUS_SYNC_RESET_CLOUD_VAULT'
  | 'TABBELLUS_SYNC_MUTATION';

export interface SyncMessageBase {
  type: SyncMessageType;
}

export interface SyncGetStatusMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_GET_STATUS';
}

export interface SyncConnectMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_CONNECT';
  // Tokens are NEVER sent in messages. Background fetches non-interactively.
}

export interface SyncDisconnectMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_DISCONNECT';
}

export interface SyncSyncNowMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_SYNC_NOW';
  options?: SyncOptions;
}

export interface SyncSetupEncryptionMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_SETUP_ENCRYPTION';
  passphrase: string;
}

export interface SyncDisableEncryptionMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_DISABLE_ENCRYPTION';
}

export interface SyncUnlockVaultMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_UNLOCK_VAULT';
  passphrase: string;
}

export interface SyncLockVaultMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_LOCK_VAULT';
}

export interface SyncResetCloudVaultMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_RESET_CLOUD_VAULT';
}

export interface SyncMutationMessage extends SyncMessageBase {
  type: 'TABBELLUS_SYNC_MUTATION';
}

export type SyncMessage =
  | SyncGetStatusMessage
  | SyncConnectMessage
  | SyncDisconnectMessage
  | SyncSyncNowMessage
  | SyncSetupEncryptionMessage
  | SyncDisableEncryptionMessage
  | SyncUnlockVaultMessage
  | SyncLockVaultMessage
  | SyncResetCloudVaultMessage
  | SyncMutationMessage;

export interface SyncResponseError {
  code?: string;
  message: string;
}

export interface SyncResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: SyncResponseError;
}

export const SYNC_LIVE_STATUS_SESSION_KEY = 'tabbellus_sync_live_status';
