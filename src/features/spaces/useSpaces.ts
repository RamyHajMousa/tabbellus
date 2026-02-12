import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

/**
 * Hook to retrieve all active (non-deleted) spaces, ordered by creation time (LIFO).
 */
export function useSpaces() {
    return useLiveQuery(async () => {
        const spaces = await db.spaces
            .filter((space) => !space.deletedAt)
            .toArray();

        return spaces.sort((a, b) => {
            // 1. Pinned first
            const aPinned = a.isPinned ? 1 : 0;
            const bPinned = b.isPinned ? 1 : 0;

            if (aPinned !== bPinned) {
                return bPinned - aPinned;
            }

            // 2. Newest first
            return b.createdAt - a.createdAt;
        });
    });
}
