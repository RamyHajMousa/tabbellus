import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

/**
 * Hook to retrieve all active (non-deleted) spaces, ordered by creation time (LIFO).
 */
export function useSpaces() {
    return useLiveQuery(() => {
        return db.spaces
            .filter((space) => !space.deletedAt)
            .reverse()
            .sortBy('createdAt');
    });
}
