let isLocked = false;

function beforeUnloadHandler(e: BeforeUnloadEvent) {
    if (!isLocked) return;
    e.preventDefault();
    e.returnValue = '';
}

function clickHandler(e: MouseEvent) {
    if (!isLocked) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const anchor = target.closest('a');
    if (!anchor) return;

    const rawHref = anchor.getAttribute('href') || '';
    const hrefLower = rawHref.trim().toLowerCase();

    // Ignore anchors, javascript execute blocks, and mailto links to preserve SPA behavior
    if (
        !rawHref ||
        rawHref.startsWith('#') ||
        hrefLower.startsWith('javascript:') ||
        hrefLower.startsWith('mailto:')
    ) {
        return;
    }

    // Intercept hard/external navigation attempts when locked
    e.preventDefault();
    e.stopPropagation();

    window.open(anchor.href, '_blank', 'noopener,noreferrer');
}

function setLockState(locked: boolean) {
    if (isLocked === locked) return;
    isLocked = locked;

    if (isLocked) {
        window.addEventListener('beforeunload', beforeUnloadHandler);
        document.addEventListener('click', clickHandler, true);
    } else {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        document.removeEventListener('click', clickHandler, true);
    }
}

// Runtime message listener for dynamic state updates from extension UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'SET_TAB_LOCK') {
        setLockState(Boolean(message.isLocked));
        sendResponse({ success: true, isLocked });
    }
});

// Hydrate state on content script load (e.g. after page refresh)
chrome.runtime.sendMessage({ action: 'GET_TAB_LOCK_STATE' }, (response) => {
    if (chrome.runtime.lastError) {
        return;
    }
    if (response && typeof response.isLocked === 'boolean') {
        setLockState(response.isLocked);
    }
});
