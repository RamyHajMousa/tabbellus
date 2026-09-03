/**
 * Vault Unlock Modal
 *
 * Controlled Radix Dialog prompting for the vault passphrase when
 * cloud synchronization discovers an encrypted remote vault on a new device
 * or after an active session key has expired or been locked.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Isolated Pro UI component.
 * - Free Core never imports this file directly.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toaster';
import { syncEngine } from '../engine/syncEngine';
import { validateUnlockDraft } from './unlockModalLogic';

export interface VaultUnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResetVault?: () => void;
}

export const VaultUnlockModal: React.FC<VaultUnlockModalProps> = ({
  open,
  onOpenChange,
  onResetVault,
}) => {
  const { toast } = useToast();
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Reset fields when dialog opens
  useEffect(() => {
    if (open) {
      setPassphrase('');
      setShowPassphrase(false);
      setIsSubmitting(false);
      setErrorMessage(null);
      setShowEmergency(false);
      setConfirmReset(false);
    }
  }, [open]);

  const handleUnlock = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting) return;

    const validation = validateUnlockDraft(passphrase);
    if (!validation.isValid) {
      setErrorMessage(validation.error ?? 'Passphrase is required.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const success = await syncEngine.unlockVault(passphrase);
      if (success) {
        toast('Vault Unlocked', {
          description: 'Cloud synchronization has resumed.',
        });
        onOpenChange(false);
      } else {
        setErrorMessage('Incorrect passphrase. Please check and try again.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unlock failed';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, passphrase, onOpenChange, toast]);

  const handleEmergencyReset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    // Double confirmation received
    onOpenChange(false);
    onResetVault?.();
  }, [confirmReset, onOpenChange, onResetVault]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-popover border border-border p-5 gap-3.5 sm:rounded-lg">
        {/* Header */}
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Unlock Encrypted Vault</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Enter your passphrase to resume Google Drive synchronization on this device.
          </DialogDescription>
        </DialogHeader>

        {/* Form Controls */}
        <form onSubmit={handleUnlock} className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground block">
              Passphrase
            </label>
            <div className="relative">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                disabled={isSubmitting}
                placeholder="Enter your vault passphrase"
                className="h-8 text-xs bg-background border border-border rounded-md px-2.5 pr-8 w-full text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-transparent transition-colors"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                tabIndex={-1}
                aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassphrase ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Inline Error Feedback */}
          {errorMessage && (
            <div className="text-xxs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Dialog Footer Actions */}
          <DialogFooter className="pt-2 flex items-center justify-end gap-2 sm:space-x-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || passphrase.length === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Unlocking…</span>
                </>
              ) : (
                <>
                  <LockOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>Unlock & Sync</span>
                </>
              )}
            </button>
          </DialogFooter>
        </form>

        {/* Emergency Section ("Forgot Passphrase?") */}
        <div className="pt-2 border-t border-border/60">
          <button
            type="button"
            onClick={() => {
              setShowEmergency(!showEmergency);
              setConfirmReset(false);
            }}
            className="text-xxs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <span>Lost your passphrase?</span>
            {showEmergency ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {showEmergency && (
            <div className="mt-2 p-2.5 rounded bg-destructive/5 border border-destructive/20 text-xxs space-y-2">
              <p className="text-muted-foreground leading-normal">
                Because encryption is zero-knowledge, TabBellus cannot recover your passphrase.
                Resetting will overwrite your cloud vault with the data currently saved on this device.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleEmergencyReset}
                  className={`px-2.5 py-1 text-xxs font-medium rounded transition-colors border ${
                    confirmReset
                      ? 'bg-destructive text-destructive-foreground border-destructive'
                      : 'text-destructive border-destructive/30 hover:bg-destructive/10'
                  }`}
                >
                  {confirmReset
                    ? 'Confirm: Click again to reset and overwrite cloud vault'
                    : 'Reset Cloud Vault'}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
