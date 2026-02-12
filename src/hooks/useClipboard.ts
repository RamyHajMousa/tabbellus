import { useState, useCallback } from 'react';

interface UseClipboardReturn {
    hasCopied: boolean;
    copy: (text: string) => Promise<boolean>;
}

/**
 * Hook to copy text to clipboard and show a temporary success state.
 * @param timeout Duration in ms to show the success state (default: 2000)
 */
export const useClipboard = (timeout = 2000): UseClipboardReturn => {
    const [hasCopied, setHasCopied] = useState(false);

    const copy = useCallback(async (text: string) => {
        if (!navigator?.clipboard) {
            console.warn('Clipboard not supported');
            return false;
        }

        try {
            await navigator.clipboard.writeText(text);
            setHasCopied(true);

            setTimeout(() => {
                setHasCopied(false);
            }, timeout);

            return true;
        } catch (error) {
            console.warn('Copy failed', error);
            setHasCopied(false);
            return false;
        }
    }, [timeout]);

    return { hasCopied, copy };
};
