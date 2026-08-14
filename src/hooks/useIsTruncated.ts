import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Detects whether a text element is visually truncated (CSS `truncate` / `text-overflow: ellipsis`).
 * Returns a callback ref to attach to the element and a boolean indicating truncation state.
 * Uses both ResizeObserver (for layout resizes) and MutationObserver (for title text changes).
 */
export function useIsTruncated<T extends HTMLElement>(): [(node: T | null) => void, boolean] {
    const [isTruncated, setIsTruncated] = useState(false);
    const elementRef = useRef<T | null>(null);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const mutationObserverRef = useRef<MutationObserver | null>(null);

    const ref = useCallback((node: T | null) => {
        // Disconnect old observers
        if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
        }
        if (mutationObserverRef.current) {
            mutationObserverRef.current.disconnect();
            mutationObserverRef.current = null;
        }

        elementRef.current = node;

        if (node) {
            const check = () => {
                let truncated = node.scrollWidth > node.clientWidth;
                if (!truncated) {
                    const descendants = node.querySelectorAll<HTMLElement>('*');
                    for (let i = 0; i < descendants.length; i++) {
                        const el = descendants[i];
                        if (el.scrollWidth > el.clientWidth) {
                            truncated = true;
                            break;
                        }
                    }
                }
                setIsTruncated(truncated);
            };
            check();

            // 1. Observe layout dimensions changes (window resize, container width change)
            const resizeObserver = new ResizeObserver(check);
            resizeObserver.observe(node);
            resizeObserverRef.current = resizeObserver;

            // 2. Observe character/child content changes (when tab title resolves from empty/loading to text)
            const mutationObserver = new MutationObserver(check);
            mutationObserver.observe(node, {
                childList: true,
                characterData: true,
                subtree: true
            });
            mutationObserverRef.current = mutationObserver;
        }
    }, []);

    // Clean up observers on unmount
    useEffect(() => {
        return () => {
            if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
            if (mutationObserverRef.current) mutationObserverRef.current.disconnect();
        };
    }, []);

    return [ref, isTruncated];
}
