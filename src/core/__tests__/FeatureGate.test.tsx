import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FeatureGate } from '../components/FeatureGate';
import { contractRegistry } from '../contracts/registry';
import type { LicensingContract } from '../contracts';

describe('FeatureGate Component', () => {
  beforeEach(() => {
    contractRegistry.reset();
  });

  it('renders fallback when unentitled (default NullLicensingEngine)', () => {
    const html = renderToString(
      <FeatureGate fallback={<span data-testid="fallback">Upgrade to Pro</span>}>
        <div data-testid="pro-content">Pro Secret Features</div>
      </FeatureGate>
    );

    // In SSR / initial render, unentitled fallback or loadingFallback is evaluated
    expect(html).toContain('Upgrade to Pro');
    expect(html).not.toContain('Pro Secret Features');
  });

  it('renders children when entitled to Pro', () => {
    const proProvider: LicensingContract = {
      getEntitlement: vi.fn().mockResolvedValue({ isPro: true, tier: 'pro' }),
      validateKey: vi.fn().mockResolvedValue({ success: true }),
      clearLicense: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((cb) => {
        cb({ isPro: true, tier: 'pro' });
        return () => {};
      }),
    };
    contractRegistry.registerLicensingProvider(proProvider);

    const html = renderToString(
      <FeatureGate fallback={<span>Fallback</span>}>
        <div>Unlocked Pro Features</div>
      </FeatureGate>
    );

    expect(html).toContain('Unlocked Pro Features');
    expect(html).not.toContain('Fallback');
  });

  it('enforces enterprise tier requirement', () => {
    // Pro user attempting to access Enterprise gated feature
    const proProvider: LicensingContract = {
      getEntitlement: vi.fn().mockResolvedValue({ isPro: true, tier: 'pro' }),
      validateKey: vi.fn().mockResolvedValue({ success: true }),
      clearLicense: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((cb) => {
        cb({ isPro: true, tier: 'pro' });
        return () => {};
      }),
    };
    contractRegistry.registerLicensingProvider(proProvider);

    const proHtml = renderToString(
      <FeatureGate
        requires="enterprise"
        fallback={<span>Enterprise License Required</span>}
      >
        <div>Enterprise Grid Console</div>
      </FeatureGate>
    );

    expect(proHtml).toContain('Enterprise License Required');
    expect(proHtml).not.toContain('Enterprise Grid Console');

    // Upgrade to enterprise provider
    const enterpriseProvider: LicensingContract = {
      getEntitlement: vi.fn().mockResolvedValue({ isPro: true, tier: 'enterprise' }),
      validateKey: vi.fn().mockResolvedValue({ success: true }),
      clearLicense: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn((cb) => {
        cb({ isPro: true, tier: 'enterprise' });
        return () => {};
      }),
    };
    contractRegistry.registerLicensingProvider(enterpriseProvider);

    const enterpriseHtml = renderToString(
      <FeatureGate
        requires="enterprise"
        fallback={<span>Enterprise License Required</span>}
      >
        <div>Enterprise Grid Console</div>
      </FeatureGate>
    );

    expect(enterpriseHtml).toContain('Enterprise Grid Console');
    expect(enterpriseHtml).not.toContain('Enterprise License Required');
  });

  it('renders null when unentitled and no fallback is provided', () => {
    const html = renderToString(
      <FeatureGate>
        <div>Secret Content</div>
      </FeatureGate>
    );

    expect(html).toBe('');
  });

  it('handles loading fallback when provider is resolving', () => {
    // A provider with a delayed subscription
    const asyncProvider: LicensingContract = {
      getEntitlement: vi.fn().mockReturnValue(new Promise(() => {})),
      validateKey: vi.fn(),
      clearLicense: vi.fn(),
      subscribe: vi.fn(() => () => {}),
    };
    contractRegistry.registerLicensingProvider(asyncProvider);

    const html = renderToString(
      <FeatureGate
        loadingFallback={<span>Loading entitlement status...</span>}
        fallback={<span>Upgrade Now</span>}
      >
        <div>Pro Content</div>
      </FeatureGate>
    );

    expect(html).toContain('Loading entitlement status...');
    expect(html).not.toContain('Pro Content');
  });
});
