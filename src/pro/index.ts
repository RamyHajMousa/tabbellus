/**
 * TabBellus Pro Isolated Subsystem Root
 *
 * Bootstraps Pro modules and registers them into the Core Contract Registry.
 * ZERO-CONTAMINATION BOUNDARY: Free core must never statically import from here.
 *
 * This module performs side-effectful registration when imported:
 * 1. Registers ProLicensingEngine as the active licensing provider
 * 2. Registers the LicenseManagerCard UI into the 'support-tab-license' slot
 */

import { contractRegistry } from '@/core/contracts/registry';
import { proLicensingEngine } from './licensing';

// --- Licensing Provider Registration ---
// Replaces the NullLicensingEngine with the real Pro driver
contractRegistry.registerLicensingProvider(proLicensingEngine);

// --- Feature Slot Registration ---
// Register the LicenseManagerCard component for the Support tab slot
contractRegistry.registerSlot({
  slotId: 'support-tab-license',
  component: () => import('./licensing/components/LicenseManagerCard'),
  order: 0,
});

export { proLicensingEngine };
