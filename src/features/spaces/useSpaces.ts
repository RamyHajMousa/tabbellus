import { useLiveQuery } from 'dexie-react-hooks';
import { spaceService } from '@/lib/spaceService';

/**
 * Hook to retrieve all active (non-deleted) spaces, ordered by creation time (LIFO).
 */
export function useSpaces() {
    return useLiveQuery(spaceService.getSpacesOrderedQuery());
}
