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
import { syncEngine } from './sync';
import { rulesEngine } from './rules';

// --- Licensing Provider Registration ---
// Replaces the NullLicensingEngine with the real Pro driver
contractRegistry.registerLicensingProvider(proLicensingEngine);

// --- Sync Provider Registration ---
// Replaces the NullSyncProvider with the real Pro Drive sync driver
contractRegistry.registerSyncProvider(syncEngine);

// --- Rules Provider Registration ---
// Replaces the NullRulesEngine with the real Pro tab automation driver
contractRegistry.registerRulesProvider(rulesEngine);

// --- Feature Slot Registration ---
// Register the LicenseManagerCard component for the Support tab slot
contractRegistry.registerSlot({
  slotId: 'support-tab-license',
  component: () => import('./licensing/components/LicenseManagerCard'),
  order: 0,
});

// Register the SyncSettingsCard component for the Data tab slot
contractRegistry.registerSlot({
  slotId: 'data-tab-sync',
  component: () => import('./sync/components/SyncSettingsCard'),
  order: 10,
});

// Register the RuleManagerCard component for the Behavior tab slot
contractRegistry.registerSlot({
  slotId: 'behavior-tab-rules',
  component: () => import('./rules/components/RuleManagerCard'),
  order: 5,
});

export { proLicensingEngine, syncEngine, rulesEngine };


