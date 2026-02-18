import { useRef, useState, useEffect, type RefObject } from 'react';

/**
 * Detects whether a text element is visually truncated (CSS `truncate` / `text-overflow: ellipsis`).
 * Returns a ref to attach to the element and a boolean indicating truncation state.
 */
export function useIsTruncated<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
    const ref = useRef<T>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
        check();

        const observer = new ResizeObserver(check);
        observer.observe(el);
        return () => observer.disconnect();
    });

    return [ref, isTruncated];
}
