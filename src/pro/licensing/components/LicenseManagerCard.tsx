/**
 * License Manager Card
 *
 * Compact in-app activation card for TabBellus Pro.
 * Renders in the Support tab via declarative feature slot registration.
 *
 * States:
 * - Unlicensed: License key input + "Activate Pro" button + checkout link
 * - Licensed: "Pro Active" badge + masked key + deactivate button
 * - Grace period: Licensed state + amber offline indicator
 */

import React, { useState, useCallback } from 'react';
import { Shield, Loader2, ExternalLink } from 'lucide-react';
import { contractRegistry } from '@/core/contracts/registry';
import { useEntitlement } from '@/core/hooks/useEntitlement';
import { useToast } from '@/components/ui/Toaster';
import { TooltipSimple } from '@/components/ui/Tooltip';
import { EXTERNAL_LINKS } from '@/config/links';
import { handleExternalLink } from '@/lib/platform';

/**
 * Masks a license key for display: shows last 4 characters only.
 * Example: "ABCD-EFGH-1234-5678" → "TB-PRO-••••-5678"
 */
function maskLicenseKey(key: string): string {
  if (key.length <= 4) return `TB-PRO-••••-${key}`;
  const lastFour = key.slice(-4);
  return `TB-PRO-••••-${lastFour}`;
}

export const LicenseManagerCard: React.FC = () => {
  const { isPro, gracePeriodActive, loading } = useEntitlement();
  const { toast } = useToast();
  const [licenseKey, setLicenseKey] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const handleActivate = useCallback(async () => {
    if (!licenseKey.trim() || isActivating) return;

    setIsActivating(true);
    try {
      const provider = contractRegistry.getLicensingProvider();
      const result = await provider.validateKey(licenseKey.trim());

      if (result.success) {
        toast('TabBellus Pro activated!', {
          description: 'Thank you for your support.',
        });
        setLicenseKey('');
      } else {
        toast(result.error ?? 'Activation failed.', {
          description: 'Please check your license key and try again.',
        });
      }
    } catch {
      toast('Activation failed due to a connection error.', {
        description: 'Please check your internet connection and try again.',
      });
    } finally {
      setIsActivating(false);
    }
  }, [licenseKey, isActivating, toast]);

  const handleDeactivate = useCallback(async () => {
    if (isDeactivating) return;

    setIsDeactivating(true);
    try {
      const provider = contractRegistry.getLicensingProvider();
      await provider.clearLicense();
      toast('License deactivated.', {
        description: 'You can reactivate at any time with your license key.',
      });
    } catch {
      toast('Deactivation failed.', {
        description: 'Please try again.',
      });
    } finally {
      setIsDeactivating(false);
    }
  }, [isDeactivating, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleActivate();
      }
    },
    [handleActivate],
  );

  // Loading state while hydrating from storage
  if (loading) {
    return (
      <div className="p-3 rounded-lg bg-card border border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="text-xs">Checking license status…</span>
        </div>
      </div>
    );
  }

  // --- Licensed / Active State ---
  if (isPro) {
    return (
      <div className="p-3 rounded-lg bg-card border border-border space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  TabBellus Pro
                </h4>
                <span className="inline-flex items-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5 text-xxs font-semibold">
                  Active
                </span>
              </div>
              <p className="text-xxs font-mono text-muted-foreground mt-0.5">
                {maskLicenseKey(licenseKey || 'PRO')}
              </p>
            </div>
          </div>

          <TooltipSimple content="Deactivate Pro license on this device" side="top">
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={isDeactivating}
              className="text-xxs text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded shrink-0 disabled:opacity-50"
              aria-label="Deactivate license"
            >
              {isDeactivating ? 'Deactivating…' : 'Deactivate'}
            </button>
          </TooltipSimple>
        </div>

        {/* Offline Grace Period Indicator */}
        {gracePeriodActive && (
          <p className="text-xxs text-amber-600 dark:text-amber-500 leading-normal">
            Offline mode — Pro features remain active for up to 7 days without verification.
          </p>
        )}
      </div>
    );
  }

  // --- Unlicensed State ---
  return (
    <div className="p-3 rounded-lg bg-card border border-border space-y-2.5">
      <div className="flex items-start gap-2.5 min-w-0">
        <Shield className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            TabBellus Pro
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
            Unlock advanced features with a Pro license.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter license key"
          disabled={isActivating}
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background transition-colors disabled:opacity-50"
          aria-label="License key input"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleActivate}
            disabled={isActivating || !licenseKey.trim()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground hover:opacity-90 text-xs font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Activate Pro license"
          >
            {isActivating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Activating…</span>
              </>
            ) : (
              <span>Activate Pro</span>
            )}
          </button>

          <TooltipSimple content="Get a TabBellus Pro license" side="top">
            <button
              type="button"
              onClick={() => handleExternalLink(EXTERNAL_LINKS.CHECKOUT)}
              className="flex items-center gap-1 text-xxs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Get a license"
            >
              <span>Get a license</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </button>
          </TooltipSimple>
        </div>
      </div>
    </div>
  );
};
