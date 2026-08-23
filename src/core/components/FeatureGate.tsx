/**
 * TabBellus Core FeatureGate Component
 *
 * Declarative gating wrapper that conditionally renders children or a fallback
 * based on the active entitlement status provided by the Core Contract Registry.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Does NOT import or contain Pro business logic.
 * - Gating is driven strictly by Core contracts and reactive hooks.
 */

import React from 'react';
import { useEntitlement } from '../hooks/useEntitlement';

export interface FeatureGateProps {
  /**
   * Tier required to unlock the gated content.
   * @default 'pro'
   */
  requires?: 'pro' | 'enterprise';

  /**
   * Optional fallback UI to render when the user is unentitled.
   */
  fallback?: React.ReactNode;

  /**
   * Optional UI to render while resolving entitlement status.
   */
  loadingFallback?: React.ReactNode;

  /**
   * Content displayed when the user is entitled.
   */
  children: React.ReactNode;
}

export function FeatureGate({
  requires = 'pro',
  fallback = null,
  loadingFallback = null,
  children,
}: FeatureGateProps): React.ReactNode {
  const { isPro, tier, loading } = useEntitlement();

  if (loading) {
    return loadingFallback !== undefined ? <>{loadingFallback}</> : null;
  }

  const isEntitled = React.useMemo(() => {
    if (!isPro) return false;
    if (requires === 'enterprise') {
      return tier === 'enterprise';
    }
    return tier === 'pro' || tier === 'enterprise';
  }, [isPro, tier, requires]);

  if (isEntitled) {
    return <>{children}</>;
  }

  return fallback !== undefined ? <>{fallback}</> : null;
}
