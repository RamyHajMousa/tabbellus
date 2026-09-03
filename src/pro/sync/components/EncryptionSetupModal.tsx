/**
 * Encryption Setup Modal
 *
 * Controlled Radix Dialog guiding the user through passphrase creation,
 * live strength validation, and initial E2EE cloud vault encryption.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Isolated Pro UI component.
 * - Free Core never imports this file directly.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  Eye,
  EyeOff,
  Loader2,
  Lock,
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
import {
  calculatePassphraseStrength,
  validateSetupDraft,
} from './encryptionModalLogic';

export interface EncryptionSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EncryptionSetupModal: React.FC<EncryptionSetupModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset fields when dialog opens
  useEffect(() => {
    if (open) {
      setPassphrase('');
      setConfirmPassphrase('');
      setShowPassphrase(false);
      setShowConfirm(false);
      setIsSubmitting(false);
      setValidationError(null);
    }
  }, [open]);

  const strength = calculatePassphraseStrength(passphrase);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting) return;

    const validation = validateSetupDraft(passphrase, confirmPassphrase);
    if (!validation.isValid) {
      setValidationError(validation.error ?? 'Invalid passphrase');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      await syncEngine.setupEncryption(passphrase);
      toast('Cloud Vault Encrypted', {
        description: 'E2EE is now active. Spaces and tabs are encrypted client-side.',
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Encryption setup failed';
      toast('Encryption Failed', {
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, passphrase, confirmPassphrase, onOpenChange, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-popover border border-border p-5 gap-3.5 sm:rounded-lg">
        {/* Header */}
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Enable Zero-Knowledge E2E Encryption</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Encrypt your spaces and tabs with AES-GCM-256 before uploading to Google Drive.
          </DialogDescription>
        </DialogHeader>

        {/* Zero-Knowledge Disclaimer Warning Box */}
        <div className="bg-muted/50 border border-border rounded-md p-2.5 text-xxs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Zero-Knowledge Notice</span>
          </div>
          <p className="leading-normal">
            TabBellus has no master recovery key and cannot reset a forgotten passphrase. If you lose this passphrase, your encrypted cloud data cannot be restored.
          </p>
        </div>

        {/* Form Controls */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-0.5">
          {/* Passphrase Input */}
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
                  if (validationError) setValidationError(null);
                }}
                disabled={isSubmitting}
                placeholder="Enter a strong passphrase (min. 8 chars)"
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

            {/* Strength Meter */}
            {passphrase.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex gap-1 h-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 rounded-full transition-all ${
                        strength.score >= step
                          ? strength.colorClass
                          : 'bg-zinc-200 dark:bg-zinc-800'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xxs text-muted-foreground flex justify-between">
                  <span>Strength:</span>
                  <span className="font-medium text-foreground">{strength.label}</span>
                </p>
              </div>
            )}
          </div>

          {/* Confirm Passphrase Input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground block">
              Confirm Passphrase
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassphrase}
                onChange={(e) => {
                  setConfirmPassphrase(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                disabled={isSubmitting}
                placeholder="Re-enter your passphrase"
                className="h-8 text-xs bg-background border border-border rounded-md px-2.5 pr-8 w-full text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-transparent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide confirmed passphrase' : 'Show confirmed passphrase'}
              >
                {showConfirm ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Validation Error Feedback */}
          {validationError && (
            <div className="text-xxs text-destructive bg-destructive/10 border border-destructive/20 rounded p-2 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Dialog Footer */}
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
              disabled={isSubmitting}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98] text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Encrypting…</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Encrypt Cloud Vault</span>
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
