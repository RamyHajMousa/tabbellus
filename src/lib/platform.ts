import { EXTERNAL_LINKS } from '@/config/links';

/**
 * Platform Detection Utility
 * 
 * Handles browser-specific logic to ensure feature compatibility.
 */

/**
 * Checks if the current browser is Microsoft Edge.
 * Edge uses "Edg/" in its user agent string.
 */
export const isEdge = (): boolean => {
    return navigator.userAgent.indexOf("Edg/") > -1;
};

/**
 * Gets the current Operating System.
 */
export const getOS = (): string => {
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf("Win") !== -1) return "Windows";
    if (userAgent.indexOf("Mac") !== -1) return "MacOS";
    if (userAgent.indexOf("Linux") !== -1) return "Linux";
    return "Unknown";
};

/**
 * Gets the browser version.
 */
export const getBrowserVersion = (): string => {
    const userAgent = navigator.userAgent;
    // Check for Edge first (Edg/)
    const edgeMatch = userAgent.match(/Edg\/(\d+(\.\d+)*)/);
    if (edgeMatch) return edgeMatch[1];

    // Check for Chrome (Chrome/)
    const chromeMatch = userAgent.match(/Chrome\/(\d+(\.\d+)*)/);
    if (chromeMatch) return chromeMatch[1];

    return "Unknown";
};

/**
 * Opens the browser's appearance settings in a new tab.
 * This is used for changing sidebar position, theme, etc.
 * 
 * Note: Chrome specific URL.
 */
export const openAppearanceSettings = () => {
    if (isEdge()) {
        console.warn("Sidebar settings are not available via this link in Edge.");
        return;
    }

    chrome.tabs.create({ url: "chrome://settings/appearance" }).catch(() => {});
};

/**
 * Safely opens an external URL in a new tab.
 * 
 * @param url - The URL to open.
 */
export const handleExternalLink = (url: string) => {
    if (!url || url.includes("INSERT_ID_HERE")) {
        console.warn("Attempted to open a placeholder link.");
        return;
    }
    chrome.tabs.create({ url, active: true }).catch(() => {});
};

/**
 * Opens the Support Hub with diagnostic attributes (Version, Browser, OS, Stats).
 */
export const openSupportHub = async () => {
    try {
        const version = chrome.runtime.getManifest().version;
        const browser = isEdge() ? "Edge" : "Chrome";
        const browserVersion = getBrowserVersion();
        const os = getOS();

        // Get live browser state
        const windows = await chrome.windows.getAll();
        const tabs = await chrome.tabs.query({});

        const url = new URL(EXTERNAL_LINKS.SUPPORT);
        url.searchParams.append("v", version);
        url.searchParams.append("browser", browser);
        url.searchParams.append("browserV", browserVersion);
        url.searchParams.append("os", os);
        url.searchParams.append("windows", windows.length.toString());
        url.searchParams.append("tabs", tabs.length.toString());

        chrome.tabs.create({ url: url.toString(), active: true }).catch(() => {});
    } catch (e) {
        console.warn('Failed to open Support Hub:', e);
        chrome.tabs.create({ url: EXTERNAL_LINKS.SUPPORT, active: true }).catch(() => {});
    }
};
