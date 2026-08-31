/**
 * Google Drive Sync Settings Card
 *
 * High-density settings card for managing Google Drive cloud synchronization.
 * Renders in the Settings Data tab via declarative feature slot registration.
 *
 * States:
 * - Disconnected: Explanation of BYOC appData storage + "Connect Google Drive" action
 * - Connected: Live status pill, last-synced relative telemetry, "Sync Now" action, "Disconnect" option
 * - Syncing / Error / Offline: Dynamic telemetry badges and loading indicators
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Isolated Pro component.
 * - Consumes `useSyncStatus` from `@/core` and `syncEngine` from Pro sync engine.
 */

import React, { useState, useCallback } from 'react';
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  WifiOff,
} from 'lucide-react';
import { useSyncStatus } from '@/core/hooks/useSyncStatus';
import { syncEngine } from '../engine/syncEngine';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { formatRelativeTime } from '@/lib/dateUtils';

export const SyncSettingsCard: React.FC = () => {
  const { state, isConnected, telemetry } = useSyncStatus();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      const result = await syncEngine.connect();
      if (result.success) {
        toast('Google Drive connected!', {
          description: 'Ready to synchronize workspaces across devices.',
        });
        // Trigger an initial sync cycle right after connecting
        await syncEngine.syncNow();
      } else {
        toast('Failed to connect Google Drive', {
          description: result.error ?? 'Authentication was cancelled or rejected.',
        });
      }
    } catch {
      toast('Failed to connect Google Drive', {
        description: 'An unexpected connection error occurred.',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, toast]);

  const handleSyncNow = useCallback(async () => {
    if (state === 'syncing') return;

    try {
      const result = await syncEngine.syncNow();
      if (result.success) {
        toast('Sync completed', {
          description: 'All workspaces and tabs are up to date.',
        });
      } else {
        toast('Sync failed', {
          description: result.error ?? 'Could not synchronize with Google Drive.',
        });
      }
    } catch {
      toast('Sync failed', {
        description: 'An unexpected error occurred during sync.',
      });
    }
  }, [state, toast]);

  const handleDisconnect = useCallback(async () => {
    try {
      await syncEngine.disconnect();
      toast('Google Drive sync disconnected', {
        description: 'Cloud synchronization has been disabled on this device.',
      });
    } catch {
      toast('Failed to disconnect', {
        description: 'Please try again.',
      });
    }
  }, [toast]);

  // Determine status pill badge styling
  const renderStatusBadge = () => {
    if (!isConnected) {
      return (
        <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 text-xxs font-semibold">
          Disconnected
        </span>
      );
    }

    switch (state) {
      case 'syncing':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
            <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0" />
            Syncing…
          </span>
        );
      case 'synced':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
            <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
            Synced
          </span>
        );
      case 'offline':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
            <WifiOff className="w-2.5 h-2.5 shrink-0" />
            Offline
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 text-xxs font-semibold">
            Connected
          </span>
        );
    }
  };

  // --- Disconnected / Unlinked View ---
  if (!isConnected) {
    return (
      <div className="p-3.5 rounded-lg border border-border bg-card space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <Cloud className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Google Drive Cloud Sync
                </h4>
                {renderStatusBadge()}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-normal">
                Bring Your Own Cloud (BYOC). Sync workspaces and deferred links across devices using your private Google Drive appData partition.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-1">
          <TooltipSimple content="Sign in with Google to enable cloud sync across devices" side="top">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Connect Google Drive"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Connecting…</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  <span>Connect Google Drive</span>
                </>
              )}
            </button>
          </TooltipSimple>
        </div>
      </div>
    );
  }

  // --- Connected View ---
  const isSyncing = state === 'syncing';
  const lastSyncedText = telemetry.lastSyncedAt
    ? formatRelativeTime(telemetry.lastSyncedAt)
    : 'Never synced';

  return (
    <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <Cloud className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Google Drive Cloud Sync
              </h4>
              {renderStatusBadge()}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Private appData partition • End-to-end local reconciliation
            </p>
          </div>
        </div>

        <TooltipSimple content="Disconnect Google Drive sync on this device" side="top">
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-xxs text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded shrink-0"
            aria-label="Disconnect Google Drive"
          >
            Disconnect
          </button>
        </TooltipSimple>
      </div>

      {/* Telemetry Grid */}
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <div className="p-2 rounded-md bg-muted/40 border border-border/50">
          <p className="text-[11px] text-muted-foreground">Last Synced</p>
          <p className="text-xs font-medium text-foreground mt-0.5 capitalize">
            {lastSyncedText}
          </p>
        </div>
        <div className="p-2 rounded-md bg-muted/40 border border-border/50">
          <p className="text-[11px] text-muted-foreground">Storage Location</p>
          <div className="flex items-center gap-1 mt-0.5">
            <HardDrive className="w-3 h-3 text-muted-foreground shrink-0" />
            <p className="text-xs font-medium text-foreground truncate">
              appDataFolder
            </p>
          </div>
        </div>
      </div>

      {/* Error / Offline Warning Notice */}
      {telemetry.lastError && state !== 'synced' && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xxs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="leading-tight">{telemetry.lastError}</span>
        </div>
      )}

      {/* Actions Row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <TooltipSimple content="Synchronize local workspaces and tabs with Google Drive now" side="top">
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Sync now"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing…' : 'Sync Now'}</span>
          </button>
        </TooltipSimple>

        <span className="text-xxs text-muted-foreground">
          Auto-sync on change
        </span>
      </div>
    </div>
  );
};

export default SyncSettingsCard;
