/**
 * Google Drive Sync Settings Card
 *
 * High-density settings card for managing Google Drive cloud synchronization
 * with client-side Zero-Knowledge End-to-End Encryption (E2EE) support.
 * Renders in the Settings Data tab via declarative feature slot registration.
 *
 * States:
 * - Disconnected: Explanation of BYOC appData storage + "Connect Google Drive" action
 * - Connected (Standard): Live status pill, "Standard Sync" badge, "Enable E2EE" CTA, "Sync Now" action
 * - Connected (E2EE Active): "E2E Encrypted" pill, "Lock" action, last-synced telemetry, "Sync Now" action
 * - Locked: Amber "Vault Locked" pill, "Unlock Vault" CTA opening `VaultUnlockModal`
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
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Lock,
  LockOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useSyncStatus } from '@/core/hooks/useSyncStatus';
import { syncEngine } from '../engine/syncEngine';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { formatRelativeTime } from '@/lib/dateUtils';
import { EncryptionSetupModal } from './EncryptionSetupModal';
import { VaultUnlockModal } from './VaultUnlockModal';

export const SyncSettingsCard: React.FC = () => {
  const { state, isConnected, telemetry } = useSyncStatus();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

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
    if (state === 'syncing' || state === 'locked') return;

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

  const handleLockVault = useCallback(async () => {
    try {
      await syncEngine.lockVault();
      toast('Vault locked for this session', {
        description: 'Passphrase required to resume synchronization.',
      });
    } catch {
      toast('Failed to lock vault', {
        description: 'Please try again.',
      });
    }
  }, [toast]);

  const handleConfirmDisable = useCallback(async () => {
    if (isDisabling) return;
    setIsDisabling(true);
    try {
      await syncEngine.disableEncryption();
      setDisableDialogOpen(false);
      toast('E2E Encryption Disabled: Cloud vault reverted to standard sync.');
    } catch {
      toast('Failed to disable encryption', {
        description: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsDisabling(false);
    }
  }, [isDisabling, toast]);

  const handleResetFromUnlock = useCallback(() => {
    setUnlockModalOpen(false);
    setSetupModalOpen(true);
  }, []);

  // Determine status pill badge styling
  const renderStatusBadge = () => {
    if (!isConnected) {
      return (
        <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 text-xxs font-semibold">
          Disconnected
        </span>
      );
    }

    if (state === 'locked') {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
          <Lock className="w-2.5 h-2.5 shrink-0" />
          Vault Locked
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

  const renderEncryptionBadge = () => {
    if (!isConnected || state === 'locked') return null;

    if (telemetry.encrypted) {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
          <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
          E2E Encrypted
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5 text-xxs font-semibold">
        <Shield className="w-2.5 h-2.5 shrink-0" />
        Standard Sync
      </span>
    );
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
  const isLocked = state === 'locked';
  const lastSyncedText = telemetry.lastSyncedAt
    ? formatRelativeTime(telemetry.lastSyncedAt)
    : 'Never synced';

  return (
    <>
      <div className="p-3.5 rounded-lg border border-border bg-card space-y-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <Cloud className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  Google Drive Cloud Sync
                </h4>
                {renderStatusBadge()}
                {renderEncryptionBadge()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {telemetry.encrypted
                  ? 'Zero-Knowledge E2EE active • Client-side AES-GCM-256'
                  : 'Private appData partition • End-to-end local reconciliation'}
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
              {telemetry.encrypted ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                  <p className="text-xs font-medium text-foreground truncate">
                    appDataFolder (E2EE)
                  </p>
                </>
              ) : (
                <>
                  <HardDrive className="w-3 h-3 text-muted-foreground shrink-0" />
                  <p className="text-xs font-medium text-foreground truncate">
                    appDataFolder
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Locked Notice */}
        {isLocked && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xxs">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="leading-normal">
              Vault is locked on this device. Synchronization is paused until unlocked with your passphrase.
            </span>
          </div>
        )}

        {/* Error / Offline Warning Notice */}
        {telemetry.lastError && state !== 'synced' && !isLocked && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xxs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="leading-tight">{telemetry.lastError}</span>
          </div>
        )}

        {/* Actions Row */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <div className="flex items-center gap-2 flex-wrap">
            {isLocked ? (
              <TooltipSimple content="Enter your passphrase to unlock cloud synchronization" side="top">
                <button
                  type="button"
                  onClick={() => setUnlockModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white hover:bg-amber-700 active:scale-[0.98] text-xs font-medium rounded-md transition-all shadow-sm"
                  aria-label="Unlock Vault"
                >
                  <LockOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Unlock Vault</span>
                </button>
              </TooltipSimple>
            ) : (
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
            )}

            {/* E2EE Actions */}
            {isConnected && !isLocked && (
              telemetry.encrypted ? (
                <>
                  <TooltipSimple content="Lock vault and purge decryption keys from active session" side="top">
                    <button
                      type="button"
                      onClick={handleLockVault}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 border border-border bg-background hover:bg-accent text-xs font-medium text-muted-foreground hover:text-foreground rounded-md transition-colors"
                      aria-label="Lock vault"
                    >
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span>Lock</span>
                    </button>
                  </TooltipSimple>

                  <TooltipSimple content="Revert cloud vault to standard unencrypted synchronization" side="top">
                    <button
                      type="button"
                      onClick={() => setDisableDialogOpen(true)}
                      disabled={isDisabling || isSyncing}
                      className="flex items-center justify-center gap-1 px-2.5 py-1.5 border border-border bg-background hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 text-xs font-medium text-muted-foreground rounded-md transition-colors"
                      aria-label="Disable E2EE"
                    >
                      <ShieldOff className="w-3.5 h-3.5 shrink-0" />
                      <span>Disable E2EE</span>
                    </button>
                  </TooltipSimple>
                </>
              ) : (
                <TooltipSimple content="Enable client-side Zero-Knowledge End-to-End Encryption" side="top">
                  <button
                    type="button"
                    onClick={() => setSetupModalOpen(true)}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-md transition-colors"
                    aria-label="Enable E2EE"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Enable E2EE</span>
                  </button>
                </TooltipSimple>
              )
            )}
          </div>

          <span className="text-xxs text-muted-foreground">
            {isLocked ? 'Locked for this session' : 'Auto-sync on change'}
          </span>
        </div>
      </div>

      {/* Passphrase Setup Modal */}
      <EncryptionSetupModal
        open={setupModalOpen}
        onOpenChange={setSetupModalOpen}
      />

      {/* Vault Unlock Modal */}
      <VaultUnlockModal
        open={unlockModalOpen}
        onOpenChange={setUnlockModalOpen}
        onResetVault={handleResetFromUnlock}
      />

      {/* Disable E2EE Confirmation Dialog */}
      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent className="max-w-md bg-popover border border-border p-5 gap-3.5 sm:rounded-lg">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Disable End-to-End Encryption?</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Your cloud vault on Google Drive will be replaced with standard unencrypted JSON. Your spaces and tabs will remain synced across devices.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2 flex items-center justify-end gap-2 sm:space-x-0">
            <button
              type="button"
              onClick={() => setDisableDialogOpen(false)}
              disabled={isDisabling}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDisable}
              disabled={isDisabling}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all disabled:opacity-50"
            >
              {isDisabling ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Disabling…</span>
                </>
              ) : (
                <span>Disable Encryption</span>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SyncSettingsCard;
