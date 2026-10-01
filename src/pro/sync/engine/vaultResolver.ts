/**
 * Vault File Deterministic Canonical Resolver
 *
 * Resolves duplicate vault files in Google Drive appDataFolder deterministically:
 * - Canonical = oldest `createdTime`
 * - Tiebreak = lexicographically smallest `id`
 * - Extras = remaining files
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Consumed only within `src/pro/sync/engine/`.
 */

import type { DriveFileMetadata } from '../api/types';

export interface ResolvedVaultFiles {
  canonical?: DriveFileMetadata;
  extras: DriveFileMetadata[];
}

/**
 * Resolves an array of vault file metadata objects into a single deterministic canonical
 * file and zero or more duplicate extras.
 *
 * @param files - Array of DriveFileMetadata returned by findVaultFile
 * @returns Object containing the canonical file (if any) and array of extras
 */
export function resolveVaultFiles(files: DriveFileMetadata[]): ResolvedVaultFiles {
  if (!files || files.length === 0) {
    return { canonical: undefined, extras: [] };
  }
  const sorted = [...files].sort((a, b) => {
    const timeA = a.createdTime ? Date.parse(a.createdTime) : NaN;
    const timeB = b.createdTime ? Date.parse(b.createdTime) : NaN;

    const hasTimeA = !isNaN(timeA);
    const hasTimeB = !isNaN(timeB);

    if (hasTimeA && hasTimeB) {
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.id.localeCompare(b.id);
    }

    if (hasTimeA && !hasTimeB) {
      return -1;
    }
    if (!hasTimeA && hasTimeB) {
      return 1;
    }

    return a.id.localeCompare(b.id);
  });

  return {
    canonical: sorted[0],
    extras: sorted.slice(1),
  };
}
