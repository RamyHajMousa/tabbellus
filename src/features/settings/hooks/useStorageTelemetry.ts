import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/db';

export interface StorageCounts {
    spaces: number;
    tabs: number;
    readLater: number;
}

export interface StorageTelemetryResult {
    counts: StorageCounts;
    usageFormatted: string;
    isLoading: boolean;
    refresh: () => Promise<void>;
}

export function formatBytes(bytes?: number): string {
    if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) {
        return '< 1 KB';
    }
    const kb = bytes / 1024;
    if (kb < 1) {
        return `${Math.round(bytes)} B`;
    }
    if (kb < 1024) {
        return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
}

export function useStorageTelemetry(): StorageTelemetryResult {
    const [counts, setCounts] = useState<StorageCounts>({ spaces: 0, tabs: 0, readLater: 0 });
    const [usageFormatted, setUsageFormatted] = useState<string>('Calculating...');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const isMountedRef = useRef<boolean>(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const refresh = useCallback(async () => {
        if (!isMountedRef.current) return;
        setIsLoading(true);
        try {
            const [spacesCount, tabsCount, readLaterCount] = await Promise.all([
                db.spaces.count().catch(() => 0),
                db.tabs.count().catch(() => 0),
                db.readLater.count().catch(() => 0),
            ]);

            if (!isMountedRef.current) return;

            let bytesUsed = 0;
            if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
                try {
                    const estimate = await navigator.storage.estimate();
                    bytesUsed = estimate.usage ?? 0;
                } catch {
                    bytesUsed = 0;
                }
            }

            if (!isMountedRef.current) return;

            setCounts({
                spaces: spacesCount,
                tabs: tabsCount,
                readLater: readLaterCount,
            });
            setUsageFormatted(formatBytes(bytesUsed));
        } catch (err) {
            console.warn('Failed to calculate storage telemetry:', err);
            if (isMountedRef.current) {
                setCounts({ spaces: 0, tabs: 0, readLater: 0 });
                setUsageFormatted('< 1 KB');
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { counts, usageFormatted, isLoading, refresh };
}
