import React, { useMemo } from 'react';
import { contractRegistry } from '@/core/contracts/registry';

/**
 * Resolves registered feature slot components for a given slot ID into
 * lazy-loaded React components. Each slot's `component` is expected to be
 * a dynamic-import loader function (`() => import('./SomeCard')`); the
 * loader's default export (or a named export matching the module) is used.
 */
export function useSlotComponents(slotId: string): React.LazyExoticComponent<React.FC>[] {
    return useMemo(() => {
        const slots = contractRegistry.getSlots(slotId);
        return slots
            .filter((slot) => typeof slot.component === 'function')
            .map((slot) => {
                const loader = slot.component as () => Promise<{ default?: React.FC; [key: string]: unknown }>;
                return React.lazy(() =>
                    loader()
                        .then((mod) => ({
                            default: (mod.default ?? Object.values(mod).find((v) => typeof v === 'function') ?? (() => null)) as React.FC,
                        }))
                        .catch(() => ({
                            default: (() => null) as React.FC,
                        })),
                );
            });
    }, [slotId]);
}
