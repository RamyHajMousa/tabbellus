/**
 * TabBellus Core Sync Contracts
 *
 * Owned by Free Core. Defines abstract types, telemetry models, and capability interfaces
 * for decoupled Pro cloud synchronization engines (e.g., Google Drive, E2EE sync).
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact ONLY with contracts defined here.
 * - This module MUST NOT import anything from `src/pro/`.
 */

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncTelemetry {
  lastSyncedAt?: number;
  pendingMutations: number;
  lastError?: string;
  encrypted: boolean;
}

export interface SyncStatus {
  state: SyncState;
  isConnected: boolean;
  telemetry: SyncTelemetry;
}

export interface SyncResult {
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface SyncProvider {
  getStatus(): Promise<SyncStatus>;
  connect(): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  syncNow(options?: { forceFull?: boolean }): Promise<SyncResult>;
  subscribe(callback: (status: SyncStatus) => void): () => void;
}
